export type TransportState =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "stopped"
  | "error";

export type LoopSnapMode = "off" | "beat" | "measure";

import type { z } from "zod";
import type { loopRegionSchema, musicalPositionSchema } from "./schemas";

export type MusicalPosition = z.infer<typeof musicalPositionSchema>;

export type MeasureTimeline = {
  id: string;
  index: number;
  startTick: number;
  durationTicks: number;
  beatTicks: number[];
};

export type PlaybackTimelineMap = {
  durationTicks: number;
  durationMs: number;
  measures: MeasureTimeline[];
};

export type LoopRegion = z.infer<typeof loopRegionSchema>;

export type LoopDraft = {
  start?: MusicalPosition;
  end?: MusicalPosition;
  snapMode: LoopSnapMode;
};

export type PlaybackTrack = {
  id: string;
  sourceIndex: number;
  name: string;
};

export type TrackMixState = {
  muted: boolean;
  solo: boolean;
  volume: number;
  muteUpdatedAt: string;
  volumeUpdatedAt: string;
};

export type TrackPlaybackState = {
  primaryVisibleTrackId: string;
  additionalVisibleTrackIds: string[];
  visibilityUpdatedAt: string;
  settings: Record<string, TrackMixState>;
};

export type PlaybackState = {
  sessionId: string;
  transport: TransportState;
  position: MusicalPosition;
  durationMs: number;
  scoreSpeed: number;
  looping: boolean;
  activeLoopId?: string;
  loopDraft: LoopDraft;
  loops: LoopRegion[];
  tracks: PlaybackTrack[];
  trackState: TrackPlaybackState;
  soundFont: "idle" | "loading" | "ready" | "error";
  persistence: "clean" | "saving" | "unsaved" | "error";
  errorCode?: string;
};

export type PlaybackCommand =
  | { type: "toggle-playback" }
  | { type: "pause" }
  | { type: "stop" }
  | { type: "retry-soundfont" }
  | { type: "seek"; position: MusicalPosition }
  | { type: "set-score-speed"; speed: number }
  | { type: "set-loop-enabled"; enabled: boolean }
  | { type: "set-loop-snap"; mode: LoopSnapMode }
  | { type: "set-loop-boundary"; boundary: "start" | "end"; position: MusicalPosition }
  | { type: "select-loop"; loopId: string }
  | { type: "save-loop"; label?: string }
  | { type: "rename-loop"; loopId: string; label: string }
  | { type: "delete-loop"; loopId: string }
  | { type: "set-loop-speed"; loopId: string; speed?: number }
  | { type: "set-primary-track"; trackId: string }
  | { type: "set-additional-tracks"; trackIds: string[] }
  | { type: "set-track-mute"; trackId: string; muted: boolean }
  | { type: "set-track-solo"; trackId: string; solo: boolean }
  | { type: "set-track-volume"; trackId: string; volume: number };

export type PlaybackEngineEvent =
  | { type: "ready" }
  | { type: "soundfont-loading" }
  | { type: "soundfont-ready" }
  | { type: "soundfont-error"; error: Error }
  | { type: "transport"; state: "playing" | "paused" | "stopped" }
  | { type: "position"; positionMs: number; endMs: number; tick: number }
  | { type: "error"; error: Error };

export type PlaybackEngineSnapshot = {
  soundFont: "loading" | "ready" | "error";
  transport: "playing" | "paused" | "stopped";
};

export interface PlaybackEngine {
  subscribe(listener: (event: PlaybackEngineEvent) => void): () => void;
  getSnapshot(): PlaybackEngineSnapshot;
  playPause(): void;
  stop(): void;
  retrySoundFont(): void;
  seekTick(tick: number): void;
  setSpeed(speed: number): void;
  setLoop(range: { startTick: number; endTick: number } | null, enabled: boolean): void;
  setVisibleTracks(trackIds: string[]): void;
  setTrackMute(trackId: string, muted: boolean): void;
  setTrackSolo(trackId: string, solo: boolean): void;
  setTrackVolume(trackId: string, volume: number): void;
  destroy(): void;
}
