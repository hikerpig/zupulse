import type { ViewerApplicationSnapshot } from "../../../app/ViewerApplication";
import { createHarmonyRangeViewItems } from "../harmony-range-view-model";

export type StudioSnapshot = NonNullable<ViewerApplicationSnapshot["studio"]>;
export type StudioRange = ReturnType<typeof createHarmonyRangeViewItems>[number];

export function createStudioRanges(studio: StudioSnapshot | undefined): readonly StudioRange[] {
  if (studio?.ranges) return studio.ranges;
  const document = studio?.document;
  if (!document) return [];

  return createHarmonyRangeViewItems(
    document.activeRevision.segments.map((segment) =>
      segment.status === "resolved"
        ? { type: "chord" as const, range: segment.range, chord: segment.chord, origin: "analysis" as const }
        : {
            type: "unresolved" as const,
            range: segment.range,
            reason: segment.reason,
            alternatives: segment.alternatives,
            origin: "analysis" as const,
          },
    ),
    document.activeRevision.segments,
  );
}

export function findSelectedStudioRange(
  studio: StudioSnapshot | undefined,
  ranges: readonly StudioRange[],
  fallbackSelectedKey: string | undefined,
): StudioRange | undefined {
  if (studio?.selection) {
    return ranges.find((item) => sameRange(item.effective.range, studio.selection!.range));
  }
  return ranges.find((item) => item.key === fallbackSelectedKey);
}

export function hasUnpersistedStudioDocument(studio: StudioSnapshot | undefined): boolean {
  return (
    studio?.status === "unsaved" ||
    studio?.status === "saving" ||
    studio?.status === "conflict" ||
    (studio?.status === "error" && studio.document != null)
  );
}

function sameRange(
  left: { start: { measureIndex: number; offsetTicks: number }; end: { measureIndex: number; offsetTicks: number } },
  right: { start: { measureIndex: number; offsetTicks: number }; end: { measureIndex: number; offsetTicks: number } },
): boolean {
  return (
    left.start.measureIndex === right.start.measureIndex &&
    left.start.offsetTicks === right.start.offsetTicks &&
    left.end.measureIndex === right.end.measureIndex &&
    left.end.offsetTicks === right.end.offsetTicks
  );
}
