import { describe, expect, it } from "vitest";
import { MockNativeBridge } from "./mockNativeBridge";
import type { Capabilities, OpenFileResponse } from "./types";

describe("MockNativeBridge", () => {
  it("responds to capability discovery with platform-neutral capabilities", async () => {
    const bridge = new MockNativeBridge();

    const capabilities = await bridge.rpc<Capabilities>("capabilities.get", {});

    expect(capabilities).toEqual({
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
    });
  });

  it("can return a registered file response", async () => {
    const bridge = new MockNativeBridge();
    bridge.registerFile("file-1", {
      fileToken: "file-1",
      fileName: "riff.gp5",
      sizeBytes: 16,
    });

    const response = await bridge.rpc<OpenFileResponse>("file.open", {
      fileRef: "file-1",
      mode: "external-reference",
    });

    expect(response.fileName).toBe("riff.gp5");
  });

  it("records event messages with correlation ids", () => {
    const bridge = new MockNativeBridge();

    bridge.emit("playback.state", {
      state: "paused",
      positionMs: 1200,
    });

    expect(bridge.events()).toHaveLength(1);
    expect(bridge.events()[0]).toMatchObject({
      bridgeVersion: "0.1.0",
      type: "playback.state",
      payload: {
        state: "paused",
        positionMs: 1200,
      },
    });
    expect(bridge.events()[0]?.correlationId).toMatch(/^mock-/);
  });
});
