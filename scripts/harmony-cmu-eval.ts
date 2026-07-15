import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import {
  analyzeHarmonyRules,
  chordSymbolSchema,
  compareMoments,
  createHarmonyAnalysisInput,
  type ChordSymbolInput,
} from "../packages/web-core/src/index";
import {
  isPitchedMidiNote,
  parseCmuChordLabel,
  parseStandardMidi,
  projectMidiNoteToWindow,
  type CmuChordLabel,
  type MidiHarmonyNote,
} from "./cmuCmaParser";
import { generateOracleCandidates } from "./harmonyOracleCandidates";
import { weightedFraction } from "./harmonyWeightedMetrics";

type Manifest = {
  source: string;
  sha256: string;
  license: string;
  citation: string;
  subset: string;
  eventsWithChordLabels: number;
};
type DatasetSplit = "train" | "tune" | "eval";
type EvaluationResult = {
  groupId: string;
  expected: ChordSymbolInput;
  resolved: boolean;
  correct: boolean;
  top8: boolean;
  confidence: number;
  durationMs: number;
  facets: {
    root: boolean;
    bass: boolean;
    kind: boolean;
    extension: boolean;
    alterations: boolean;
  };
};
type BoundaryResult = { groupId: string; predicted: ReadonlySet<number>; expected: ReadonlySet<number> };

const manifest = JSON.parse(
  await readFile(new URL("../test-fixtures/harmony/cmu-cma-manifest.json", import.meta.url), "utf8"),
) as Manifest;
const archivePath = process.argv[2] ?? process.env.HARMONY_CMU_ZIP;
const archive = archivePath
  ? await readFile(archivePath)
  : new Uint8Array(await (await fetch(manifest.source)).arrayBuffer());
const digest = createHash("sha256").update(archive).digest("hex");
if (digest !== manifest.sha256) throw new Error(`CMU CMA archive checksum mismatch: ${digest}`);
const entries = unzipSync(archive);
const chordFiles = Object.keys(entries).filter((name) => /^test\/.+_chord\.txt$/.test(name));
if (chordFiles.length === 0) throw new Error("CMU CMA chord files missing");

let unsupportedLabels = 0;
let noChordEvents = 0;
let emptyNoteEvents = 0;
const boundaryResults: BoundaryResult[] = [];
const results: EvaluationResult[] = [];

for (const chordFile of chordFiles.sort()) {
  const groupId = chordFile.slice("test/".length, -"_chord.txt".length);
  const midiBytes = entries[`test/${groupId}.mid`];
  if (!midiBytes) continue;
  const notes = parseStandardMidi(midiBytes).filter(isPitchedMidiNote);
  const parsed = parseLabelRows(new TextDecoder().decode(entries[chordFile]!));
  unsupportedLabels += parsed.unsupported;
  noChordEvents += parsed.labels.filter((entry) => entry.chord === null).length;
  const labels = parsed.labels.filter(
    (entry): entry is CmuChordLabel & { chord: ChordSymbolInput } => entry.chord !== null,
  );
  if (labels.length === 0) continue;
  const maxEndMs = Math.max(labels.at(-1)!.startMs + 1000, ...notes.map((note) => note.endMs));
  const input = createHarmonyInput(labels, notes, maxEndMs, groupId);
  const analysisNotes = input.tracks.flatMap((track) => track.staves.flatMap((staff) => staff.notes));
  emptyNoteEvents += labels.filter((_, index) => notesForLabel(labels, notes, index, maxEndMs).length === 0).length;
  const segments = analyzeHarmonyRules(input, {
    includedTrackIds: ["cmu"],
    topK: 8,
    decisionThreshold: 0,
    maxOptionalBoundariesPerMeasure: 0,
  });
  boundaryResults.push({
    groupId,
    predicted: new Set(segments.slice(1).map((segment) => segment.range.start.measureIndex)),
    expected: new Set(
      labels
        .slice(1)
        .flatMap((label, index) =>
          JSON.stringify(label.chord) === JSON.stringify(labels[index]!.chord) ? [] : [index + 1],
        ),
    ),
  });
  for (const [measureIndex, label] of labels.entries()) {
    const moment = { measureIndex, offsetTicks: 0 };
    const alternatives = generateOracleCandidates({
      ticksPerQuarter: input.ticksPerQuarter,
      range: { start: moment, end: { measureIndex, offsetTicks: 480 } },
      notes: analysisNotes,
    });
    const segment = segments.find(
      (candidate) =>
        compareMoments(candidate.range.start, moment) <= 0 && compareMoments(moment, candidate.range.end) < 0,
    );
    const resolved = segment?.status === "resolved";
    results.push({
      groupId,
      expected: label.chord,
      resolved,
      correct: resolved && JSON.stringify(segment.chord) === JSON.stringify(label.chord),
      top8: alternatives.some((candidate) => JSON.stringify(candidate.chord) === JSON.stringify(label.chord)),
      confidence: resolved ? segment.confidence : 0,
      durationMs: (labels[measureIndex + 1]?.startMs ?? maxEndMs) - label.startMs,
      facets: {
        root: resolved && JSON.stringify(segment.chord.root) === JSON.stringify(label.chord.root),
        bass: resolved && JSON.stringify(segment.chord.bass) === JSON.stringify(label.chord.bass),
        kind: resolved && segment.chord.kind === label.chord.kind,
        extension: resolved && segment.chord.extension === label.chord.extension,
        alterations: resolved && JSON.stringify(segment.chord.degrees) === JSON.stringify(label.chord.degrees),
      },
    });
  }
}

