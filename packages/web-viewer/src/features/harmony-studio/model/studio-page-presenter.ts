import type { TFunction } from "i18next";
import type { StudioApplicationSnapshot } from "../StudioApplication";
import type { ApplicationIssue } from "../../../app/applicationIssue";

export function documentStatusLabel(
  status: StudioApplicationSnapshot["status"],
  segmentCount: number,
  correctionCount: number,
  t: TFunction<"studio">,
): string {
  const counts = t("counts", { segments: segmentCount, corrections: correctionCount });
  if (status === "saving") return t("statusSaving", { counts });
  if (status === "analyzing") return t("statusAnalyzing", { counts });
  if (status === "unsaved") return t("statusUnsaved", { counts });
  if (status === "conflict") return t("statusConflict", { counts });
  if (status === "error") return t("statusError", { counts });
  return t("statusSaved", { counts });
}

export function previewStatusLabel(status: "playing" | "stopped" | "paused", t: TFunction<"studio">): string {
  if (status === "playing") return t("previewPlaying");
  if (status === "stopped") return t("previewStopped");
  return t("previewPaused");
}

export function audioStatusLabel(
  status: StudioApplicationSnapshot["audioStatus"],
  t: TFunction<"studio">,
): string | undefined {
  if (status === "loading") return t("audioLoading");
  if (status === "ready") return t("audioReady");
  if (status === "error") return t("audioFailed");
  if (status === "unavailable") return t("audioDisabled");
  return undefined;
}

export function studioIssueMessage(issue: ApplicationIssue | undefined, t: TFunction<"errors">): string {
  switch (issue?.code) {
    case "studio-storage-unavailable":
      return t("application.studioStorageUnavailable");
    case "score-not-found":
      return t("application.scoreNotFound");
    case "studio-format-unsupported":
      return t("application.studioFormatUnsupported");
    case "studio-runtime-unavailable":
      return t("application.studioRuntimeUnavailable");
    case "studio-analyzer-unavailable":
      return t("application.studioAnalyzerUnavailable");
    case "studio-no-analyzable-tracks":
      return t("application.studioNoAnalyzableTracks");
    case "studio-version-conflict":
      return t("application.studioVersionConflict");
    case "studio-save-failed":
      return t("application.studioSaveFailed");
    case "studio-preview-unavailable":
      return t("application.studioPreviewUnavailable");
    case "studio-preview-failed":
      return t("application.studioPreviewFailed");
    case "studio-audio-unavailable":
      return t("application.studioAudioUnavailable");
    default:
      return t("application.studioGeneric");
  }
}
