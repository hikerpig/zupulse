import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  analyzeHarmonyRules,
  chordSymbolSchema,
  createHarmonyAnalysisInput,
  type ChordSymbolInput,
} from "../packages/web-core/src/index";

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
  const expectedChord = chordSymbolSchema.parse(item.expected);
  const expected = JSON.stringify(expectedChord);
  const candidates = segment?.alternatives ?? [];
  const topK = candidates.some((candidate) => JSON.stringify(candidate.chord) === expected);
  const resolved = segment?.status === "resolved";
  const correct = resolved && JSON.stringify(segment.chord) === expected;
  const predictedChord = resolved ? segment.chord : undefined;
  const facet = (field: keyof typeof expectedChord) =>
    resolved && JSON.stringify(predictedChord?.[field]) === JSON.stringify(expectedChord[field]);
  return {
    id: item.id,
    topK,
    resolved,
    correct,
    confidence: resolved ? segment.confidence : 0,
    predictedBoundaries: segments.flatMap((entry) => [entry.range.start, entry.range.end]),
    expectedBoundaries: input.measures.flatMap((measure) => [
      { measureIndex: measure.index, offsetTicks: 0 },
      { measureIndex: measure.index, offsetTicks: measure.durationTicks },
    ]),
    facets: {
      root: facet("root"),
      bass: facet("bass"),
      kind: facet("kind"),
      extension: facet("extension"),
      alterations: facet("degrees"),
    },
  };
});

const total = results.length;
const resolved = results.filter((item) => item.resolved);
const correct = results.filter((item) => item.correct);
const boundaryKey = (moment: { measureIndex: number; offsetTicks: number }) =>
  `${moment.measureIndex}:${moment.offsetTicks}`;
const boundaryCounts = results.reduce(
  (counts, item) => {
    const predicted = new Set(item.predictedBoundaries.map(boundaryKey));
    const expected = new Set(item.expectedBoundaries.map(boundaryKey));
    counts.tp += [...predicted].filter((key) => expected.has(key)).length;
    counts.predicted += predicted.size;
    counts.expected += expected.size;
    return counts;
  },
  { tp: 0, predicted: 0, expected: 0 },
);
const boundaryPrecision = boundaryCounts.tp / (boundaryCounts.predicted || 1);
const boundaryRecall = boundaryCounts.tp / (boundaryCounts.expected || 1);
const boundaryF1 = (2 * boundaryPrecision * boundaryRecall) / (boundaryPrecision + boundaryRecall || 1);
const bins = Array.from({ length: 10 }, () => ({ confidence: 0, accuracy: 0, count: 0 }));
for (const item of results) {
  const bin = bins[Math.min(9, Math.floor(item.confidence * 10))]!;
  bin.confidence += item.confidence;
  bin.accuracy += Number(item.correct);
  bin.count += 1;
}
const ece = bins.reduce(
  (sum, bin) =>
    sum + (bin.count === 0 ? 0 : (bin.count / total) * Math.abs(bin.confidence / bin.count - bin.accuracy / bin.count)),
  0,
);
const facetAccuracy = (field: keyof (typeof results)[number]["facets"]) =>
  resolved.filter((item) => item.facets[field]).length / (resolved.length || 1);
const report = {
  corpus: { name: corpus.name, tier: corpus.tier, cases: total },
  metrics: {
    top8OracleRecall: results.filter((item) => item.topK).length / total,
    resolvedPrecision: correct.length / (resolved.length || 1),
    resolvedCoverage: resolved.length / total,
    boundaryF1,
    expectedCalibrationError: ece,
    facets: {
      root: facetAccuracy("root"),
      bass: facetAccuracy("bass"),
      kind: facetAccuracy("kind"),
      extension: facetAccuracy("extension"),
      alterations: facetAccuracy("alterations"),
    },
  },
  cases: results,
};
console.log(JSON.stringify(report, null, 2));
