import {
  compareMoments,
  effectiveHarmonyProjection,
  parseSourceHarmonyEvents,
  projectSourceHarmonyEvents,
  type HarmonyAnalysisDocument,
} from "@zupulse/web-core";
import { createHarmonyRangeViewItems, type HarmonyRangeViewItem } from "../harmony-range-view-model";

export type StudioHarmonySource = { rootXml: string; partIds: readonly string[] };

/**
 * Projects the effective harmony ranges for a Studio document. This is the single source of
 * `studio.ranges` in the snapshot: corrections and source events override the analysis revision
 * (per effectiveHarmonyProjection) so a corrected range surfaces with `origin: "correction"`.
 */
export function projectStudioRanges(
  source: StudioHarmonySource | undefined,
  document: HarmonyAnalysisDocument,
): HarmonyRangeViewItem[] {
  const scoreEnd = document.activeRevision.segments.reduce(
    (end, segment) => (compareMoments(segment.range.end, end) > 0 ? segment.range.end : end),
    { measureIndex: 0, offsetTicks: 0 },
  );
  const partId = source?.partIds[trackIndexFromId(document.annotationTarget.trackId)];
  const projection = effectiveHarmonyProjection({
    revision: document.activeRevision.segments,
    source:
      source === undefined || partId === undefined
        ? []
        : projectSourceHarmonyEvents(parseSourceHarmonyEvents(source.rootXml, partId), scoreEnd),
    corrections: document.corrections,
  });
  return createHarmonyRangeViewItems(projection, document.activeRevision.segments);
}

function trackIndexFromId(trackId: string): number {
  const match = /^track-(\d+)$/.exec(trackId);
  if (!match || Number(match[1]) < 1) throw new Error("ANNOTATION_TARGET_NOT_FOUND");
  return Number(match[1]) - 1;
}
