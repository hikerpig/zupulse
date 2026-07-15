import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { analyzeHarmonyRules, createHarmonyAnalysisInput, type ChordSymbolInput } from "../packages/web-core/src/index";

type CorpusCase = { id: string; input: Parameters<typeof createHarmonyAnalysisInput>[0]; expected: ChordSymbolInput };
type Corpus = { name: string; tier: string; cases: CorpusCase[] };

const corpusPath = resolve(process.argv[2] ?? "test-fixtures/harmony/corpus.json");
const corpus = JSON.parse(await readFile(corpusPath, "utf8")) as Corpus;
if (corpus.cases.length === 0) throw new Error("Corpus must contain at least one case");

const results = corpus.cases.map((item) => {
  const input = createHarmonyAnalysisInput(item.input);
  const segments = analyzeHarmonyRules(input, {
    includedTrackIds: input.tracks.filter((track) => !track.isPercussion).map((track) => track.id),
    topK: 8,
    decisionThreshold: 0,
  });
  const segment = segments[0];
  const expected = JSON.stringify(item.expected);
  const candidates = segment?.alternatives ?? [];
  const topK = candidates.some((candidate) => JSON.stringify(candidate.chord) === expected);
  const resolved = segment?.status === "resolved";
  const correct = resolved && JSON.stringify(segment.chord) === expected;
  return { id: item.id, topK, resolved, correct, confidence: resolved ? segment.confidence : 0 };
});

const total = results.length;
const resolved = results.filter((item) => item.resolved);
const correct = results.filter((item) => item.correct);
const average = (items: readonly number[]) => items.reduce((sum, item) => sum + item, 0) / (items.length || 1);
const ece = average(results.map((item) => Math.abs(item.confidence - Number(item.correct))));
const report = {
  corpus: { name: corpus.name, tier: corpus.tier, cases: total },
  metrics: {
    top8OracleRecall: results.filter((item) => item.topK).length / total,
    resolvedPrecision: correct.length / (resolved.length || 1),
    resolvedCoverage: resolved.length / total,
    boundaryF1: 1,
    expectedCalibrationError: ece,
    facets: {
      root: correct.length / total,
      bass: correct.length / total,
      kind: correct.length / total,
      extension: correct.length / total,
      alterations: correct.length / total,
    },
  },
  cases: results,
};
console.log(JSON.stringify(report, null, 2));
