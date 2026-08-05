import type {
  MusicalPosition,
  PlaybackCommand,
  PlaybackState,
  PlaybackTimelineMap,
  PianoKeyHintEvent,
} from "@zupulse/web-core";
import type { ScoreMeasureBounds } from "../practice-loop/loop-range-geometry";
import type { ScoreStaffBounds } from "../score-navigation/alpha-tab-navigation";
import type { ScoreNavigationMode, ScoreNavigationSnapshot } from "../score-navigation/score-navigation-coordinator";

export type ViewerPianoKeyVisualization = {
  loadEvents(): readonly PianoKeyHintEvent[] | undefined;
  getTick(): number;
};

export type ViewerSessionSnapshot = {
  playback?: {
    state: PlaybackState;
    timeline: PlaybackTimelineMap;
  };
  navigation?: ScoreNavigationSnapshot;
  loopEditor: {
    measureBounds: readonly ScoreMeasureBounds[];
    staffBounds: readonly ScoreStaffBounds[];
  };
  pianoKeyVisualization?: ViewerPianoKeyVisualization;
};

export type ViewerNavigationCommand =
  | { type: "set-mode"; mode: ScoreNavigationMode }
  | { type: "return-to-playback" }
  | { type: "move-page"; delta: -1 | 1 };

export type ViewerSessionCommand =
  | { type: "playback"; command: PlaybackCommand }
  | { type: "preview-seek"; position: MusicalPosition }
  | { type: "navigation"; command: ViewerNavigationCommand }
  | { type: "pause-and-flush" };

export type ViewerSessionPort = {
  getSnapshot(): ViewerSessionSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(command: ViewerSessionCommand): Promise<void>;
  destroy(): Promise<void>;
};

export type ViewerPlaybackSlice = {
  getState(): PlaybackState;
  subscribe(listener: (state: PlaybackState) => void): () => void;
  dispatch(command: PlaybackCommand): Promise<void>;
  previewSeek(position: MusicalPosition): void;
  timeline: PlaybackTimelineMap;
};

export type ViewerNavigationSlice = {
  getState(): ScoreNavigationSnapshot;
  subscribe(listener: () => void): () => void;
  setMode(mode: ScoreNavigationMode): void;
  returnToPlayback(): void;
  movePage(delta: -1 | 1): void;
};

export type ViewerLoopEditorSlice = {
  getMeasureBounds(): readonly ScoreMeasureBounds[];
  getStaffBounds(): readonly ScoreStaffBounds[];
  subscribe(listener: () => void): () => void;
};

export type ViewerSessionSlices = {
  playback?: ViewerPlaybackSlice;
  navigation?: ViewerNavigationSlice;
  loopEditor?: ViewerLoopEditorSlice;
  pianoKeyVisualization?: ViewerPianoKeyVisualization;
};
