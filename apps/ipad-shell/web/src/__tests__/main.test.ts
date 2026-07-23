// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { IndexedDbSheetLibraryRepository } from "@zupulse/web-storage";
import { bootstrapIpadApplication } from "../ipad-bridge-transport";
import { mountIpadViewerApplication } from "../ipad-viewer-host";

describe("iPad viewer composition", () => {
  it("initializes the shared IndexedDB repository before mounting the viewer", async () => {
    const calls: string[] = [];
    const repository = {
      async initialize() {
        calls.push("initialize");
      },
    } as unknown as IndexedDbSheetLibraryRepository;
    const mount = vi.fn((_root, dependencies) => {
      calls.push("mount");
      expect(dependencies.library?.repository).toBe(repository);
      expect(dependencies.library?.gateway).toBeDefined();
      expect(dependencies.library?.adapters.map((adapter) => adapter.format)).toEqual(["gp", "musicxml"]);
      return {
        async openScore() {},
        async togglePlayback() {},
        async pauseAndFlush() {},
        async destroy() {},
      };
    });

    await mountIpadViewerApplication(document.createElement("div"), {} as never, {
      createRepository: () => repository,
      mount,
    });

    expect(calls).toEqual(["initialize", "mount"]);
  });

  it("propagates repository startup errors without mounting or clearing storage", async () => {
    const failure = new Error("IDB_OPEN_BLOCKED");
    const repository = {
      initialize: vi.fn().mockRejectedValue(failure),
    } as unknown as IndexedDbSheetLibraryRepository;
    const mount = vi.fn();

    await expect(
      mountIpadViewerApplication(document.createElement("div"), {} as never, {
        createRepository: () => repository,
        mount,
      }),
    ).rejects.toBe(failure);

    expect(mount).not.toHaveBeenCalled();
  });

  it("renders a blocking startup state when repository initialization fails after handshake", async () => {
    const root = document.createElement("div");
    const metadata = {
      appVersion: "0.1.0",
      bridgeVersion: "3.0.0",
      buildHash: "fixture",
    };

    const started = await bootstrapIpadApplication({
      root,
      metadata,
      handler: {
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
              capabilities: {
                fileAccess: {
                  openExternalFile: true,
                  persistentFileReferences: false,
                  localLibraryImport: true,
                },
                storage: { sqliteIndex: false, sidecarPayload: false },
                sync: { available: false, provider: "none" },
                audio: { webAudio: true, nativeBridge: false },
              },
            },
          };
        },
      },
      async mount() {
        throw new Error("IDB_OPEN_BLOCKED");
      },
    });

    expect(started).toBe(false);
    expect(root.getAttribute("role")).toBe("alert");
    expect(root.textContent).toContain("IDB_OPEN_BLOCKED");
  });
});
