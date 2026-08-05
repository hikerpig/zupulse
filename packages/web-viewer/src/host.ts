export type ViewerFile = { fileName: string; bytes: Uint8Array };
export type ViewerDomBindings = {
  alphaTabHost: HTMLElement;
  scoreScrollElement: HTMLElement;
  status: HTMLElement;
  summary: HTMLElement;
};
export type ViewerOpenFailureStage = "render" | "session";
export class ViewerOpenFailure extends Error {
  constructor(
    public readonly stage: ViewerOpenFailureStage,
    options?: ErrorOptions,
  ) {
    super(`Viewer ${stage} failed`, options);
    this.name = "ViewerOpenFailure";
  }
}
export type ViewerHostEvent =
  { type: "open-score" } | { type: "toggle-playback" } | { type: "suspend" } | { type: "prepare-close" };
export interface ViewerHost {
  subscribe(listener: (event: ViewerHostEvent) => void): () => void;
  reportDiagnostic?(error: unknown, operation: string): void;
}
export type { LocaleHost } from "./i18n/locale-controller";
export type ViewerSessionHandle = {
  pianoKeyVisualization?: {
    loadEvents(): readonly import("@zupulse/web-core").PianoKeyHintEvent[] | undefined;
    getTick(): number;
  };
  loopEditor?: {
    getMeasureBounds(): readonly import("./practice-loop/loop-range-geometry").ScoreMeasureBounds[];
    getStaffBounds?(): readonly import("./score-navigation/alpha-tab-navigation").ScoreStaffBounds[];
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
  importScoreSources?(sources: readonly ScoreImportSource[]): Promise<void>;
};
import type { PlaybackCommand, PlaybackState, PlaybackTimelineMap, ScoreImportSource } from "@zupulse/web-core";
