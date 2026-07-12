import { describe, expect, it, vi } from "vitest";
import type { ScoreFormatAdapter } from "../import/types";
import type { SheetLibraryRepository } from "./ports";
import { importLibraryScores } from "./importLibraryScores";

const bytes = new TextEncoder().encode("<score-partwise><part/><measure/></score-partwise>");
const adapter: ScoreFormatAdapter = {
  format: "musicxml",
  parse: async () => ({
    runtime: {},
    diagnostics: [],
    capabilities: { view: true, playback: false },
    document: {
      schemaVersion: "0",
      summary: { title: "Test", trackCount: 1 },
      tracks: [{ id: "x", name: "x", staves: [], playback: { muted: false, solo: false, volume: 1 } }],
      timeline: { ticksPerQuarter: 1, durationTicks: 1 },
      sections: [],
    },
  }),
};

function repository(): SheetLibraryRepository {
  return {
    initialize: async () => undefined,
    list: async () => [],
    get: async () => undefined,
    findByIdentity: async () => undefined,
    add: vi.fn(async (draft) => ({
      status: "created" as const,
      score: {
        ...draft,
        title: draft.parsedTitle ?? draft.file.fileName,
        importedAt: draft.importedAt,
        isFavorite: false,
        practice: { hasLoop: false },
        metadata: {},
      },
    })),
    readScore: async () => {
      throw new Error("missing");
    },
    updateMetadata: async () => {
      throw new Error("unused");
    },
    setFavorite: async () => undefined,
    markOpened: async () => undefined,
    delete: async () => undefined,
  };
}

describe("importLibraryScores", () => {
  it("imports independently and leaves invalid files out of the repository", async () => {
    const store = repository();
    const results = await importLibraryScores({
      repository: store,
      adapters: [adapter],
      sources: [
        { fileName: "valid.musicxml", readBytes: async () => bytes },
        { fileName: "nope.txt", readBytes: async () => bytes },
      ],
    });
    expect(results.map((item) => item.status)).toEqual(["created", "failed"]);
    expect(store.add).toHaveBeenCalledOnce();
  });
});
