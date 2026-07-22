import { analyzeHarmonyRules, buildLegalBoundaryLattice, compareMoments } from "@zupulse/web-core";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  calculateAccuracyMetrics,
  classifyAccuracyError,
  shouldIncludeDiagnosticSample,
  type AccuracyErrorCategory,
  type AccuracyObservation,
} from "../accuracyMetrics";
import { assignDatasetSplit, type DatasetSplit } from "../evaluationProtocol";
import {
  calculateIntervalOverlapDiagnostics,
  mergeIntervalOverlapDiagnostics,
  type IntervalOverlapDiagnostics,
} from "../intervalMetrics";
import { parsePop909Piece } from "./pop909";

export async function evaluatePop909Corpus(
  root: string,
  options: {
    id: string;
    sourceRevision: string;
    include?: readonly string[];
    includeGroups?: readonly string[];
    forcedEvalGroups: readonly string[];
    reportSplit?: DatasetSplit;
    decisionThreshold?: number;
    primaryRerankerModel?: false;
  },
) {
  const reportSplit = options.reportSplit ?? "eval";
  const decisionThreshold = options.decisionThreshold ?? 0.6;
  const songs = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d{3}$/.test(entry.name))
    .map((entry) => entry.name)
    .filter((id) => options.include === undefined || options.include.includes(id))
    .filter((id) => options.includeGroups === undefined || options.includeGroups.includes(id))
    .sort();
  if (songs.length === 0) throw new Error(`no POP909 songs found in ${root}`);

  const splits = { train: 0, tune: 0, eval: 0 };
  const observations: AccuracyObservation[] = [];
  const reportGroups = new Set<string>();
  const intervalDiagnostics: IntervalOverlapDiagnostics[] = [];
  const errors: Array<{
    pieceId: string;
    groupId: string;
    measureIndex: number;
    offsetTicks: number;
    label: string;
    family: string;
    category: AccuracyErrorCategory;
  }> = [];
  for (const song of songs) {
    const directory = resolve(root, song);
    const piece = parsePop909Piece({
      corpus: options.id,
      groupId: song,
      midi: await readFile(resolve(directory, `${song}.mid`)),
      beats: await readFile(resolve(directory, "beat_midi.txt"), "utf8"),
      chords: await readFile(resolve(directory, "chord_midi.txt"), "utf8"),
    });
    const split = assignDatasetSplit(song, options.forcedEvalGroups);
    splits[split] += piece.gold.length;
    if (split !== reportSplit) continue;
    reportGroups.add(song);
    const segments = analyzeHarmonyRules(piece.input, {
      includedTrackIds: ["pop909"],
      topK: 8,
      decisionThreshold,
      ...(options.primaryRerankerModel === false ? { primaryRerankerModel: false } : {}),
    });
    intervalDiagnostics.push(
      calculateIntervalOverlapDiagnostics({
        ticksPerQuarter: piece.input.ticksPerQuarter,
        measures: piece.input.measures,
        legalMoments: buildLegalBoundaryLattice(piece.input).moments,
        gold: piece.gold.flatMap((item) => (item.chord ? [{ range: item.range, chord: item.chord }] : [])),
        predicted: segments,
      }),
    );
    for (const [index, gold] of piece.gold.entries()) {
      const segment = segments.find(
        (candidate) =>
          compareMoments(candidate.range.start, gold.range.start) <= 0 &&
          compareMoments(gold.range.start, candidate.range.end) < 0,
      );
      const previous = piece.gold[index - 1];
      const expectedBoundary = index > 0 && !same(previous?.chord, gold.chord);
      const predictedBoundary =
        index > 0 && segments.some((candidate) => compareMoments(candidate.range.start, gold.range.start) === 0);
      const observation: AccuracyObservation = {
        groupId: song,
        corpus: options.id,
        family: gold.family,
        weight: gold.weight,
        ...(gold.chord ? { expected: gold.chord } : { unsupportedLabel: gold.unsupportedLabel ?? gold.label }),
        ...(segment?.status === "resolved"
          ? { predicted: segment.chord, confidence: segment.confidence }
          : { confidence: 0 }),
        alternatives: segment?.alternatives.map((candidate) => candidate.chord) ?? [],
        expectedBoundary,
        predictedBoundary,
      };
      const category = classifyAccuracyError(observation);
      if (category && shouldIncludeDiagnosticSample(errors, category)) {
        errors.push({
          pieceId: song,
          groupId: song,
          measureIndex: gold.range.start.measureIndex,
          offsetTicks: gold.range.start.offsetTicks,
          label: gold.label,
          family: gold.family,
          category,
        });
      }
      observations.push(observation);
    }
  }
  return {
    id: options.id,
    kind: "accuracy-corpus" as const,
    adapter: "pop909" as const,
    status: "passed" as const,
    reportSplit,
    sourceRevision: options.sourceRevision,
    reportGroupsSha256: hashGroups(reportGroups),
    decisionThreshold,
    splits,
    metrics: calculateAccuracyMetrics(observations, mergeIntervalOverlapDiagnostics(intervalDiagnostics)),
    errors,
  };
}

function hashGroups(groups: ReadonlySet<string>): string {
  return createHash("sha256")
    .update([...groups].sort().join("\n"))
    .digest("hex");
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
