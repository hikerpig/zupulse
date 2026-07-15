import type { HarmonySegment } from "./schemas";
import { compareMoments } from "./schemas";

export function applyHarmonyConfidence(segments: readonly HarmonySegment[], threshold: number): HarmonySegment[] {
  return segments.map((segment) =>
    segment.status === "resolved" && segment.confidence < threshold
      ? { status: "unresolved", range: segment.range, reason: "low-confidence", alternatives: segment.alternatives }
      : segment,
  );
}

export function mergeHarmonySegments(segments: readonly HarmonySegment[]): HarmonySegment[] {
  const merged: HarmonySegment[] = [];
  for (const segment of segments) {
    const previous = merged.at(-1);
    if (
      previous?.status === "resolved" &&
      segment.status === "resolved" &&
      JSON.stringify(previous.chord) === JSON.stringify(segment.chord) &&
      compareMoments(previous.range.end, segment.range.start) === 0
    ) {
      merged[merged.length - 1] = {
        ...previous,
        range: { start: previous.range.start, end: segment.range.end },
        confidence: Math.min(previous.confidence, segment.confidence),
        alternatives: [...previous.alternatives, ...segment.alternatives],
      };
    } else merged.push(segment);
  }
  return merged;
}
