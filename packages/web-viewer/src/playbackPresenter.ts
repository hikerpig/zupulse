// Shared viewer playback presentation.
import type { PlaybackState } from "@zupulse/web-core";

export type PlaybackViewModel = {
  isPlaying: boolean;
  playDisabled: boolean;
  stopDisabled: boolean;
  currentTime: string;
  duration: string;
  progress: number;
  speedPercent: number;
  baseTempo: number;
  currentTempo: number;
  looping: boolean;
  loopDraftStart: number;
  loopDraftEnd: number;
  loopSnapMode: "off" | "beat" | "measure";
  soundFont: PlaybackState["soundFont"];
  audioStatusTone: "subtle" | "ready" | "error";
  persistence: PlaybackState["persistence"];
  trackCount: number;
  primaryTrackName?: string;
  loops: Array<{
    id: string;
    labelSource: "generated" | "user";
    label?: string;
    startMeasureIndex: number;
    endMeasureIndex: number;
    speedPercent?: number;
    selected: boolean;
  }>;
  tracks: Array<{
    id: string;
    sourceIndex: number;
    name?: string;
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
  const loops = state.loops
    .filter((loop) => loop.deletedAt === undefined)
    .map((loop) => {
      const item: PlaybackViewModel["loops"][number] = {
        id: loop.id,
        labelSource: loop.labelSource,
        startMeasureIndex: loop.start.measureIndex,
        endMeasureIndex: loop.end.measureIndex,
        selected: state.activeLoopId === loop.id,
      };
      if (loop.label !== undefined) item.label = loop.label;
      if (loop.speedOverride !== undefined) {
        item.speedPercent = Math.round(loop.speedOverride * 100);
      }
      return item;
    });
  const primaryTrack = state.tracks.find((track) => state.trackState.primaryVisibleTrackId === track.id)?.name;

  return {
    isPlaying: state.transport === "playing" || state.transport === "counting-in",
    playDisabled: state.soundFont !== "ready",
    stopDisabled: state.transport === "idle" || state.transport === "loading",
    currentTime: formatTime(currentMs),
    duration: formatTime(durationMs),
    progress: ratio(currentMs, durationMs),
    speedPercent: Math.round(state.scoreSpeed * 100),
    baseTempo: state.baseTempo,
    currentTempo: Math.round(state.baseTempo * state.scoreSpeed),
    looping: state.looping,
    loopDraftStart: ratio(state.loopDraft.start?.cachedTimeMs ?? 0, durationMs),
    loopDraftEnd: ratio(state.loopDraft.end?.cachedTimeMs ?? 0, durationMs),
    loopSnapMode: state.loopDraft.snapMode,
    soundFont: state.soundFont,
    audioStatusTone: audioStatusTone(state.soundFont),
    persistence: state.persistence,
    trackCount: state.tracks.length,
    ...(primaryTrack === undefined ? {} : { primaryTrackName: primaryTrack }),
    loops,
    tracks: state.tracks.map((track) => {
      const mix = state.trackState.settings[track.id];
      return {
        id: track.id,
        sourceIndex: track.sourceIndex,
        ...(track.name === undefined ? {} : { name: track.name }),
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

function audioStatusTone(soundFont: PlaybackState["soundFont"]): "subtle" | "ready" | "error" {
  if (soundFont === "ready") return "ready";
  if (soundFont === "error") return "error";
  return "subtle";
}
