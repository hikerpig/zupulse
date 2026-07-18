import { chordSymbolSchema, type ChordSymbolInput } from "@zupulse/web-core";

export type AccuracyObservation = {
  groupId: string;
  corpus: string;
  family: string;
  weight: number;
  expected?: ChordSymbolInput;
  unsupportedLabel?: string;
  predicted?: ChordSymbolInput;
  alternatives: readonly ChordSymbolInput[];
  confidence: number;
  expectedBoundary: boolean;
  predictedBoundary: boolean;
};

type SliceMetrics = { cases: number; top1Accuracy: number; resolvedPrecision: number; resolvedCoverage: number };

export type AccuracyMetrics = {
  gold: { total: number; mapped: number; unsupported: number };
  mappingCoverage: number;
  unsupportedLabelRate: number;
  top1Accuracy: number;
  top8OracleRecall: number;
  resolvedPrecision: number;
  resolvedCoverage: number;
  boundaryF1: number;
  expectedCalibrationError: number;
  facets: { root: number; bass: number; kind: number; extension: number; degrees: number };
  slices: { corpus: Record<string, SliceMetrics>; chordFamily: Record<string, SliceMetrics> };
};

export function calculateAccuracyMetrics(observations: readonly AccuracyObservation[]): AccuracyMetrics {
  const mapped = observations.filter((item): item is AccuracyObservation & { expected: ChordSymbolInput } =>
    Boolean(item.expected),
  );
  const resolved = mapped.filter((item): item is typeof item & { predicted: ChordSymbolInput } =>
    Boolean(item.predicted),
  );
  const correct = (item: (typeof resolved)[number]) => sameChord(item.predicted, item.expected);
  const boundaryTruePositive = observations.filter((item) => item.expectedBoundary && item.predictedBoundary).length;
  const boundaryPrecision = ratio(boundaryTruePositive, observations.filter((item) => item.predictedBoundary).length);
  const boundaryRecall = ratio(boundaryTruePositive, observations.filter((item) => item.expectedBoundary).length);

  return {
    gold: {
      total: observations.length,
      mapped: mapped.length,
      unsupported: observations.length - mapped.length,
    },
    mappingCoverage: ratio(mapped.length, observations.length),
    unsupportedLabelRate: ratio(observations.length - mapped.length, observations.length),
    top1Accuracy: weightedRatio(mapped, (item) => sameChord(item.alternatives[0], item.expected)),
    top8OracleRecall: weightedRatio(mapped, (item) =>
      item.alternatives.some((candidate) => sameChord(candidate, item.expected)),
    ),
    resolvedPrecision: weightedRatio(resolved, correct),
    resolvedCoverage: ratio(totalWeight(resolved), totalWeight(mapped)),
    boundaryF1:
      boundaryPrecision + boundaryRecall === 0
        ? 0
        : (2 * boundaryPrecision * boundaryRecall) / (boundaryPrecision + boundaryRecall),
    expectedCalibrationError: calibrationError(mapped),
    facets: {
      root: weightedRatio(resolved, (item) => same(item.predicted.root, item.expected.root)),
      bass: weightedRatio(resolved, (item) => same(item.predicted.bass, item.expected.bass)),
      kind: weightedRatio(resolved, (item) => item.predicted.kind === item.expected.kind),
      extension: weightedRatio(resolved, (item) => item.predicted.extension === item.expected.extension),
      degrees: weightedRatio(resolved, (item) => same(item.predicted.degrees, item.expected.degrees)),
    },
    slices: {
      corpus: createSlices(mapped, (item) => item.corpus),
      chordFamily: createSlices(mapped, (item) => item.family),
    },
  };
}

function createSlices(
  observations: readonly (AccuracyObservation & { expected: ChordSymbolInput })[],
  key: (item: AccuracyObservation) => string,
): Record<string, SliceMetrics> {
  return Object.fromEntries(
    [...new Set(observations.map(key))].sort().map((name) => {
      const items = observations.filter((item) => key(item) === name);
      const resolved = items.filter((item): item is typeof item & { predicted: ChordSymbolInput } =>
        Boolean(item.predicted),
      );
      return [
        name,
        {
          cases: items.length,
          top1Accuracy: weightedRatio(items, (item) => sameChord(item.alternatives[0], item.expected)),
          resolvedPrecision: weightedRatio(resolved, (item) => sameChord(item.predicted, item.expected)),
          resolvedCoverage: ratio(totalWeight(resolved), totalWeight(items)),
        },
      ];
    }),
  );
}

function calibrationError(observations: readonly (AccuracyObservation & { expected: ChordSymbolInput })[]): number {
  const bins = Array.from({ length: 10 }, () => ({ confidence: 0, correct: 0, weight: 0 }));
  for (const item of observations) {
    const confidence = Math.max(0, Math.min(1, item.confidence));
    const bin = bins[Math.min(9, Math.floor(confidence * 10))]!;
    bin.confidence += confidence * item.weight;
    bin.correct += Number(item.predicted !== undefined && sameChord(item.predicted, item.expected)) * item.weight;
    bin.weight += item.weight;
  }
  const weight = totalWeight(observations);
  return bins.reduce(
    (sum, bin) =>
      sum +
      (bin.weight === 0
        ? 0
        : (bin.weight / (weight || 1)) * Math.abs(bin.confidence / bin.weight - bin.correct / bin.weight)),
    0,
  );
}

function weightedRatio<T extends { weight: number }>(items: readonly T[], matches: (item: T) => boolean): number {
  return ratio(
    items.reduce((sum, item) => sum + (matches(item) ? item.weight : 0), 0),
    totalWeight(items),
  );
}

function totalWeight(items: readonly { weight: number }[]): number {
  return items.reduce((sum, item) => sum + item.weight, 0);
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function sameChord(a: ChordSymbolInput | undefined, b: ChordSymbolInput): boolean {
  return a !== undefined && same(chordSymbolSchema.parse(a), chordSymbolSchema.parse(b));
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
