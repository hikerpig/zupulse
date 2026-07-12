import type { SidecarPayload } from "../storage/sidecar";
import {
  BRIDGE_SCHEMA_VERSION,
  bridgeEventSchema,
  bridgeRequestSchema,
  capabilitiesSchema,
  parseBridgeResponse,
  type BridgeEvent,
  type BridgeRequest,
  type Capabilities,
} from "./schemas";
import type { LocalPlaybackResume, OpenFileResponse } from "./types";

export type NativeFileBytes = {
  fileName: string;
  bytes: Uint8Array;
};

const DEFAULT_CAPABILITIES: Capabilities = capabilitiesSchema.parse({
  fileAccess: {
    openExternalFile: true,
    persistentFileReferences: false,
    localLibraryImport: false,
  },
  storage: {
    sqliteIndex: false,
    sidecarPayload: true,
  },
  sync: {
    available: false,
    provider: "none",
  },
  audio: {
    webAudio: true,
    nativeBridge: false,
  },
});

export class MockNativeBridge {
  private readonly fileResponses = new Map<string, Extract<OpenFileResponse, { status: "opened" }>>();
  private readonly pendingFiles: Extract<OpenFileResponse, { status: "opened" }>[] = [];
  private readonly fileBytes = new Map<string, NativeFileBytes>();
  private readonly eventMessages: BridgeEvent[] = [];
  private readonly sidecars = new Map<string, SidecarPayload>();
  private readonly playbackResumes = new Map<string, LocalPlaybackResume>();
  private nextId = 1;

  constructor(private readonly capabilities: Capabilities = DEFAULT_CAPABILITIES) {}

  registerFile(fileRef: string, response: Omit<Extract<OpenFileResponse, { status: "opened" }>, "status">): void {
    const opened = parseBridgeResponse("file.open", { status: "opened", ...response });
    if (opened.status !== "opened") return;
    this.fileResponses.set(fileRef, opened);
    this.pendingFiles.push(opened);
  }

  registerFileBytes(fileToken: string, file: NativeFileBytes): void {
    this.fileBytes.set(fileToken, file);
    if (!this.fileResponses.has(fileToken)) {
      const opened = parseBridgeResponse("file.open", {
        status: "opened",
        fileToken,
        fileName: file.fileName,
        sizeBytes: file.bytes.byteLength,
      });
      if (opened.status === "opened") {
        this.fileResponses.set(fileToken, opened);
        this.pendingFiles.push(opened);
      }
    }
  }

  async request(message: BridgeRequest): Promise<unknown> {
    const request = bridgeRequestSchema.parse(message);

    switch (request.type) {
      case "app.handshake":
        return parseBridgeResponse(request.type, {
          appVersion: request.payload.appVersion,
          bridgeVersion: BRIDGE_SCHEMA_VERSION,
          rendererBuildHash: request.payload.rendererBuildHash,
          capabilities: this.capabilities,
        });
      case "file.open":
        return parseBridgeResponse(request.type, this.pendingFiles.shift() ?? { status: "cancelled" });
      case "file.readBytes": {
        const response = this.fileBytes.get(request.payload.fileToken);
        if (response === undefined) {
          throw new Error(`No mock file bytes registered for token: ${request.payload.fileToken}`);
        }
        return parseBridgeResponse(request.type, response);
      }
      case "sidecar.read": {
        const saved = this.sidecars.get(request.payload.identity.contentHash);
        return parseBridgeResponse(request.type, saved === undefined ? {} : { payload: structuredClone(saved) });
      }
      case "sidecar.write":
        this.sidecars.set(request.payload.identity.contentHash, structuredClone(request.payload.payload));
        return parseBridgeResponse(request.type, {});
      case "playbackResume.read": {
        const saved = this.playbackResumes.get(request.payload.identity.contentHash);
        return parseBridgeResponse(request.type, saved === undefined ? {} : { resume: structuredClone(saved) });
      }
      case "playbackResume.write":
        this.playbackResumes.set(request.payload.identity.contentHash, structuredClone(request.payload.resume));
        return parseBridgeResponse(request.type, {});
      case "app.lifecycleAck":
      case "diagnostics.write":
      case "diagnostics.openDirectory":
        return parseBridgeResponse(request.type, {});
    }
  }

  emit(event: BridgeEvent): void {
    this.eventMessages.push(bridgeEventSchema.parse(event));
  }

  events(): BridgeEvent[] {
    return [...this.eventMessages];
  }
}
