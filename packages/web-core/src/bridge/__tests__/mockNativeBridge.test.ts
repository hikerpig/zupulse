import { describe, expect, it } from "vitest";
import { BRIDGE_SCHEMA_VERSION, createBridgeRequest, parseBridgeResponse } from "../schemas";
import { MockNativeBridge } from "../mockNativeBridge";

describe("MockNativeBridge", () => {
  it("returns Desktop GP Slice capabilities from handshake", async () => {
    const bridge = new MockNativeBridge();
    const request = createBridgeRequest("app.handshake", "handshake-1", {
      appVersion: "0.1.0",
      rendererBuildHash: "a".repeat(64),
    });

    const response = parseBridgeResponse(request.type, await bridge.request(request));

    expect(response.capabilities).toEqual({
      fileAccess: {
        openExternalFile: true,
        persistentFileReferences: false,
        localLibraryImport: false,
      },
      storage: { sqliteIndex: false, sidecarPayload: true },
      sync: { available: false, provider: "none" },
      audio: { webAudio: true, nativeBridge: false },
      localization: { changeLocale: true },
      externalNavigation: { openUrl: false },
    });
    expect(response.locale).toEqual({ preference: "system", effectiveLocale: "en-US" });
  });

  it("records only schema-defined event messages", () => {
    const bridge = new MockNativeBridge();
    bridge.emit({
      bridgeVersion: BRIDGE_SCHEMA_VERSION,
      correlationId: "event-1",
      type: "app.command",
      payload: { command: "toggle-playback" },
    });
    expect(bridge.events()).toEqual([
      {
        bridgeVersion: BRIDGE_SCHEMA_VERSION,
        correlationId: "event-1",
        type: "app.command",
        payload: { command: "toggle-playback" },
      },
    ]);
  });

  it("rejects event messages that fail the runtime schema", () => {
    const bridge = new MockNativeBridge();

    expect(() =>
      bridge.emit({
        bridgeVersion: BRIDGE_SCHEMA_VERSION,
        correlationId: "event-1",
        type: "app.command",
        payload: { command: "toggle-playback", path: "/tmp/score.gp" },
      } as never),
    ).toThrow();
    expect(bridge.events()).toEqual([]);
  });

  it("returns empty storage responses for unknown identities", async () => {
    const bridge = new MockNativeBridge();
    const identity = { contentHash: "a".repeat(64), format: "gp" as const };
    const sidecar = createBridgeRequest("sidecar.read", "read-1", { identity });
    const resume = createBridgeRequest("playbackResume.read", "read-2", { identity });
    await expect(bridge.request(sidecar)).resolves.toEqual({});
    await expect(bridge.request(resume)).resolves.toEqual({});
  });
});
