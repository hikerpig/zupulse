import {
  chordSymbolSchema,
  type ChordSymbolInput,
  type HarmonySegment,
  type ScoreWrittenMoment,
  type ScoreWrittenRange,
} from "@zupulse/web-core";

export type IntervalOverlapDiagnostics = {
  overlap: {
    mappedDurationTicks: number;
    correctDurationTicks: number;
    wrongDurationTicks: number;
    unresolvedDurationTicks: number;
    accuracy: number;
    resolvedPrecision: number;
    resolvedCoverage: number;
  };
  boundaries: {
    expected: number;
    predicted: number;
    truePositive: number;
    overSegmented: number;
    underSegmented: number;
    f1: number;
  };
};

export function calculateIntervalOverlapDiagnostics(input: {
  ticksPerQuarter: number;
  measures: readonly { index: number; durationTicks: number }[];
  legalMoments: readonly ScoreWrittenMoment[];
  gold: readonly { range: ScoreWrittenRange; chord: ChordSymbolInput }[];
  predicted: readonly HarmonySegment[];
}): IntervalOverlapDiagnostics {
  const absolute = createAbsoluteMoment(input.measures);
  let mappedDurationTicks = 0;
  let correctDurationTicks = 0;
  let wrongDurationTicks = 0;
  let unresolvedDurationTicks = 0;
  for (const gold of input.gold) {
    const goldStart = absolute(gold.range.start);
    const goldEnd = absolute(gold.range.end);
    const duration = goldEnd - goldStart;
    mappedDurationTicks += duration;
    let covered = 0;
    for (const predicted of input.predicted) {
      const overlap = Math.max(
        0,
        Math.min(goldEnd, absolute(predicted.range.end)) - Math.max(goldStart, absolute(predicted.range.start)),
      );
      if (overlap === 0) continue;
      covered += overlap;
      if (predicted.status === "unresolved") unresolvedDurationTicks += overlap;
      else if (sameChord(predicted.chord, gold.chord)) correctDurationTicks += overlap;
      else wrongDurationTicks += overlap;
    }
    unresolvedDurationTicks += Math.max(0, duration - covered);
  }

  const gold = [...input.gold].sort((a, b) => absolute(a.range.start) - absolute(b.range.start));
  const evaluableJoins = new Set<number>();
  const expectedBoundaries: number[] = [];
  for (let index = 1; index < gold.length; index += 1) {
    const previous = gold[index - 1]!;
    const current = gold[index]!;
    const boundary = absolute(current.range.start);
    if (absolute(previous.range.end) !== boundary) continue;
    evaluableJoins.add(boundary);
    if (!sameChord(previous.chord, current.chord)) expectedBoundaries.push(boundary);
  }
  const predictedBoundaries = input.predicted
    .slice(1)
    .map((segment) => absolute(segment.range.start))
    .filter(
      (boundary) =>
        evaluableJoins.has(boundary) ||
        gold.some((item) => absolute(item.range.start) < boundary && boundary < absolute(item.range.end)),
    );
  const legalMoments = [...new Set(input.legalMoments.map(absolute))].sort((a, b) => a - b);
  const unmatched = new Set(predictedBoundaries.map((_, index) => index));
  let truePositive = 0;
  for (const expected of expectedBoundaries) {
    const tolerance = boundaryTolerance(expected, legalMoments, input.ticksPerQuarter / 2);
    const match = [...unmatched]
      .map((index) => ({ index, distance: Math.abs(predictedBoundaries[index]! - expected) }))
      .filter(({ distance }) => distance <= tolerance)
      .sort((a, b) => a.distance - b.distance || a.index - b.index)[0];
    if (!match) continue;
    unmatched.delete(match.index);
    truePositive += 1;
  }
  const boundaryPrecision = ratio(truePositive, predictedBoundaries.length);
  const boundaryRecall = ratio(truePositive, expectedBoundaries.length);
  const resolvedDurationTicks = correctDurationTicks + wrongDurationTicks;
  return {
    overlap: {
      mappedDurationTicks,
      correctDurationTicks,
      wrongDurationTicks,
      unresolvedDurationTicks,
      accuracy: ratio(correctDurationTicks, mappedDurationTicks),
      resolvedPrecision: ratio(correctDurationTicks, resolvedDurationTicks),
      resolvedCoverage: ratio(resolvedDurationTicks, mappedDurationTicks),
    },
    boundaries: {
      expected: expectedBoundaries.length,
      predicted: predictedBoundaries.length,
      truePositive,
      overSegmented: predictedBoundaries.length - truePositive,
      underSegmented: expectedBoundaries.length - truePositive,
      f1:
        boundaryPrecision + boundaryRecall === 0
          ? 0
          : (2 * boundaryPrecision * boundaryRecall) / (boundaryPrecision + boundaryRecall),
    },
  };
}