const evalResults = results.filter((result) => splitFor(result.groupId) === "eval");
const resolved = evalResults.filter((result) => result.resolved);
const calibration = createCalibrationModel(results.filter((result) => splitFor(result.groupId) === "train"));
const report = {
  corpus: {
    name: "cmu-computer-music-analysis-chord-test",
    source: manifest.source,
    license: manifest.license,
    files: chordFiles.length,
    totalCases: results.length,
    noChordEvents,
    emptyNoteEvents,
    unsupportedLabels,
    splits: countSplits(results),
  },
  metrics: {
    top8OracleRecall: ratio(evalResults.filter((result) => result.top8).length, evalResults.length),
    resolvedPrecision: weightedFraction(
      resolved,
      (result) => result.correct,
      (result) => result.durationMs,
    ),
    resolvedCoverage: weightedFraction(
      evalResults,
      (result) => result.resolved,
      (result) => result.durationMs,
    ),
    boundaryF1: calculateBoundaryF1(boundaryResults.filter((result) => splitFor(result.groupId) === "eval")),
    expectedCalibrationError: calibrationError(evalResults, calibration),
    facets: {
      root: weightedFraction(
        resolved,
        (result) => result.facets.root,
        (result) => result.durationMs,
      ),
      bass: weightedFraction(
        resolved,
        (result) => result.facets.bass,
        (result) => result.durationMs,
      ),
      kind: weightedFraction(
        resolved,
        (result) => result.facets.kind,
        (result) => result.durationMs,
      ),
      extension: weightedFraction(
        resolved,
        (result) => result.facets.extension,
        (result) => result.durationMs,
      ),
      alterations: weightedFraction(
        resolved,
        (result) => result.facets.alterations,
        (result) => result.durationMs,
      ),
    },
  },
  citation: manifest.citation,
};
console.log(JSON.stringify(report, null, 2));

function parseLabelRows(text: string): { labels: CmuChordLabel[]; unsupported: number } {
  let unsupported = 0;
  const labels = text
    .trim()
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = /^(\d+(?:\.\d+)?)\s+(.+?)\s*$/.exec(line);
      if (!match) return [];
      try {
        return [{ startMs: Number(match[1]), label: match[2]!, chord: parseCmuChordLabel(match[2]!) }];
      } catch {
        unsupported += 1;
        return [];
      }
    });
  return { labels, unsupported };
}

