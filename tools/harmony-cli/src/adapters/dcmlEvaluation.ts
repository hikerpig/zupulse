import {
  analyzeHarmonyRules,
  buildLegalBoundaryLattice,
  compareMoments,
  type ChordSymbolInput,
} from "@zupulse/web-core";
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
import { parseDcmlPiece } from "./dcml";

export async function evaluateDcmlCorpus(
  root: string,
  options: {
    id: string;
    sourceRevision: string;
    include?: readonly string[];
    forcedEvalGroups: readonly string[];
    groupBy?: "prefix-before-hyphen" | "corpus";
    reportSplit?: DatasetSplit;
    decisionThreshold?: number;
  },
) {
  const reportSplit = options.reportSplit ?? "eval";
  const decisionThreshold = options.decisionThreshold ?? 0.6;
  const files = (await readdir(resolve(root, "harmonies")))
    .filter((name) => name.endsWith(".harmonies.tsv"))
    .map((name) => name.slice(0, -".harmonies.tsv".length))
    .filter((id) => options.include === undefined || options.include.includes(id))
    .sort();
  if (files.length === 0) throw new Error(`no DCML harmony files found in ${root}`);

  const splitCounts = { train: 0, tune: 0, eval: 0 };
  const evalObservations: AccuracyObservation[] = [];
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
  for (const pieceId of files) {
    const groupId = dcmlGroupId(pieceId, options.groupBy ?? "prefix-before-hyphen", options.id);
    const split = assignDatasetSplit(groupId, options.forcedEvalGroups);
    const piece = parseDcmlPiece({
      corpus: options.id,
      groupId,
      measures: await readFile(resolve(root, `measures/${pieceId}.measures.tsv`), "utf8"),
      notes: await readFile(resolve(root, `notes/${pieceId}.notes.tsv`), "utf8"),
      harmonies: await readFile(resolve(root, `harmonies/${pieceId}.harmonies.tsv`), "utf8"),
    });
    splitCounts[split] += piece.gold.length;
    if (split !== reportSplit) continue;
    reportGroups.add(groupId);
    const segments = analyzeHarmonyRules(piece.input, {
      includedTrackIds: ["dcml"],
      topK: 8,
      decisionThreshold,
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
      const expectedBoundary = index > 0 && !sameChord(previous?.chord, gold.chord);
      const predictedBoundary =
        index > 0 && segments.some((candidate) => compareMoments(candidate.range.start, gold.range.start) === 0);
      const observation: AccuracyObservation = {
        groupId,
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
          pieceId,
          groupId,
          measureIndex: gold.range.start.measureIndex,
          offsetTicks: gold.range.start.offsetTicks,
          label: gold.label,
          family: gold.family,
          category,
        });
      }
      evalObservations.push(observation);
    }
  }
  return {
    id: options.id,
    kind: "accuracy-corpus" as const,
    adapter: "dcml" as const,
    status: "passed" as const,
    reportSplit,
    sourceRevision: options.sourceRevision,
    reportGroupsSha256: hashGroups(reportGroups),
    decisionThreshold,
    splits: splitCounts,
    metrics: calculateAccuracyMetrics(evalObservations, mergeIntervalOverlapDiagnostics(intervalDiagnostics)),
    errors,
  };
}

function hashGroups(groups: ReadonlySet<string>): string {
  return createHash("sha256")
    .update([...groups].sort().join("\n"))
    .digest("hex");
}

export function dcmlGroupId(pieceId: string, mode: "prefix-before-hyphen" | "corpus", corpusId: string): string {
  return mode === "corpus" ? corpusId : pieceId.split("-")[0]!;
}

function sameChord(a: ChordSymbolInput | undefined, b: ChordSymbolInput | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