export function mergeIntervalOverlapDiagnostics(
  diagnostics: readonly IntervalOverlapDiagnostics[],
): IntervalOverlapDiagnostics {
  const counts = diagnostics.reduce(
    (total, item) => ({
      mappedDurationTicks: total.mappedDurationTicks + item.overlap.mappedDurationTicks,
      correctDurationTicks: total.correctDurationTicks + item.overlap.correctDurationTicks,
      wrongDurationTicks: total.wrongDurationTicks + item.overlap.wrongDurationTicks,
      unresolvedDurationTicks: total.unresolvedDurationTicks + item.overlap.unresolvedDurationTicks,
      expected: total.expected + item.boundaries.expected,
      predicted: total.predicted + item.boundaries.predicted,
      truePositive: total.truePositive + item.boundaries.truePositive,
    }),
    {
      mappedDurationTicks: 0,
      correctDurationTicks: 0,
      wrongDurationTicks: 0,
      unresolvedDurationTicks: 0,
      expected: 0,
      predicted: 0,
      truePositive: 0,
    },
  );
  const resolvedDurationTicks = counts.correctDurationTicks + counts.wrongDurationTicks;
  const precision = ratio(counts.truePositive, counts.predicted);
  const recall = ratio(counts.truePositive, counts.expected);
  return {
    overlap: {
      mappedDurationTicks: counts.mappedDurationTicks,
      correctDurationTicks: counts.correctDurationTicks,
      wrongDurationTicks: counts.wrongDurationTicks,
      unresolvedDurationTicks: counts.unresolvedDurationTicks,
      accuracy: ratio(counts.correctDurationTicks, counts.mappedDurationTicks),
      resolvedPrecision: ratio(counts.correctDurationTicks, resolvedDurationTicks),
      resolvedCoverage: ratio(resolvedDurationTicks, counts.mappedDurationTicks),
    },
    boundaries: {
      expected: counts.expected,
      predicted: counts.predicted,
      truePositive: counts.truePositive,
      overSegmented: counts.predicted - counts.truePositive,
      underSegmented: counts.expected - counts.truePositive,
      f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    },
  };
}

function createAbsoluteMoment(measures: readonly { index: number; durationTicks: number }[]) {
  const starts = new Map<number, number>();
  let offset = 0;
  for (const measure of measures) {
    starts.set(measure.index, offset);
    offset += measure.durationTicks;
  }
  return (moment: ScoreWrittenMoment): number => {
    const start = starts.get(moment.measureIndex);
    if (start === undefined) throw new Error(`unknown measure index: ${moment.measureIndex}`);
    return start + moment.offsetTicks;
  };
}

function boundaryTolerance(expected: number, legalMoments: readonly number[], eighthNoteTicks: number): number {
  const distances = legalMoments.map((moment) => Math.abs(moment - expected)).filter((distance) => distance > 0);
  return Math.min(eighthNoteTicks, distances.length ? Math.min(...distances) : eighthNoteTicks);
}

function sameChord(a: ChordSymbolInput, b: ChordSymbolInput): boolean {
  return JSON.stringify(chordSymbolSchema.parse(a)) === JSON.stringify(chordSymbolSchema.parse(b));
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
