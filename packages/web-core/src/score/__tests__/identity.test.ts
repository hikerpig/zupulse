import { describe, expect, it } from "vitest";
import { createContentHash, createScoreIdentity } from "../identity";

describe("createContentHash", () => {
  it("creates a stable sha-256 hex hash", async () => {
    const bytes = new TextEncoder().encode("same score bytes");

    await expect(createContentHash(bytes)).resolves.toBe(
      "fe8e4d1525a2508eade49e8f394ddf5bb12dfeca0aa0426f2533d2d3c9b4b396",
    );
  });
});

describe("createScoreIdentity", () => {
  it("uses content hash as primary identity and format from file name", async () => {
    const bytes = new TextEncoder().encode("midi bytes");

    const identity = await createScoreIdentity({
      fileName: "Etude.MID",
      bytes,
      title: "Etude",
      trackNames: ["Piano"],
      tempoSummary: "120 bpm",
    });

    expect(identity).toEqual({
      contentHash: "9a860552822c2458da284714e00641663d9add23b59a2394d4b73a14a8dc80de",
      format: "midi",
      title: "Etude",
      sourceHints: {
        fileName: "Etude.MID",
        trackNames: ["Piano"],
        tempoSummary: "120 bpm",
      },
    });
  });
});
