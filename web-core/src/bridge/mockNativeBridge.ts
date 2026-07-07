import type { BridgeMessage, Capabilities, OpenFileRequest, OpenFileResponse } from "./types";

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
