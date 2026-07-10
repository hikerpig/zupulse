import { describe, expect, it } from "vitest";
import { createDefaultSidecar, encodeSidecar } from "../storage/sidecar";
import { createScoreIdentity } from "./identity";
import { createViewerSession } from "./session";
import type { Capabilities } from "../bridge/types";

const capabilities: Capabilities = {
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
};

describe("createViewerSession", () => {
  it("creates a session with identity, source summary, capabilities, and default sidecar", async () => {
    const bytes = new TextEncoder().encode("gp bytes");

    const session = await createViewerSession({
      fileName: "riff.gp5",
      bytes,
      capabilities,
    });

    expect(session.identity.format).toBe("gp");
    expect(session.source).toEqual({
      fileName: "riff.gp5",
      sizeBytes: 8,
      format: "gp",
    });
    expect(session.sidecar.identity).toEqual(session.identity);
    expect(session.capabilities.sync.provider).toBe("none");
  });

  it("uses an existing sidecar when provided", async () => {
    const bytes = new TextEncoder().encode("midi bytes");
    const identity = await createScoreIdentity({
      fileName: "lesson.mid",
      bytes,
    });
    const existing = createDefaultSidecar(identity);
    existing.practice.tempoOverride = 80;

    const session = await createViewerSession({
      fileName: "lesson.mid",
      bytes,
      capabilities,
      sidecarJson: encodeSidecar(existing),
    });

    expect(session.sidecar.practice.tempoOverride).toBe(80);
  });
});
