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

type Manifest = { source: string; sha256: string; license: string; citation: string; events: number };

const manifest = JSON.parse(
  await readFile(new URL("../test-fixtures/harmony/uci-bach-manifest.json", import.meta.url), "utf8"),
) as Manifest;
const archivePath = process.argv[2] ?? process.env.HARMONY_UCI_ZIP;
const archive = archivePath
  ? await readFile(archivePath)
  : new Uint8Array(await (await fetch(manifest.source)).arrayBuffer());
const digest = createHash("sha256").update(archive).digest("hex");
if (digest !== manifest.sha256) throw new Error(`UCI archive checksum mismatch: ${digest}`);
const data = unzipSync(archive)["jsbach_chorals_harmony.data"];
if (!data) throw new Error("UCI data file missing");

const pitchClassByStep = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const;
type PitchStep = keyof typeof pitchClassByStep;
type UciEvent = { id: string; expected: ReturnType<typeof chordSymbolSchema.parse>; pitchClasses: number[] };
const events = new TextDecoder()
  .decode(data)
  .trim()
  .split(/\r?\n/)
  .flatMap((line) => {
    const columns = line.split(",").map((value) => value.trim());
    const label = columns[16];
    const match = /^([A-G](?:#|b)?)(?:_)?([Mmd])([467])?$/.exec(label ?? "");
    if (!match) return [];
    const pitchClasses = columns.slice(2, 14).flatMap((value, index) => (value === "YES" ? [index] : []));
    if (pitchClasses.length === 0) return [];
    const root = pitchNameToPitch(match[1]!);
    const bass = pitchNameToPitch(columns[14]!);
    const figure = match[3] === undefined ? undefined : Number(match[3]);
    const expected: ChordSymbolInput = {
      root: { step: root.step, alter: root.alter },
      kind: match[2] === "M" ? "major" : match[2] === "m" ? "minor" : "diminished",
      degrees: figure === 4 ? [{ operation: "add", value: 4, alter: 0 }] : [],
      ...(figure === 6 || figure === 7 ? { extension: figure } : {}),
      ...(bass.pitchClass !== root.pitchClass ? { bass: { step: bass.step, alter: bass.alter } } : {}),
    };
    return [{ id: `${columns[0]}:${columns[1]}`, expected: chordSymbolSchema.parse(expected), pitchClasses }];
  });

const groups = new Map<string, UciEvent[]>();
for (const event of events)
  groups.set(event.id.split(":")[0]!, [...(groups.get(event.id.split(":")[0]!) ?? []), event]);
const results = [...groups.entries()].flatMap(([groupId, group]) => {
  const input = createHarmonyAnalysisInput({
    ticksPerQuarter: 480,
    measures: group.map((_, index) => ({
      index,
      durationTicks: 480,
      timeSignature: { numerator: 4, denominator: 4 },
    })),
    tracks: [
      {
        id: "bach",
        name: "Bach Choral Harmony",
        isPercussion: false,
        staves: [
          {
            index: 0,
            notes: group.flatMap((event, measureIndex) =>
              event.pitchClasses.map((pitchClass, noteIndex) => ({
                id: `${event.id}:${noteIndex}`,
                moment: { measureIndex, offsetTicks: 0 },
                durationTicks: 480,
                soundingPitchClass: pitchClass,
                soundingMidi: pitchClass === chordBassPitchClass(event.expected) ? 36 : 60 + pitchClass,
                voice: noteIndex + 1,
              })),
            ),
          },
        ],
      },
    ],
  });
  const segments = analyzeHarmonyRules(input, { includedTrackIds: ["bach"], topK: 8, decisionThreshold: 0 });
  return group.map((event, measureIndex) => {
    const start = { measureIndex, offsetTicks: 0 };
    const segment = segments.find(
      (candidate) =>
        compareMoments(candidate.range.start, start) <= 0 && compareMoments(start, candidate.range.end) < 0,
    );
    const alternatives = segment?.alternatives ?? [];
    return {
      groupId,
      expected: event.expected,
      resolved: segment?.status === "resolved",
      correct: segment?.status === "resolved" && JSON.stringify(segment.chord) === JSON.stringify(event.expected),
      top8: alternatives.some((candidate) => JSON.stringify(candidate.chord) === JSON.stringify(event.expected)),
      confidence: segment?.status === "resolved" ? segment.confidence : 0,
      facets: {
        root:
          segment?.status === "resolved" && JSON.stringify(segment.chord.root) === JSON.stringify(event.expected.root),
        bass:
          segment?.status === "resolved" && JSON.stringify(segment.chord.bass) === JSON.stringify(event.expected.bass),
        kind: segment?.status === "resolved" && segment.chord.kind === event.expected.kind,
        extension: segment?.status === "resolved" && segment.chord.extension === event.expected.extension,
        alterations:
          segment?.status === "resolved" &&
          JSON.stringify(segment.chord.degrees) === JSON.stringify(event.expected.degrees),
      },
    };
  });
});
const splitCounts = countSplits(results);
const evalResults = results.filter((result) => splitFor(result.groupId) === "eval");
const resolved = evalResults.filter((result) => result.resolved);
const calibration = createCalibrationModel(results.filter((result) => splitFor(result.groupId) === "train"));
const report = {
  corpus: {
    name: "bach-choral-harmony",
    source: manifest.source,
    license: manifest.license,
    cases: evalResults.length,
    totalCases: results.length,
    splits: splitCounts,
  },
  metrics: {
    top8OracleRecall: ratio(evalResults.filter((result) => result.top8).length, evalResults.length),
    resolvedPrecision: ratio(evalResults.filter((result) => result.correct).length, resolved.length),
    resolvedCoverage: ratio(resolved.length, evalResults.length),
    expectedCalibrationError: calibrationError(evalResults, calibration),
    facets: {
      root: ratio(resolved.filter((result) => result.facets.root).length, resolved.length),
      bass: ratio(resolved.filter((result) => result.facets.bass).length, resolved.length),
      kind: ratio(resolved.filter((result) => result.facets.kind).length, resolved.length),
      extension: ratio(resolved.filter((result) => result.facets.extension).length, resolved.length),
      alterations: ratio(resolved.filter((result) => result.facets.alterations).length, resolved.length),
    },
  },
  citation: manifest.citation,
};
console.log(JSON.stringify(report, null, 2));

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function calibrationError(
  results: readonly { confidence: number; correct: boolean }[],
  calibration: (confidence: number) => number,
): number {
  const bins = Array.from({ length: 10 }, () => ({ confidence: 0, accuracy: 0, count: 0 }));
  for (const result of results) {
    const confidence = calibration(result.confidence);
    const bin = bins[Math.min(9, Math.floor(confidence * 10))]!;
    bin.confidence += confidence;
    bin.accuracy += Number(result.correct);
    bin.count += 1;
  }
  return bins.reduce(
    (sum, bin) =>
      sum +
      (bin.count === 0
        ? 0
        : (bin.count / (results.length || 1)) * Math.abs(bin.confidence / bin.count - bin.accuracy / bin.count)),
    0,
  );
}

type DatasetSplit = "train" | "tune" | "eval";

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
  results: readonly { confidence: number; correct: boolean }[],
): (confidence: number) => number {
  const bins = Array.from({ length: 10 }, () => ({ correct: 0, count: 0 }));
  for (const result of results) {
    const bin = bins[Math.min(9, Math.floor(result.confidence * 10))]!;
    bin.correct += Number(result.correct);
    bin.count += 1;
  }
  return (confidence) => {
    const bin = bins[Math.min(9, Math.floor(confidence * 10))]!;
    return bin.count === 0 ? confidence : bin.correct / bin.count;
  };
}

function pitchNameToPitch(name: string): { step: PitchStep; alter: number; pitchClass: number } {
  const step = name.slice(0, 1) as PitchStep;
  const alter = name.endsWith("#") ? 1 : name.endsWith("b") ? -1 : 0;
  return { step, alter, pitchClass: (pitchClassByStep[step] + alter + 12) % 12 };
}

function chordBassPitchClass(chord: ChordSymbolInput): number {
  const pitchClassByStep = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const;
  const pitch = chord.bass ?? chord.root;
  return (pitchClassByStep[pitch.step] + pitch.alter + 12) % 12;
}
