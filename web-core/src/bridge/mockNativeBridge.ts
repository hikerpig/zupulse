import type { BridgeMessage, Capabilities, OpenFileRequest, OpenFileResponse } from "./types";

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
  private readonly eventMessages: BridgeMessage<unknown>[] = [];
  private nextId = 1;

  registerFile(fileRef: string, response: OpenFileResponse): void {
    this.fileResponses.set(fileRef, response);
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
