// Shared viewer playback presentation.
import type { PlaybackState } from "@tab-viewer/web-core";

export type PlaybackViewModel = {
  playLabel: "播放" | "暂停";
  playDisabled: boolean;
  stopDisabled: boolean;
  currentTime: string;
  duration: string;
  progress: number;
  speedPercent: number;
  looping: boolean;
  loopDraftStart: number;
  loopDraftEnd: number;
  loopSnapMode: "off" | "beat" | "measure";
  soundFontRetryVisible: boolean;
  persistenceMessage: string;
  loops: Array<{
    id: string;
    label: string;
    rangeLabel: string;
    speedPercent?: number;
    selected: boolean;
  }>;
  tracks: Array<{
    id: string;
    name: string;
    primary: boolean;
    additional: boolean;
    muted: boolean;
    solo: boolean;
    volumePercent: number;
  }>;
};

export function presentPlayback(state: PlaybackState): PlaybackViewModel {
  const durationMs = finiteOrZero(state.durationMs);
  const currentMs = finiteOrZero(state.position.cachedTimeMs);
  const loops = state.loops.filter(loop => loop.deletedAt === undefined).map(loop => {
    const item: PlaybackViewModel["loops"][number] = {
      id: loop.id,
      label: loop.label,
      rangeLabel: `小节 ${loop.start.measureIndex + 1}–${loop.end.measureIndex + 1}`,
      selected: state.activeLoopId === loop.id,
    };
    if (loop.speedOverride !== undefined) {
      item.speedPercent = Math.round(loop.speedOverride * 100);
    }
    return item;
  });

  return {
    playLabel: state.transport === "playing" ? "暂停" : "播放",
    playDisabled: state.soundFont !== "ready",
    stopDisabled: state.transport === "idle" || state.transport === "loading",
    currentTime: formatTime(currentMs),
    duration: formatTime(durationMs),
    progress: ratio(currentMs, durationMs),
    speedPercent: Math.round(state.scoreSpeed * 100),
    looping: state.looping,
    loopDraftStart: ratio(state.loopDraft.start?.cachedTimeMs ?? 0, durationMs),
    loopDraftEnd: ratio(state.loopDraft.end?.cachedTimeMs ?? 0, durationMs),
    loopSnapMode: state.loopDraft.snapMode,
    soundFontRetryVisible: state.soundFont === "error",
    persistenceMessage: persistenceMessage(state.persistence),
    loops,
    tracks: state.tracks.map(track => {
      const mix = state.trackState.settings[track.id];
      return {
        id: track.id,
        name: track.name,
        primary: state.trackState.primaryVisibleTrackId === track.id,
        additional: state.trackState.additionalVisibleTrackIds.includes(track.id),
        muted: mix?.muted ?? false,
        solo: mix?.solo ?? false,
        volumePercent: Math.round((mix?.volume ?? 1) * 100),
      };
    }),
  };
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function ratio(value: number, total: number): number {
  if (!Number.isFinite(value) || total <= 0) return 0;
  return Math.min(1, Math.max(0, value / total));
}

function formatTime(valueMs: number): string {
  const totalSeconds = Math.floor(valueMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function persistenceMessage(state: PlaybackState["persistence"]): string {
  if (state === "saving") return "正在保存练习设置";
  if (state === "unsaved" || state === "error") return "练习设置尚未保存";
  return "";
}
