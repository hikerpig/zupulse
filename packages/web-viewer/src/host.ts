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
export interface ExternalNavigationHost {
  openExternalUrl(url: string): Promise<void>;
}
export interface ViewerHost {
  subscribe(listener: (event: ViewerHostEvent) => void): () => void;
  reportDiagnostic?(error: unknown, operation: string): void;
  telemetry?: import("@zupulse/web-core").TelemetryPort;
  externalNavigation?: ExternalNavigationHost;
}
export type TelemetryPreferenceSnapshot = {
  available: boolean;
  enabled: boolean;
  noticeAcknowledged: boolean;
};
export type TelemetryControl = {
  getState(): TelemetryPreferenceSnapshot;
  acknowledgeNotice(): Promise<void> | void;
  setPreference(enabled: boolean): Promise<void>;
};
export type { LocaleHost } from "./i18n/locale-controller";
export type ViewerAppHandle = {
  openScore(): Promise<void>;
  importScoreSources?(sources: readonly ScoreImportSource[]): Promise<void>;
  togglePlayback(): Promise<void>;
  pauseAndFlush(): Promise<void>;
  destroy(): Promise<void>;
};
import type { ScoreImportSource } from "@zupulse/web-core";
