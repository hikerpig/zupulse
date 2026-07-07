import { describe, expect, it } from "vitest";
import { MockNativeBridge } from "./mockNativeBridge";
import { openFileThroughBridge } from "./openFileFlow";

describe("openFileThroughBridge", () => {
  it("discovers capabilities, opens bytes, and creates a viewer session", async () => {
    const bridge = new MockNativeBridge();
    bridge.registerFileBytes("file-1", {
      fileName: "practice.mid",
      bytes: new TextEncoder().encode("midi bytes"),
    });

    const session = await openFileThroughBridge({
      bridge,
      fileRef: "file-1",
      mode: "external-reference",
    });

    expect(session.source.fileName).toBe("practice.mid");
    expect(session.identity.format).toBe("midi");
    expect(session.capabilities.storage.sqliteIndex).toBe(true);
    expect(session.sidecar.schemaVersion).toBe("0.1.0");
  });
});
