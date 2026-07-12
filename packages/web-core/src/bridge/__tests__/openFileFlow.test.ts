import { describe, expect, it } from "vitest";
import { MockNativeBridge } from "../mockNativeBridge";
import { openFileThroughBridge } from "../openFileFlow";

describe("openFileThroughBridge", () => {
  it("discovers capabilities, opens bytes, and creates a viewer session", async () => {
    const bridge = new MockNativeBridge();
    bridge.registerFileBytes("file-1", {
      fileName: "practice.mid",
      bytes: new TextEncoder().encode("midi bytes"),
    });

    const session = await openFileThroughBridge({
      bridge,
      handshake: { appVersion: "0.1.0", rendererBuildHash: "a".repeat(64) },
    });

    expect(session?.source.fileName).toBe("practice.mid");
    expect(session?.identity.format).toBe("midi");
    expect(session?.capabilities.storage.sqliteIndex).toBe(false);
    expect(session?.sidecar.schemaVersion).toBe("0.2.0");
  });

  it("returns undefined when native file selection is cancelled", async () => {
    await expect(
      openFileThroughBridge({
        bridge: new MockNativeBridge(),
        handshake: { appVersion: "0.1.0", rendererBuildHash: "a".repeat(64) },
      }),
    ).resolves.toBeUndefined();
  });
});
