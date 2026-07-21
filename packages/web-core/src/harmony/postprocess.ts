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
        alternatives: [...previous.alternatives, ...segment.alternatives]
          .filter(
            (candidate, index, alternatives) =>
              alternatives.findIndex((item) => JSON.stringify(item.chord) === JSON.stringify(candidate.chord)) ===
              index,
          )
          .slice(0, 8),
      };
    } else merged.push(segment);
  }
  return merged;
}

export function suppressShortNonChordSegments(
  segments: readonly HarmonySegment[],
  maximumDurationTicks: number,
): HarmonySegment[] {
  const corrected = [...segments];
  for (let index = 1; index < corrected.length - 1; index += 1) {
    const previous = corrected[index - 1];
    const current = corrected[index];
    const next = corrected[index + 1];
    if (
      previous?.status !== "resolved" ||
      current?.status !== "resolved" ||
      next?.status !== "resolved" ||
      current.range.start.measureIndex !== current.range.end.measureIndex ||
      current.range.end.offsetTicks - current.range.start.offsetTicks > maximumDurationTicks ||
      JSON.stringify(previous.chord) !== JSON.stringify(next.chord)
    )
      continue;
    corrected[index] = {
      ...current,
      chord: previous.chord,
      confidence: Math.min(previous.confidence, current.confidence, next.confidence),
    };
  }
  return mergeHarmonySegments(corrected);
}
