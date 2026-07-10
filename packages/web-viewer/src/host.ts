export type ViewerFile = { fileName: string; bytes: Uint8Array };
export type ViewerHostEvent =
  | { type: "open-score" }
  | { type: "toggle-playback" }
  | { type: "suspend" }
  | { type: "prepare-close" };
export interface ViewerHost {
  openScore(): Promise<ViewerFile | undefined>;
  subscribe(listener: (event: ViewerHostEvent) => void): () => void;
}
export type ViewerSessionHandle = {
  pauseAndFlush(): Promise<void>;
  destroy(): Promise<void>;
};
export type ViewerAppHandle = ViewerSessionHandle & { openScore(): Promise<void> };
