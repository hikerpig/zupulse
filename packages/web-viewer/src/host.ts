export type ViewerFile = { fileName: string; bytes: Uint8Array };
export type ViewerHostEvent =
  { type: "open-score" } | { type: "toggle-playback" } | { type: "suspend" } | { type: "prepare-close" };
export interface ViewerHost {
  openScore(): Promise<ViewerFile | undefined>;
  subscribe(listener: (event: ViewerHostEvent) => void): () => void;
  reportDiagnostic?(error: unknown, operation: string): void;
}
export type { LocaleHost } from "./i18n/locale-controller";
export type ViewerSessionHandle = {
  loopEditor?: {
    getMeasureBounds(): readonly import("./practice-loop/loop-range-geometry").ScoreMeasureBounds[];
    subscribe(listener: () => void): () => void;
  };
  navigation?: {
    getState(): import("./score-navigation/score-navigation-coordinator").ScoreNavigationSnapshot;
    subscribe(listener: () => void): () => void;
    setMode(mode: import("./score-navigation/score-navigation-coordinator").ScoreNavigationMode): void;
    returnToPlayback(): void;
    movePage(delta: -1 | 1): void;
  };
  playback?: {
    getState(): PlaybackState;
    subscribe(listener: (state: PlaybackState) => void): () => void;
    dispatch(command: PlaybackCommand): Promise<void>;
    previewSeek?(position: PlaybackState["position"]): void;
    timeline: PlaybackTimelineMap;
  };
  togglePlayback(): Promise<void>;
  pauseAndFlush(): Promise<void>;
  destroy(): Promise<void>;
};
export type ViewerAppHandle = ViewerSessionHandle & {
  openScore(): Promise<void>;
  importScoreSources?(sources: readonly ScoreImportSource[], multiple: boolean): Promise<void>;
};
import type { PlaybackCommand, PlaybackState, PlaybackTimelineMap, ScoreImportSource } from "@zupulse/web-core";
