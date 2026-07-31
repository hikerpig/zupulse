import type { PlaybackCommand, PlaybackState, PianoHandMode } from "@zupulse/web-core";
import type { TFunction } from "i18next";
import type { PlaybackViewModel } from "../../../playbackPresenter";

export function rhythmSummary(metronome: boolean, countIn: boolean, t: TFunction<"viewer">): string {
  if (metronome && countIn) return t("playback.rhythmBothEnabled");
  if (metronome) return t("playback.metronomeEnabled");
  if (countIn) return t("playback.countInEnabled");
  return t("playback.rhythmDisabled");
}

export function pianoPracticeSummary(state: PlaybackState["pianoPractice"], t: TFunction<"viewer">): string {
  if (state.availability !== "available") {
    return state.unavailableCode ? pianoUnavailableReason(state.unavailableCode, t) : t("playback.handUnavailable");
  }
  return pianoHandModeLabel(state.mode, t);
}

export function pianoHandModeLabel(mode: PianoHandMode, t: TFunction<"viewer">): string {
  if (mode === "right-hand") return t("playback.practiceRightHand");
  if (mode === "left-hand") return t("playback.practiceLeftHand");
  return t("playback.bothHandsDemo");
}

export function pianoUnavailableReason(
  code:
    "piano-hand-practice-not-applicable" | "piano-hand-practice-ambiguous" | "piano-hand-practice-audio-unsupported",
  t: TFunction<"viewer">,
): string {
  if (code === "piano-hand-practice-ambiguous") return t("playback.handAmbiguous");
  if (code === "piano-hand-practice-audio-unsupported") return t("playback.handAudioUnsupported");
  return t("playback.handNotApplicable");
}

export function loopSpeedCommand(loopId: string, value: string): PlaybackCommand {
  return value === ""
    ? { type: "set-loop-speed", loopId }
    : { type: "set-loop-speed", loopId, speed: Number(value) / 100 };
}

export function loopDisplayLabel(loop: PlaybackViewModel["loops"][number], t: TFunction<"viewer">): string {
  return loop.labelSource === "user" && loop.label
    ? loop.label
    : t("playback.measureRange", {
        start: loop.startMeasureIndex + 1,
        end: loop.endMeasureIndex + 1,
      });
}

export function trackDisplayName(track: PlaybackViewModel["tracks"][number], t: TFunction<"viewer">): string {
  return track.name ?? t("playback.trackFallback", { number: track.sourceIndex + 1 });
}

export function persistenceMessage(state: PlaybackViewModel["persistence"], t: TFunction<"viewer">): string {
  if (state === "saving") return t("playback.persistenceSaving");
  if (state === "unsaved" || state === "error") return t("playback.persistenceUnsaved");
  return "";
}

export function audioStatusLabel(soundFont: PlaybackViewModel["soundFont"], t: TFunction<"viewer">): string {
  if (soundFont === "ready") return t("playback.audio.ready");
  if (soundFont === "error") return t("playback.audio.error");
  return t("playback.audio.loading");
}
