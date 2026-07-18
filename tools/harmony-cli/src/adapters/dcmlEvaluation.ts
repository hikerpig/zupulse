import { analyzeHarmonyRules, compareMoments, type ChordSymbolInput } from "@zupulse/web-core";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { calculateAccuracyMetrics, type AccuracyObservation } from "../accuracyMetrics";
import { assignDatasetSplit } from "../evaluationProtocol";
import { parseDcmlPiece } from "./dcml";

export async function evaluateDcmlCorpus(
  root: string,
  options: {
    id: string;
    include?: readonly string[];
    forcedEvalGroups: readonly string[];
    groupBy?: "prefix-before-hyphen" | "corpus";
  },
) {
  const files = (await readdir(resolve(root, "harmonies")))
    .filter((name) => name.endsWith(".harmonies.tsv"))
    .map((name) => name.slice(0, -".harmonies.tsv".length))
    .filter((id) => options.include === undefined || options.include.includes(id))
    .sort();
  if (files.length === 0) throw new Error(`no DCML harmony files found in ${root}`);

  const splitCounts = { train: 0, tune: 0, eval: 0 };
  const evalObservations: AccuracyObservation[] = [];
  const errors: Array<{
    pieceId: string;
    groupId: string;
    measureIndex: number;
    offsetTicks: number;
    label: string;
    family: string;
    category: "unsupported-label" | "unresolved" | "root" | "bass" | "kind" | "extension" | "degrees" | "boundary";
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
    if (split !== "eval") continue;
    const segments = analyzeHarmonyRules(piece.input, { includedTrackIds: ["dcml"], topK: 8 });
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
      const category = errorCategory(gold.chord, segment, expectedBoundary, predictedBoundary);
      if (category && errors.length < 50) {
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
      evalObservations.push({
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
      });
    }
  }
  return {
    id: options.id,
    kind: "accuracy-corpus" as const,
    adapter: "dcml" as const,
    status: "passed" as const,
    splits: splitCounts,
    metrics: calculateAccuracyMetrics(evalObservations),
    errors,
  };
}

export function dcmlGroupId(pieceId: string, mode: "prefix-before-hyphen" | "corpus", corpusId: string): string {
  return mode === "corpus" ? corpusId : pieceId.split("-")[0]!;
}

function sameChord(a: ChordSymbolInput | undefined, b: ChordSymbolInput | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function errorCategory(
  expected: ChordSymbolInput | undefined,
  segment: ReturnType<typeof analyzeHarmonyRules>[number] | undefined,
  expectedBoundary: boolean,
  predictedBoundary: boolean,
) {
  if (!expected) return "unsupported-label" as const;
  if (segment?.status !== "resolved") return "unresolved" as const;
  if (!sameValue(segment.chord.root, expected.root)) return "root" as const;
  if (!sameValue(segment.chord.bass, expected.bass)) return "bass" as const;
  if (segment.chord.kind !== expected.kind) return "kind" as const;
  if (segment.chord.extension !== expected.extension) return "extension" as const;
  if (!sameValue(segment.chord.degrees, expected.degrees)) return "degrees" as const;
  if (expectedBoundary && !predictedBoundary) return "boundary" as const;
  return undefined;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
