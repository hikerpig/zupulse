import type {
  BridgeMessage,
  Capabilities,
  LocalPlaybackResume,
  OpenFileRequest,
  OpenFileResponse,
  ReadPlaybackResumeRequest,
  ReadSidecarRequest,
  WritePlaybackResumeRequest,
  WriteSidecarRequest,
} from "./types";
import type { SidecarPayload } from "../storage/sidecar";

export type NativeFileBytes = {
  fileName: string;
  bytes: Uint8Array;
};

const DEFAULT_CAPABILITIES: Capabilities = {
  fileAccess: {
    externalReferences: true,
    securityBookmarks: true,
    localLibraryImport: true,
  },
  storage: {
    sqliteIndex: true,
    sidecarPayload: true,
  },
  sync: {
    available: true,
    provider: "cloudkit",
  },
  audio: {
    webAudio: true,
    nativeBridge: false,
  },
};

export class MockNativeBridge {
  private readonly fileResponses = new Map<string, OpenFileResponse>();
  private readonly fileBytes = new Map<string, NativeFileBytes>();
  private readonly eventMessages: BridgeMessage<unknown>[] = [];
  private readonly sidecars = new Map<string, SidecarPayload>();
  private readonly playbackResumes = new Map<string, LocalPlaybackResume>();
  private nextId = 1;

  registerFile(fileRef: string, response: OpenFileResponse): void {
    this.fileResponses.set(fileRef, response);
  }

  registerFileBytes(fileRef: string, file: NativeFileBytes): void {
    this.fileBytes.set(fileRef, file);
    this.fileResponses.set(fileRef, {
      fileToken: fileRef,
      fileName: file.fileName,
      sizeBytes: file.bytes.byteLength,
    });
  }

  async rpc<TResponse>(type: string, payload: unknown): Promise<TResponse> {
    if (type === "capabilities.get") {
      return DEFAULT_CAPABILITIES as TResponse;
    }

    if (type === "file.open") {
      const request = payload as OpenFileRequest;
      const response = this.fileResponses.get(request.fileRef);
      if (response === undefined) {
        throw new Error(`No mock file registered for ref: ${request.fileRef}`);
      }
      return response as TResponse;
    }

    if (type === "file.readBytes") {
      const request = payload as { fileToken: string };
      const response = this.fileBytes.get(request.fileToken);
      if (response === undefined) {
        throw new Error(`No mock file bytes registered for token: ${request.fileToken}`);
      }
      return response as TResponse;
    }

    if (type === "sidecar.read") {
      const request = payload as ReadSidecarRequest;
      const saved = this.sidecars.get(request.identity.contentHash);
      return (saved === undefined ? {} : { payload: structuredClone(saved) }) as TResponse;
    }

    if (type === "sidecar.write") {
      const request = payload as WriteSidecarRequest;
      this.sidecars.set(request.identity.contentHash, structuredClone(request.payload));
      return undefined as TResponse;
    }

    if (type === "playbackResume.read") {
      const request = payload as ReadPlaybackResumeRequest;
      const saved = this.playbackResumes.get(request.identity.contentHash);
      return (saved === undefined ? {} : { resume: structuredClone(saved) }) as TResponse;
    }

    if (type === "playbackResume.write") {
      const request = payload as WritePlaybackResumeRequest;
      this.playbackResumes.set(request.identity.contentHash, structuredClone(request.resume));
      return undefined as TResponse;
    }

    throw new Error(`Unsupported mock RPC: ${type}`);
  }

  emit<TPayload>(type: string, payload: TPayload): void {
    this.eventMessages.push({
      bridgeVersion: "0.1.0",
      type,
      correlationId: `mock-${this.nextId++}`,
      payload,
    });
  }

  events(): BridgeMessage<unknown>[] {
    return [...this.eventMessages];
  }
}
