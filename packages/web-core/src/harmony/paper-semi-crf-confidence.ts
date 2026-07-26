import type { HarmonySegment } from "./schemas";

export function applyHarmonyConfidence(segments: readonly HarmonySegment[], threshold: number): HarmonySegment[] {
  return segments.map((segment) =>
    segment.status === "resolved" && segment.confidence < threshold
      ? { status: "unresolved", range: segment.range, reason: "low-confidence", alternatives: segment.alternatives }
      : segment,
  );
}
