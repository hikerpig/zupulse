import type { ScoreIdentity } from "../score/types";

export type BridgeMessage<TPayload> = {
  bridgeVersion: string;
  type: string;
  correlationId: string;
  payload: TPayload;
};

export type BridgeError = {
  code: string;
  message: string;
  recoverable: boolean;
  details?: unknown;
};

export type Capabilities = {
  fileAccess: {
    externalReferences: boolean;
    securityBookmarks: boolean;
    localLibraryImport: boolean;
  };
  storage: {
    sqliteIndex: boolean;
    sidecarPayload: boolean;
  };
  sync: {
    available: boolean;
    provider: "cloudkit" | "none" | "custom";
  };
  audio: {
    webAudio: boolean;
    nativeBridge: boolean;
  };
};

export type OpenFileRequest = {
  fileRef: string;
  mode: "external-reference" | "local-library-copy";
};

export type OpenFileResponse = {
  fileToken: string;
  fileName: string;
  sizeBytes: number;
  contentHash?: string;
};

export type ReadSidecarRequest = {
  identity: ScoreIdentity;
};

export type WriteSidecarRequest = {
  identity: ScoreIdentity;
  payload: unknown;
};

export type SyncRequest = {
  identity?: ScoreIdentity;
  reason: "startup" | "manual" | "sidecar-updated";
};

export type PlaybackStateEvent = {
  state: "idle" | "loading" | "playing" | "paused" | "stopped" | "error";
  positionMs: number;
  currentMeasureId?: string;
  currentNoteIds?: string[];
};

export type SyncStateEvent = {
  state: "idle" | "syncing" | "conflict" | "error";
  lastSyncedAt?: string;
  identity?: ScoreIdentity;
};

export type ViewerInteractionEvent = {
  action:
    | "section-created"
    | "loop-changed"
    | "annotation-updated"
    | "midi-quantization-updated"
    | "midi-measure-corrected";
  identity: ScoreIdentity;
  payload: unknown;
};
