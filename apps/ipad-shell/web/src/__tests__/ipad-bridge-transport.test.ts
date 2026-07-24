// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IpadBridgeTransport,
  bootstrapIpadApplication,
  loadIpadBuildMetadata,
  type IpadBuildMetadata,
  type NativeMessageHandler,
} from "../ipad-bridge-transport";

const metadata: IpadBuildMetadata = {
  appVersion: "0.1.0",
  bridgeVersion: "3.0.0",
  buildHash: "fixture-build",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("IpadBridgeTransport", () => {
  it("mounts only after an exactly correlated handshake", async () => {
    const handler: NativeMessageHandler = {
      async postMessage(value) {
        const request = value as { bridgeVersion: string; correlationId: string; type: string };
        return {
          bridgeVersion: request.bridgeVersion,
          correlationId: request.correlationId,
          type: request.type,
          payload: {
            appVersion: metadata.appVersion,
            bridgeVersion: metadata.bridgeVersion,
            rendererBuildHash: metadata.buildHash,
            capabilities: capabilities(),
            locale: { preference: "system", effectiveLocale: "zh-CN" },
          },
        };
      },
    };
    const mount = vi.fn();
    const root = document.createElement("div");

    const result = await bootstrapIpadApplication({ root, metadata, handler, mount });

    expect(result).toBe(true);
    expect(mount).toHaveBeenCalledOnce();
  });

  it.each([
    ["mismatched correlation", (request: any) => ({ ...successResponse(request), correlationId: "late-other" })],
    ["unknown response type", (request: any) => ({ ...successResponse(request), type: "unknown.response" })],
    [
      "mismatched app version",
      (request: any) => ({
        ...successResponse(request),
        payload: { ...successResponse(request).payload, appVersion: "9.0.0" },
      }),
    ],
  ])("does not mount for %s", async (_name, createResponse) => {
    const root = document.createElement("div");
    const mount = vi.fn();
    const handler: NativeMessageHandler = {
      async postMessage(value) {
        return createResponse(value);
      },
    };

    const result = await bootstrapIpadApplication({ root, metadata, handler, mount });

    expect(result).toBe(false);
    expect(mount).not.toHaveBeenCalled();
    expect(root.getAttribute("role")).toBe("alert");
    expect(root.textContent).toContain("无法启动逐拍");
  });

  it("times out without entering the application", async () => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    const mount = vi.fn();
    const handler: NativeMessageHandler = { postMessage: () => new Promise(() => undefined) };
    const start = bootstrapIpadApplication({ root, metadata, handler, mount, timeoutMs: 25 });

    await vi.advanceTimersByTimeAsync(25);

    await expect(start).resolves.toBe(false);
    expect(mount).not.toHaveBeenCalled();
    expect(root.textContent).toContain("BRIDGE_TIMEOUT");
  });

  it("rejects pending work on destroy and ignores a late native response", async () => {
    let resolveNative!: (value: unknown) => void;
    const handler: NativeMessageHandler = {
      postMessage: () =>
        new Promise((resolve) => {
          resolveNative = resolve;
        }),
    };
    const transport = new IpadBridgeTransport(handler, { timeoutMs: 1000 });
    const request = transport.request("app.handshake", {
      appVersion: metadata.appVersion,
      rendererBuildHash: metadata.buildHash,
    });

    transport.destroy();
    await expect(request).rejects.toThrow("BRIDGE_TRANSPORT_DESTROYED");
    resolveNative(successResponse({ correlationId: "late", bridgeVersion: "3.0.0", type: "app.handshake" }));
    await Promise.resolve();

    expect(transport.pendingRequestCount).toBe(0);
  });
});

describe("loadIpadBuildMetadata", () => {
  it("accepts a valid manifest from a successful custom-scheme response without an HTTP status", async () => {
    const fetchManifest = vi.fn(async () => {
      return {
        ok: false,
        status: 0,
        json: async () => metadata,
      } as Response;
    });

    await expect(loadIpadBuildMetadata(fetchManifest as typeof fetch)).resolves.toEqual(metadata);
  });
});

function successResponse(request: any) {
  return {
    bridgeVersion: request.bridgeVersion,
    correlationId: request.correlationId,
    type: request.type,
    payload: {
      appVersion: metadata.appVersion,
      bridgeVersion: metadata.bridgeVersion,
      rendererBuildHash: metadata.buildHash,
      capabilities: capabilities(),
      locale: { preference: "system", effectiveLocale: "zh-CN" },
    },
  };
}

function capabilities() {
  return {
    fileAccess: {
      openExternalFile: true,
      persistentFileReferences: false,
      localLibraryImport: true,
    },
    storage: { sqliteIndex: false, sidecarPayload: false },
    sync: { available: false, provider: "none" },
    audio: { webAudio: true, nativeBridge: false },
    localization: { changeLocale: false },
  };
}
