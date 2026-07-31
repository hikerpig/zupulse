import type { ViewerApplication } from "../../../app/ViewerApplication";
import { HarmonyRangeWorkspace } from "../harmony-range-workspace";
import type { StudioRange } from "../model/studio-page-model";
import { StudioSegmentInspector } from "./studio-segment-inspector";

export function StudioWorkspace({
  application,
  libraryScoreId,
  ranges,
  selectedRange,
  onSelect,
}: {
  application: ViewerApplication;
  libraryScoreId: string;
  ranges: readonly StudioRange[];
  selectedRange: StudioRange | undefined;
  onSelect(item: StudioRange): void;
}) {
  return (
    <HarmonyRangeWorkspace
      ranges={ranges}
      {...(selectedRange ? { selectedKey: selectedRange.key } : {})}
      onSelect={onSelect}
      editor={
        <StudioSegmentInspector
          application={application}
          libraryScoreId={libraryScoreId}
          selectedRange={selectedRange}
        />
      }
    />
  );
}
