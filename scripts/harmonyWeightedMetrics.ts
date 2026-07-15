export function weightedFraction<T>(
  items: readonly T[],
  matches: (item: T) => boolean,
  weight: (item: T) => number,
): number {
  const denominator = items.reduce((sum, item) => sum + weight(item), 0);
  return denominator === 0 ? 0 : items.reduce((sum, item) => sum + (matches(item) ? weight(item) : 0), 0) / denominator;
}