function createHarmonyInput(
  labels: readonly CmuChordLabel[],
  notes: readonly MidiHarmonyNote[],
  maxEndMs: number,
  groupId: string,
) {
  return createHarmonyAnalysisInput({
    ticksPerQuarter: 480,
    measures: labels.map((_, index) => ({
      index,
      durationTicks: 480,
      timeSignature: { numerator: 4, denominator: 4 },
    })),
    tracks: [
      {
        id: "cmu",
        name: `CMU CMA ${groupId}`,
        isPercussion: false,
        hasPitches: true,
        staves: [
          {
            index: 0,
            notes: labels.flatMap((label, measureIndex) => {
              const endMs = labels[measureIndex + 1]?.startMs ?? maxEndMs;
              return notesForLabel(labels, notes, measureIndex, maxEndMs).flatMap((note, noteIndex) => {
                const projected = projectMidiNoteToWindow(note, label.startMs, endMs, 480);
                return projected
                  ? [
                      {
                        id: `${groupId}:${measureIndex}:${noteIndex}`,
                        moment: { measureIndex, offsetTicks: projected.offsetTicks },
                        durationTicks: projected.durationTicks,
                        soundingPitchClass: note.midi % 12,
                        soundingMidi: note.midi,
                        voice: note.channel + 1,
                      },
                    ]
                  : [];
              });
            }),
          },
        ],
      },
    ],
  });
}

function notesForLabel(
  labels: readonly CmuChordLabel[],
  notes: readonly MidiHarmonyNote[],
  index: number,
  maxEndMs: number,
): MidiHarmonyNote[] {
  const startMs = labels[index]!.startMs;
  const endMs = labels[index + 1]?.startMs ?? maxEndMs;
  return notes.filter((note) => note.endMs > startMs && note.startMs < endMs);
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function calculateBoundaryF1(groups: readonly BoundaryResult[]): number {
  const counts = groups.reduce(
    (total, group) => {
      total.truePositive += [...group.predicted].filter((boundary) => group.expected.has(boundary)).length;
      total.predicted += group.predicted.size;
      total.expected += group.expected.size;
      return total;
    },
    { truePositive: 0, predicted: 0, expected: 0 },
  );
  const precision = ratio(counts.truePositive, counts.predicted);
  const recall = ratio(counts.truePositive, counts.expected);
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

function calibrationError(
  results: readonly { confidence: number; correct: boolean; durationMs: number }[],
  calibration: (confidence: number) => number,
): number {
  const bins = Array.from({ length: 10 }, () => ({ confidence: 0, accuracy: 0, durationMs: 0 }));
  const totalDurationMs = results.reduce((sum, result) => sum + result.durationMs, 0);
  for (const result of results) {
    const confidence = calibration(result.confidence);
    const bin = bins[Math.min(9, Math.floor(confidence * 10))]!;
    bin.confidence += confidence * result.durationMs;
    bin.accuracy += Number(result.correct) * result.durationMs;
    bin.durationMs += result.durationMs;
  }
  return bins.reduce(
    (sum, bin) =>
      sum +
      (bin.durationMs === 0
        ? 0
        : (bin.durationMs / (totalDurationMs || 1)) *
          Math.abs(bin.confidence / bin.durationMs - bin.accuracy / bin.durationMs)),
    0,
  );
}

function splitFor(groupId: string): DatasetSplit {
  const bucket = [...groupId].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) % 5, 0);
  return bucket === 0 ? "eval" : bucket === 1 ? "tune" : "train";
}

function countSplits(results: readonly { groupId: string }[]): Record<DatasetSplit, number> {
  return results.reduce(
    (counts, result) => {
      counts[splitFor(result.groupId)] += 1;
      return counts;
    },
    { train: 0, tune: 0, eval: 0 },
  );
}

function createCalibrationModel(
  results: readonly { confidence: number; correct: boolean; durationMs: number }[],
): (confidence: number) => number {
  const bins = Array.from({ length: 10 }, () => ({ correctDurationMs: 0, durationMs: 0 }));
  for (const result of results) {
    const bin = bins[Math.min(9, Math.floor(result.confidence * 10))]!;
    bin.correctDurationMs += Number(result.correct) * result.durationMs;
    bin.durationMs += result.durationMs;
  }
  return (confidence) => {
    const bin = bins[Math.min(9, Math.floor(confidence * 10))]!;
    return bin.durationMs === 0 ? confidence : bin.correctDurationMs / bin.durationMs;
  };
}
