import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type {
  HarmonyAnalysisDocument,
  HarmonyAnalysisRepository,
  ScoreFormatAdapter,
  SheetLibraryRepository,
} from "@zupulse/web-core";
import { ViewerApplication } from "../ViewerApplication";

describe("ViewerApplication", () => {
  it("keeps cancellation on the current session and replaces a selected file", async () => {
    const destroy = vi.fn(async () => undefined);
    const files = [
      { fileName: "first.gp5", bytes: new Uint8Array([1]) },
      undefined,
      { fileName: "second.gp5", bytes: new Uint8Array([2]) },
    ];
    const application = new ViewerApplication(
      { openScore: async () => files.shift(), subscribe: () => () => undefined },
      async () => ({ togglePlayback: vi.fn(), pauseAndFlush: vi.fn(), destroy }),
    );

    await application.openScore();
    const firstSessionId = application.getSnapshot().currentSessionId;
    await application.openScore();
    expect(application.getSnapshot().currentSessionId).toBe(firstSessionId);

    await application.openScore();
    expect(application.getSnapshot().currentSessionId).not.toBe(firstSessionId);
    expect(destroy).toHaveBeenCalledOnce();
    await application.destroy();
  });

  it("coalesces concurrent opens for the same library score", async () => {
    const scoreId = "00000000-0000-4000-8000-000000000001";
    const file = { fileName: "score.gp", bytes: new Uint8Array([1]) };
    const readScore = vi.fn(async () => file);
    const openSession = vi.fn(async () => ({
      togglePlayback: async () => undefined,
      pauseAndFlush: async () => undefined,
      destroy: async () => undefined,
    }));
    const repository: SheetLibraryRepository = {
      initialize: async () => undefined,
      list: async () => [],
      get: async () => undefined,
      findByIdentity: async () => undefined,
      add: async () => {
        throw new Error("unused");
      },
      readScore,
      updateMetadata: async () => {
        throw new Error("unused");
      },
      setFavorite: async () => undefined,
      markOpened: async () => undefined,
      delete: async () => undefined,
    };
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      openSession,
      { repository, gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" }, adapters: [] },
    );

    await Promise.all([application.openLibraryScore(scoreId), application.openLibraryScore(scoreId)]);

    expect(readScore).toHaveBeenCalledOnce();
    expect(openSession).toHaveBeenCalledOnce();
    await application.destroy();
  });

  it("emits an explicit navigation target after a single score import", async () => {
    const bytes = new TextEncoder().encode("<score-partwise><part/><measure/></score-partwise>");
    const adapter: ScoreFormatAdapter = {
      format: "musicxml",
      parse: async () => ({
        runtime: {},
        diagnostics: [],
        capabilities: { view: true, playback: false },
        document: {
          schemaVersion: "0",
          summary: { title: "Imported", trackCount: 1 },
          tracks: [{ id: "x", name: "x", staves: [], playback: { muted: false, solo: false, volume: 1 } }],
          timeline: { ticksPerQuarter: 1, durationTicks: 1 },
          sections: [],
        },
      }),
    };
    const repository: SheetLibraryRepository = {
      initialize: async () => undefined,
      list: async () => [],
      get: async () => undefined,
      findByIdentity: async () => undefined,
      add: async (draft) => ({
        status: "created",
        score: {
          ...draft,
          fileName: draft.file.fileName,
          title: draft.parsedTitle ?? draft.file.fileName,
          isFavorite: false,
          practice: { hasLoop: false },
          metadata: {},
        },
      }),
      readScore: async () => {
        throw new Error("unused");
      },
      updateMetadata: async () => {
        throw new Error("unused");
      },
      setFavorite: async () => undefined,
      markOpened: async () => undefined,
      delete: async () => undefined,
    };
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      async () => {
        throw new Error("unused");
      },
      {
        repository,
        gateway: {
          selectForImport: async () => [{ fileName: "imported.musicxml", readBytes: async () => bytes }],
          saveExport: async () => "cancelled",
        },
        adapters: [adapter],
      },
    );
    const navigate = vi.fn();
    const unsubscribe = application.subscribeNavigation(navigate);

    await application.importScores(false);

    expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(application.getSnapshot().currentLibraryScoreId).toBeUndefined();
    unsubscribe();
    await application.destroy();
  });

  it("creates an initial Studio document once and restores it on later opens", async () => {
    const scoreId = "00000000-0000-4000-8000-000000000001";
    const hash = "a".repeat(64);
    const sourceBytes = new TextEncoder().encode(
      '<score-partwise><part id="P1"><measure><note/></measure></part></score-partwise>',
    );
    const sourceHash = createHash("sha256").update(sourceBytes).digest("hex");
    let document: HarmonyAnalysisDocument | null = null;
    const adapter: ScoreFormatAdapter = {
      format: "musicxml",
      parse: vi.fn(async () => ({
        runtime: {},
        diagnostics: [],
        capabilities: { view: true, playback: false },
        document: {
          schemaVersion: "0",
          summary: { title: "Score", trackCount: 1 },
          tracks: [{ id: "track-1", name: "Piano", staves: [], playback: { muted: false, solo: false, volume: 1 } }],
          timeline: { ticksPerQuarter: 1, durationTicks: 1 },
          sections: [],
        },
      })),
    };
    const repository: SheetLibraryRepository & HarmonyAnalysisRepository = {
      initialize: async () => undefined,
      list: async () => [],
      get: async () => ({
        id: scoreId,
        scoreIdentity: hash,
        fileName: "score.musicxml",
        format: "musicxml",
        title: "Score",
        importedAt: "2026-07-15T00:00:00.000Z",
        isFavorite: false,
        practice: { hasLoop: false },
        metadata: {},
      }),
      findByIdentity: async () => undefined,
      add: async () => {
        throw new Error("unused");
      },
      readScore: async () => ({
        fileName: "score.musicxml",
        bytes: sourceBytes,
      }),
      updateMetadata: async () => {
        throw new Error("unused");
      },
      setFavorite: async () => undefined,
      markOpened: async () => undefined,
      delete: async () => {
        document = null;
      },
      read: async () => document,
      save: async ({ document: next, expectedDocumentVersion }) => {
        if ((document?.documentVersion ?? null) !== expectedDocumentVersion)
          return { status: "conflict" as const, current: document };
        document = { ...next, documentVersion: (document?.documentVersion ?? -1) + 1 };
        return { status: "saved" as const, document };
      },
    };
    let exported: { fileName: string; bytes: Uint8Array } | undefined;
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      async () => ({
        togglePlayback: async () => undefined,
        pauseAndFlush: async () => undefined,
        destroy: async () => undefined,
      }),
      {
        repository,
        gateway: {
          selectForImport: async () => [],
          saveExport: async (file) => {
            exported = file;
            return "saved";
          },
        },
        adapters: [adapter],
      },
    );
    await Promise.all([application.openStudio(scoreId), application.openStudio(scoreId)]);
    expect(application.getSnapshot().studio).toMatchObject({ libraryScoreId: scoreId, status: "ready" });
    await application.setStudioCorrection(
      scoreId,
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 1 } },
      {
        type: "chord",
        chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] },
      },
    );
    expect(application.getSnapshot().studio?.document?.corrections).toHaveLength(1);
    application.undoStudio(scoreId);
    expect(application.getSnapshot().studio?.document?.corrections).toHaveLength(0);
    application.redoStudio(scoreId);
    expect(application.getSnapshot().studio?.document?.corrections).toHaveLength(1);
    await expect(application.exportStudio(scoreId)).resolves.toBe("saved");
    expect(exported?.fileName).toBe("score-chords.musicxml");
    expect(new TextDecoder().decode(exported?.bytes)).toContain("<root-step>C</root-step>");
    expect(createHash("sha256").update(sourceBytes).digest("hex")).toBe(sourceHash);
    await application.openStudio(scoreId);
    expect(adapter.parse).toHaveBeenCalledOnce();
    await application.destroy();
  });

  it("rejects non-MusicXML scores before creating a Studio document", async () => {
    const scoreId = "00000000-0000-4000-8000-000000000001";
    const repository: SheetLibraryRepository & HarmonyAnalysisRepository = {
      initialize: async () => undefined,
      list: async () => [],
      get: async () => ({
        id: scoreId,
        scoreIdentity: "a".repeat(64),
        fileName: "score.gp5",
        format: "gp",
        title: "Score",
        importedAt: "2026-07-15T00:00:00.000Z",
        isFavorite: false,
        practice: { hasLoop: false },
        metadata: {},
      }),
      findByIdentity: async () => undefined,
      add: async () => {
        throw new Error("unused");
      },
      readScore: async () => {
        throw new Error("must not read");
      },
      updateMetadata: async () => {
        throw new Error("unused");
      },
      setFavorite: async () => undefined,
      markOpened: async () => undefined,
      delete: async () => undefined,
      read: async () => null,
      save: async () => {
        throw new Error("must not save");
      },
    };
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      async () => ({
        togglePlayback: async () => undefined,
        pauseAndFlush: async () => undefined,
        destroy: async () => undefined,
      }),
      { repository, gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" }, adapters: [] },
    );
    await application.openStudio(scoreId);
    expect(application.getSnapshot().studio).toMatchObject({ status: "error", error: "仅支持 MusicXML/MXL 曲谱" });
    await application.destroy();
  });
});
