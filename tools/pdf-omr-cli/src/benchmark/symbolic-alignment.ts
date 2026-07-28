export type ExactAlignment = {
  matches: Array<{ predictedIndex: number; expectedIndex: number }>;
  unmatchedPredicted: number[];
  unmatchedExpected: number[];
};

export function alignExact<T>(
  predicted: readonly T[],
  expected: readonly T[],
  key: (value: T) => string,
): ExactAlignment {
  const expectedByKey = new Map<string, number[]>();
  for (const [index, value] of expected.entries()) {
    const indexes = expectedByKey.get(key(value)) ?? [];
    indexes.push(index);
    expectedByKey.set(key(value), indexes);
  }
  const matches: ExactAlignment["matches"] = [];
  const unmatchedPredicted: number[] = [];
  const matchedExpected = new Set<number>();
  for (const [predictedIndex, value] of predicted.entries()) {
    const indexes = expectedByKey.get(key(value));
    const expectedIndex = indexes?.shift();
    if (expectedIndex === undefined) unmatchedPredicted.push(predictedIndex);
    else {
      matches.push({ predictedIndex, expectedIndex });
      matchedExpected.add(expectedIndex);
    }
  }
  return {
    matches,
    unmatchedPredicted,
    unmatchedExpected: expected.map((_, index) => index).filter((index) => !matchedExpected.has(index)),
  };
}
