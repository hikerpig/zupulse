import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { unzipSync } from "fflate";
import {
  analyzeHarmonyRules,
  compareMoments,
  createHarmonyAnalysisInput,
  type ChordSymbolInput,
} from "../packages/web-core/src/index";
import { chordBassPitchClass, matchesUciHarmonyLabel, parseUciHarmonyLabel, pitchNameToPitch } from "./uciHarmonyLabel";
import { generateOracleCandidates } from "./harmonyOracleCandidates";
import { splitHarmonyGroup as splitFor, type HarmonyDatasetSplit as DatasetSplit } from "./harmonyDatasetSplit";

type Manifest = { source: string; sha256: string; license: string; citation: string; events: number };

const manifest = JSON.parse(
  await readFile(new URL("../test-fixtures/harmony/uci-bach-manifest.json", import.meta.url), "utf8"),
) as Manifest;
const archivePath = process.argv[2] ?? process.env.HARMONY_UCI_ZIP;
const rankerWeight = Number(process.env.HARMONY_RANKER_WEIGHT ?? 20);
const reportSplit = process.env.HARMONY_REPORT_SPLIT as DatasetSplit | undefined;
const oracleOnly = process.env.HARMONY_ORACLE_ONLY === "1";
const archive = archivePath
  ? await readFile(archivePath)
  : new Uint8Array(await (await fetch(manifest.source)).arrayBuffer());
const digest = createHash("sha256").update(archive).digest("hex");
if (digest !== manifest.sha256) throw new Error(`UCI archive checksum mismatch: ${digest}`);
const data = unzipSync(archive)["jsbach_chorals_harmony.data"];
if (!data) throw new Error("UCI data file missing");

type UciEvent = { id: string; expected: ChordSymbolInput; pitchClasses: number[]; bassPitchClass: number };
const events = new TextDecoder()
  .decode(data)
  .trim()
  .split(/\r?\n/)
  .flatMap((line) => {
    const columns = line.split(",").map((value) => value.trim());
    const expected = parseUciHarmonyLabel(columns[16] ?? "");
    if (!expected) return [];
    const pitchClasses = columns.slice(2, 14).flatMap((value, index) => (value === "YES" ? [index] : []));
    if (pitchClasses.length === 0) return [];
    const bass = pitchNameToPitch(columns[14]!);
    return [{ id: `${columns[0]}:${columns[1]}`, expected, pitchClasses, bassPitchClass: bass.pitchClass }];
  });

const groups = new Map<string, UciEvent[]>();
for (const event of events)
  groups.set(event.id.split(":")[0]!, [...(groups.get(event.id.split(":")[0]!) ?? []), event]);
const boundaryResults: Array<{ groupId: string; predicted: Set<number>; expected: Set<number> }> = [];
const results = [...groups.entries()]
  .filter(([groupId]) => reportSplit === undefined || splitFor(groupId) === reportSplit)
  .flatMap(([groupId, group]) => {
    const notes = group.flatMap((event, measureIndex) =>
      event.pitchClasses.map((pitchClass, noteIndex) => ({
        id: `${event.id}:${noteIndex}`,
        moment: { measureIndex, offsetTicks: 0 },
        durationTicks: 480,
        soundingPitchClass: pitchClass,
        soundingMidi: pitchClass === event.bassPitchClass ? 36 : 60 + pitchClass,
        voice: noteIndex + 1,
      })),
    );
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
              notes,
            },
          ],
        },
      ],
    });
    const segments = oracleOnly
      ? []
      : analyzeHarmonyRules(input, {
          includedTrackIds: ["bach"],
          topK: 8,
          decisionThreshold: 0,
          rankerWeight,
        });
    boundaryResults.push({
      groupId,
      predicted: new Set(segments.slice(1).map((segment) => segment.range.start.measureIndex)),
      expected: new Set(
        group
          .slice(1)
          .flatMap((event, index) =>
            matchesUciHarmonyLabel(event.expected, group[index]!.expected) ? [] : [index + 1],
          ),
      ),
    });
    return group.map((event, measureIndex) => {
      const start = { measureIndex, offsetTicks: 0 };
      const segment = segments.find(
        (candidate) =>
          compareMoments(candidate.range.start, start) <= 0 && compareMoments(start, candidate.range.end) < 0,
      );
      const alternatives = generateOracleCandidates({
        ticksPerQuarter: 480,
        range: { start, end: { measureIndex, offsetTicks: 480 } },
        notes,
        rankerWeight,
      });
      return {
        groupId,
        expected: event.expected,
        resolved: segment?.status === "resolved",
        correct: segment?.status === "resolved" && matchesUciHarmonyLabel(segment.chord, event.expected),
        top8: alternatives.some((candidate) => matchesUciHarmonyLabel(candidate.chord, event.expected)),
        top1: alternatives[0] !== undefined && matchesUciHarmonyLabel(alternatives[0].chord, event.expected),
        confidence: segment?.status === "resolved" ? segment.confidence : 0,
        facets: {
          root:
            segment?.status === "resolved" &&
            JSON.stringify(segment.chord.root) === JSON.stringify(event.expected.root),
          bass: segment?.status === "resolved" && chordBassPitchClass(segment.chord) === event.bassPitchClass,
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
const evalResults = results.filter((result) => splitFor(result.groupId) === (reportSplit ?? "eval"));
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
    top1Accuracy: ratio(evalResults.filter((result) => result.top1).length, evalResults.length),
    resolvedPrecision: ratio(evalResults.filter((result) => result.correct).length, resolved.length),
    resolvedCoverage: ratio(resolved.length, evalResults.length),
    boundaryF1: calculateBoundaryF1(boundaryResults.filter((result) => splitFor(result.groupId) === "eval")),
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

function calculateBoundaryF1(
  groups: readonly { predicted: ReadonlySet<number>; expected: ReadonlySet<number> }[],
): number {
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
