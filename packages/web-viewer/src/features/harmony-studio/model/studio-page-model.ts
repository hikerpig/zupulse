import type { StudioApplicationSnapshot } from "../StudioApplication";
import { createHarmonyRangeViewItems } from "../harmony-range-view-model";

export type StudioSnapshot = StudioApplicationSnapshot;
export type StudioRange = ReturnType<typeof createHarmonyRangeViewItems>[number];

export function findSelectedStudioRange(
  studio: StudioSnapshot | undefined,
  ranges: readonly StudioRange[],
): StudioRange | undefined {
  const selection = studio?.selection;
  if (selection === undefined) return undefined;
  return ranges.find((item) => sameRange(item.effective.range, selection.range));
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
