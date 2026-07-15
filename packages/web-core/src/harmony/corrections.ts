import type { HarmonyCorrection, ScoreWrittenRange } from "./schemas";
import { compareMoments } from "./schemas";

export function normalizeCorrections(
  corrections: readonly HarmonyCorrection[],
  reset?: ScoreWrittenRange,
): HarmonyCorrection[] {
  let result: HarmonyCorrection[] = [];
  for (const correction of corrections) result = insertCorrection(result, correction);
  if (reset) result = result.flatMap((correction) => subtractRange(correction, reset));
  return result.sort((a, b) => compareMoments(a.range.start, b.range.start));
}

export function insertCorrection(existing: readonly HarmonyCorrection[], next: HarmonyCorrection): HarmonyCorrection[] {
  return [...existing.flatMap((correction) => subtractRange(correction, next.range)), next].sort((a, b) =>
    compareMoments(a.range.start, b.range.start),
  );
}

function subtractRange(correction: HarmonyCorrection, removed: ScoreWrittenRange): HarmonyCorrection[] {
  if (
    compareMoments(correction.range.end, removed.start) <= 0 ||
    compareMoments(removed.end, correction.range.start) <= 0
  )
    return [correction];
  const pieces: HarmonyCorrection[] = [];
  if (compareMoments(correction.range.start, removed.start) < 0)
    pieces.push({ ...correction, range: { start: correction.range.start, end: removed.start } });
  if (compareMoments(removed.end, correction.range.end) < 0)
    pieces.push({ ...correction, range: { start: removed.end, end: correction.range.end } });
  return pieces;
}
