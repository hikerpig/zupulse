import { describe, expect, it } from "vitest";
import { openScore } from "../openScore";
import type { Capabilities } from "../../bridge/types";
import type { ScoreFormatAdapter } from "../types";

const capabilities: Capabilities = {
  fileAccess: { openExternalFile: true, persistentFileReferences: false, localLibraryImport: false },
  storage: { sqliteIndex: false, sidecarPayload: true },
  sync: { available: false, provider: "none" },
  audio: { webAudio: true, nativeBridge: false },
  localization: { changeLocale: false },
  externalNavigation: { openUrl: false },
};
const bytes = new TextEncoder().encode("<score-partwise><part/><measure/></score-partwise>");
const adapter: ScoreFormatAdapter = {
  format: "musicxml",
  async parse() {
    return {
      runtime: { score: true },
      diagnostics: [],
      capabilities: { view: true, playback: false },
      document: {
        schemaVersion: "0.3.0",
        summary: { title: "Test", trackCount: 1 },
        tracks: [{ id: "track-1", name: "Piano", staves: [], playback: { muted: false, solo: false, volume: 1 } }],
        timeline: { ticksPerQuarter: 960, durationTicks: 0 },
        sections: [],
      },
    };
  },
};

describe("openScore", () => {
  it("builds a candidate without mutating an existing session", async () => {
    const existing = { id: "keep-me" };
    const result = await openScore({ fileName: "score.xml", bytes, capabilities, adapters: [adapter] });
    expect(result.status).toBe("success");
    expect(existing.id).toBe("keep-me");
    if (result.status === "failure") throw new Error("expected success");
    expect(result.candidate.session.identity.format).toBe("musicxml");
  });

  it("returns failure without a candidate for malformed files", async () => {
    const result = await openScore({
      fileName: "broken.musicxml",
      bytes: new TextEncoder().encode("<score-partwise>"),
      capabilities,
      adapters: [adapter],
    });
    expect(result).toMatchObject({ status: "failure" });
    expect(result).not.toHaveProperty("candidate");
  });
});
