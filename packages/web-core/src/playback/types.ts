export type TransportState = "idle" | "loading" | "ready" | "counting-in" | "playing" | "paused" | "stopped" | "error";

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
  name?: string;
  staves?: PlaybackStaff[];
};

export type PlaybackStaff = {
  id: string;
  sourceIndex: number;
  isPercussion: boolean;
};

export type PianoHandMapping = {
  trackId: string;
  rightStaffId: string;
  leftStaffId: string;
};

export type PianoHandMappingResult =
  | { availability: "available"; mapping: PianoHandMapping }
  | {
      availability: "not-applicable" | "ambiguous" | "audio-unsupported";
      code:
        | "piano-hand-practice-not-applicable"
        | "piano-hand-practice-ambiguous"
        | "piano-hand-practice-audio-unsupported";
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
  baseTempo: number;
  scoreSpeed: number;
  rhythm: RhythmPracticeSettings;
  pianoPractice: PianoHandPracticeState;
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

export type RhythmPracticeSetting = {
  enabled: boolean;
  volume: number;
  updatedAt: string;
};

export type RhythmPracticeSettings = {
  metronome: RhythmPracticeSetting;
  countIn: RhythmPracticeSetting;
};

export type PianoHandMode = "both-hands" | "right-hand" | "left-hand";

export type PianoHandPracticeState = {
  mode: PianoHandMode;
  requestedMode: PianoHandMode;
  availability: PianoHandMappingResult["availability"];
  unavailableCode?: Exclude<PianoHandMappingResult, { availability: "available" }>["code"];
  mapping?: PianoHandMapping;
  previewActive: boolean;
  pausedForAudioProjection: boolean;
};

export type PlaybackCommand =
  | { type: "toggle-playback" }
  | { type: "pause" }
  | { type: "stop" }
  | { type: "retry-soundfont" }
  | { type: "seek"; position: MusicalPosition }
  | { type: "set-score-speed"; speed: number }
  | { type: "set-metronome"; enabled: boolean }
  | { type: "set-metronome-volume"; volume: number }
  | { type: "set-count-in"; enabled: boolean }
  | { type: "set-count-in-volume"; volume: number }
  | { type: "set-piano-hand-mode"; mode: PianoHandMode }
  | { type: "preview-piano-target-hand"; active: boolean }
  | { type: "set-loop-enabled"; enabled: boolean }
  | { type: "set-loop-snap"; mode: LoopSnapMode }
  | { type: "set-loop-boundary"; boundary: "start" | "end"; position: MusicalPosition }
  | { type: "commit-loop-draft" }
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
  | { type: "count-in-started" }
  | { type: "count-in-ended" }
  | { type: "position"; positionMs: number; endMs: number; tick: number }
  | { type: "error"; error: Error };

export type PlaybackEngineSnapshot = {
  soundFont: "loading" | "ready" | "error";
  transport: "playing" | "paused" | "stopped";
};

export interface PlaybackEngine {
  subscribe(listener: (event: PlaybackEngineEvent) => void): () => void;
  getSnapshot(): PlaybackEngineSnapshot;
  playPause(options?: { skipCountIn?: boolean }): void;
  stop(): void;
  retrySoundFont(): void;
  seekTick(tick: number): void;
  setSpeed(speed: number): void;
  setMetronomeVolume(volume: number): void;
  setCountInVolume(volume: number): void;
  getPianoHandAudioCapability(mapping: PianoHandMapping): "supported" | "unsupported";
  setPianoStaffAudio(
    mapping: PianoHandMapping,
    audibleStaffIds: string[],
  ): Promise<{ pausedForAudioProjection: boolean }>;
  setLoop(range: { startTick: number; endTick: number } | null, enabled: boolean): void;
  setVisibleTracks(trackIds: string[]): void;
  setTrackMute(trackId: string, muted: boolean): void;
  setTrackSolo(trackId: string, solo: boolean): void;
  setTrackVolume(trackId: string, volume: number): void;
  destroy(): void;
}
