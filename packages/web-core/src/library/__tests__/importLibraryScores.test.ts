import { describe, expect, it, vi } from "vitest";
import type { ScoreFormatAdapter } from "../../import/types";
import type { SheetLibraryRepository } from "../ports";
import { importLibraryScores, isSupportedLibraryScoreFile } from "../importLibraryScores";

const bytes = new TextEncoder().encode("<score-partwise><part/><measure/></score-partwise>");
const adapterOutput = {
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
};
const adapter: ScoreFormatAdapter = {
  format: "musicxml",
  parse: async () => adapterOutput,
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
  it("admits only formats supported by the Library import pipeline", () => {
    expect(isSupportedLibraryScoreFile("song.gp5")).toBe(true);
    expect(isSupportedLibraryScoreFile("score.musicxml")).toBe(true);
    expect(isSupportedLibraryScoreFile("score.mxl")).toBe(true);
    expect(isSupportedLibraryScoreFile("performance.mid")).toBe(false);
    expect(isSupportedLibraryScoreFile("performance.midi")).toBe(false);
    expect(isSupportedLibraryScoreFile("notes.txt")).toBe(false);
  });

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

  it("imports sequentially and cancellation preserves completed items", async () => {
    const store = repository();
    const controller = new AbortController();
    let activeReads = 0;
    let maximumActiveReads = 0;
    const source = (fileName: string) => ({
      fileName,
      readBytes: async () => {
        activeReads += 1;
        maximumActiveReads = Math.max(maximumActiveReads, activeReads);
        await Promise.resolve();
        activeReads -= 1;
        return bytes;
      },
    });

    const results = await importLibraryScores({
      repository: store,
      adapters: [adapter],
      sources: [source("first.musicxml"), source("second.musicxml")],
      signal: controller.signal,
      onResult: () => controller.abort(),
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("created");
    expect(maximumActiveReads).toBe(1);
    expect(store.add).toHaveBeenCalledOnce();
  });

  it("does not persist a candidate cancelled during parsing", async () => {
    const store = repository();
    const controller = new AbortController();
    const abortingAdapter: ScoreFormatAdapter = {
      format: "musicxml",
      parse: async () => {
        controller.abort();
        return adapterOutput;
      },
    };

    const results = await importLibraryScores({
      repository: store,
      adapters: [abortingAdapter],
      sources: [{ fileName: "cancelled.musicxml", readBytes: async () => bytes }],
      signal: controller.signal,
    });

    expect(results).toEqual([]);
    expect(store.add).not.toHaveBeenCalled();
  });
});
