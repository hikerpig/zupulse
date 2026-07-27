import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type {
  HarmonyAnalysisDocument,
  HarmonyAnalysisRepository,
  ScoreFormatAdapter,
  SheetLibraryRepository,
} from "@zupulse/web-core";
import { ViewerApplication } from "../ViewerApplication";
import { ViewerOpenFailure } from "../../host";

function studioRuntime({
  destroy = async () => undefined,
  applyPreview = () => ({ status: "unavailable" as const }),
}: {
  destroy?: () => Promise<void>;
  applyPreview?: () => { status: "unavailable" };
} = {}) {
  return {
    getSnapshot: () => ({
      status: "ready" as const,
      transport: { status: "paused" as const, positionTicks: 0, speed: 1 },
    }),
    subscribeTransport: () => () => undefined,
    subscribeSelection: () => () => undefined,
    subscribeErrors: () => () => undefined,
    highlight: () => ({ status: "unavailable" as const }),
    applyPreview,
    togglePlayback: () => ({ status: "unavailable" as const }),
    setPosition: () => ({ status: "unavailable" as const }),
    setSpeed: () => ({ status: "unavailable" as const }),
    setLoop: () => ({ status: "unavailable" as const }),
    destroy,
  };
}

describe("ViewerApplication", () => {
  it("keeps raw repository failures out of the application snapshot", async () => {
    const failure = new Error("failed at /Users/example/private-score.gp");
    const reportDiagnostic = vi.fn();
    const repository: SheetLibraryRepository = {
      initialize: async () => {
        throw failure;
      },
      list: async () => [],
      get: async () => undefined,
      findByIdentity: async () => undefined,
      add: async () => {
        throw new Error("unused");
      },
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
      {
        openScore: async () => undefined,
        subscribe: () => () => undefined,
        reportDiagnostic,
      },
      async () => ({ togglePlayback: vi.fn(), pauseAndFlush: vi.fn(), destroy: vi.fn() }),
      {
        repository,
        gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" },
        adapters: [],
      },
    );

    await application.refreshLibrary();

    expect(application.getSnapshot().library?.error).toEqual({
      code: "library-unavailable",
      recoverable: true,
    });
    expect(JSON.stringify(application.getSnapshot())).not.toContain("/Users/example");
    expect(reportDiagnostic).toHaveBeenCalledWith(failure, "library.refresh");
    await application.destroy();
  });

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

  it("reopens a library score after its Viewer route releases the previous session", async () => {
    const scoreId = "00000000-0000-4000-8000-000000000001";
    const readScore = vi.fn(async () => ({ fileName: "score.gp", bytes: new Uint8Array([1]) }));
    const destroy = vi.fn(async () => undefined);
    const openSession = vi.fn(async () => ({
      togglePlayback: async () => undefined,
      pauseAndFlush: async () => undefined,
      destroy,
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

    await application.openLibraryScore(scoreId);
    await application.releaseLibraryScore(scoreId);
    await application.openLibraryScore(scoreId);

    expect(readScore).toHaveBeenCalledTimes(2);
    expect(openSession).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledOnce();
    await application.destroy();
  });

  it("reports a Viewer library-stage error without marking the Library unavailable", async () => {
    const scoreId = "00000000-0000-4000-8000-000000000001";
    const repository = {
      initialize: async () => undefined,
      list: async () => [],
      get: async () => undefined,
      findByIdentity: async () => undefined,
      add: async () => {
        throw new Error("unused");
      },
      readScore: async () => {
        throw new Error("SCORE_BYTES_MISSING");
      },
      updateMetadata: async () => {
        throw new Error("unused");
      },
      setFavorite: async () => undefined,
      markOpened: async () => undefined,
      delete: async () => undefined,
    } satisfies SheetLibraryRepository;
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      async () => {
        throw new Error("unused");
      },
      { repository, gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" }, adapters: [] },
    );

    await expect(application.openLibraryScore(scoreId)).rejects.toThrow("viewer-library-failed");

    expect(application.getSnapshot().currentLibraryScoreId).toBeUndefined();
    expect(application.getSnapshot().library?.error).toBeUndefined();
    expect(application.getSnapshot().viewer?.error).toEqual({
      code: "viewer-library-failed",
      recoverable: true,
    });
    await application.destroy();
  });

  it("distinguishes Viewer session failures from Library failures", async () => {
    const scoreId = "00000000-0000-4000-8000-000000000001";
    const repository = {
      initialize: async () => undefined,
      list: async () => [],
      get: async () => undefined,
      findByIdentity: async () => undefined,
      add: async () => {
        throw new Error("unused");
      },
      readScore: async () => ({ fileName: "score.gp", bytes: new Uint8Array([1]) }),
      updateMetadata: async () => {
        throw new Error("unused");
      },
      setFavorite: async () => undefined,
      markOpened: async () => undefined,
      delete: async () => undefined,
    } satisfies SheetLibraryRepository;
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      async () => {
        throw new Error("controller initialization failed");
      },
      { repository, gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" }, adapters: [] },
    );

    await expect(application.openLibraryScore(scoreId)).rejects.toThrow("controller initialization failed");

    expect(application.getSnapshot().library?.error).toBeUndefined();
    expect(application.getSnapshot().viewer?.error).toEqual({
      code: "viewer-session-failed",
      recoverable: true,
    });
    await application.destroy();
  });

  it("distinguishes Viewer render failures from session failures", async () => {
    const scoreId = "00000000-0000-4000-8000-000000000001";
    const repository = {
      initialize: async () => undefined,
      list: async () => [],
      get: async () => undefined,
      findByIdentity: async () => undefined,
      add: async () => {
        throw new Error("unused");
      },
      readScore: async () => ({ fileName: "score.gp", bytes: new Uint8Array([1]) }),
      updateMetadata: async () => {
        throw new Error("unused");
      },
      setFavorite: async () => undefined,
      markOpened: async () => undefined,
      delete: async () => undefined,
    } satisfies SheetLibraryRepository;
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      async () => {
        throw new ViewerOpenFailure("render");
      },
      { repository, gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" }, adapters: [] },
    );

    await expect(application.openLibraryScore(scoreId)).rejects.toThrow("Viewer render failed");

    expect(application.getSnapshot().viewer?.error).toEqual({
      code: "viewer-render-failed",
      recoverable: true,
    });
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
          selectForImport: async () => [],
          saveExport: async () => "cancelled",
        },
        adapters: [adapter],
      },
      async () => ({
        getSnapshot: () => ({ status: "ready", transport: { status: "paused", positionTicks: 0, speed: 1 } }),
        subscribeTransport: () => () => undefined,
        subscribeSelection: () => () => undefined,
        subscribeErrors: () => () => undefined,
        highlight: () => ({ status: "unavailable" }),
        applyPreview: () => ({ status: "unavailable" }),
        togglePlayback: () => ({ status: "unavailable" }),
        setPosition: () => ({ status: "unavailable" }),
        setSpeed: () => ({ status: "unavailable" }),
        setLoop: () => ({ status: "unavailable" }),
        destroy: async () => undefined,
      }),
    );
    const navigate = vi.fn();
    const unsubscribe = application.subscribeNavigation(navigate);

    await application.importScoreSources([{ fileName: "imported.musicxml", readBytes: async () => bytes }], false);

    expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(application.getSnapshot().currentLibraryScoreId).toBeUndefined();

    await application.importScoreSources(
      [
        { fileName: "batch.musicxml", readBytes: async () => bytes },
        { fileName: "broken.txt", readBytes: async () => bytes },
      ],
      true,
    );

    expect(application.getSnapshot().library?.importSummary).toMatchObject({
      total: 2,
      cancelled: 0,
      running: false,
      results: [{ status: "created" }, { status: "failed", fileName: "broken.txt" }],
    });
    expect(navigate).toHaveBeenCalledTimes(1);
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
      async () =>
        studioRuntime({
          applyPreview: () => {
            throw new Error("预览渲染失败");
          },
        }),
    );
    await Promise.all([application.openStudio(scoreId), application.openStudio(scoreId)]);
    expect(application.getSnapshot().studio).toMatchObject({
      libraryScoreId: scoreId,
      status: "ready",
      previewError: { code: "studio-preview-failed", recoverable: true },
    });
    await application.setStudioAnnotationTarget(scoreId, { trackId: "track-1", staffIndex: 1 });
    expect(application.getSnapshot().studio?.document?.annotationTarget).toEqual({ trackId: "track-1", staffIndex: 1 });
    expect(adapter.parse).toHaveBeenCalledOnce();
    await application.setStudioCorrection(
      scoreId,
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 1 } },
      {
        type: "chord",
        chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] },
      },
    );
    expect(application.getSnapshot().studio?.document?.corrections).toHaveLength(1);
    await application.resetStudioCorrection(scoreId, {
      start: { measureIndex: 0, offsetTicks: 0 },
      end: { measureIndex: 0, offsetTicks: 1 },
    });
    expect(application.getSnapshot().studio?.document?.corrections).toHaveLength(0);
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
    await application.setStudioScope(scoreId, ["track-1"]);
    expect(application.getSnapshot().studio?.document?.corrections).toHaveLength(1);
    expect(application.getSnapshot().studio?.document?.annotationTarget).toEqual({ trackId: "track-1", staffIndex: 1 });
    expect(adapter.parse).toHaveBeenCalledTimes(2);
    await application.setStudioCorrection(
      scoreId,
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 4 } },
      {
        type: "chord",
        chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] },
      },
    );
    await application.splitStudioCorrection(scoreId, {
      start: { measureIndex: 0, offsetTicks: 0 },
      end: { measureIndex: 0, offsetTicks: 4 },
    });
    expect(application.getSnapshot().studio?.document?.corrections).toHaveLength(2);
    await application.mergeStudioCorrections(scoreId, {
      start: { measureIndex: 0, offsetTicks: 0 },
      end: { measureIndex: 0, offsetTicks: 4 },
    });
    expect(application.getSnapshot().studio?.document?.corrections).toHaveLength(1);
    await application.moveStudioCorrection(
      scoreId,
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 4 } },
      1,
    );
    expect(application.getSnapshot().studio?.document?.corrections[0]?.range).toEqual({
      start: { measureIndex: 0, offsetTicks: 1 },
      end: { measureIndex: 0, offsetTicks: 5 },
    });
    await application.resetStudioCorrection(scoreId, {
      start: { measureIndex: 0, offsetTicks: 1 },
      end: { measureIndex: 0, offsetTicks: 5 },
    });
    await application.setStudioCorrection(
      scoreId,
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 1 } },
      {
        type: "chord",
        chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] },
      },
    );
    await expect(application.exportStudio(scoreId)).resolves.toBe("saved");
    expect(exported?.fileName).toBe("score-chords.musicxml");
    expect(new TextDecoder().decode(exported?.bytes)).toContain("<root-step>C</root-step>");
    expect(createHash("sha256").update(sourceBytes).digest("hex")).toBe(sourceHash);
    await application.openStudio(scoreId);
    expect(adapter.parse).toHaveBeenCalledTimes(2);
    await application.deleteLibraryScore(scoreId);
    expect(application.getSnapshot().studio).toBeUndefined();
    expect(document).toBeNull();
    await application.destroy();
  });

  it("replaces the Viewer runtime with a Studio runtime for the routed library score", async () => {
    const viewerScoreId = "00000000-0000-4000-8000-000000000001";
    const studioScoreId = "00000000-0000-4000-8000-000000000002";
    const studioBytes = new TextEncoder().encode(
      '<score-partwise><part id="P1"><measure><note/></measure></part></score-partwise>',
    );
    const destroyViewer = vi.fn(async () => undefined);
    const destroyStudio = vi.fn(async () => undefined);
    const openSession = vi
      .fn()
      .mockResolvedValueOnce({
        togglePlayback: async () => undefined,
        pauseAndFlush: async () => undefined,
        destroy: destroyViewer,
      })
      .mockResolvedValueOnce({
        togglePlayback: async () => undefined,
        pauseAndFlush: async () => undefined,
        destroy: destroyStudio,
      });
    let document: HarmonyAnalysisDocument | null = null;
    const repository: SheetLibraryRepository & HarmonyAnalysisRepository = {
      initialize: async () => undefined,
      list: async () => [],
      get: async (id) => ({
        id,
        scoreIdentity: "a".repeat(64),
        fileName: `${id}.musicxml`,
        format: "musicxml",
        title: id,
        importedAt: "2026-07-15T00:00:00.000Z",
        isFavorite: false,
        practice: { hasLoop: false },
        metadata: {},
      }),
      findByIdentity: async () => undefined,
      add: async () => {
        throw new Error("unused");
      },
      readScore: async (id) => ({ fileName: `${id}.musicxml`, bytes: studioBytes }),
      updateMetadata: async () => undefined,
      setFavorite: async () => undefined,
      markOpened: async () => undefined,
      delete: async () => undefined,
      read: async () => document,
      save: async ({ document: next }) => {
        document = { ...next, documentVersion: 0 };
        return { status: "saved", document };
      },
    };
    const adapter: ScoreFormatAdapter = {
      format: "musicxml",
      parse: async () => ({
        runtime: {},
        diagnostics: [],
        capabilities: { view: true, playback: false },
        document: {
          schemaVersion: "0",
          summary: { title: "Studio score", trackCount: 1 },
          tracks: [{ id: "track-1", name: "Piano", staves: [], playback: { muted: false, solo: false, volume: 1 } }],
          timeline: { ticksPerQuarter: 1, durationTicks: 1 },
          sections: [],
        },
      }),
    };
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      openSession,
      {
        repository,
        gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" },
        adapters: [adapter],
      },
      async () => studioRuntime({ destroy: destroyStudio }),
    );

    await application.openLibraryScore(viewerScoreId);
    await application.openStudio(studioScoreId);

    expect(destroyViewer).toHaveBeenCalledOnce();
    expect(openSession).toHaveBeenCalledOnce();
    expect(application.getSnapshot()).toMatchObject({
      studio: { libraryScoreId: studioScoreId, status: "ready" },
    });
    expect(application.getSnapshot().studio?.document?.activeRevision.algorithmVersion).toContain(
      "paper-semi-crf-mozart-v1-6fb18d1245aea9d89f5568a9b384b405c5326cb37015cc2caa5ade8dad5f7515",
    );
    expect(application.getSnapshot().currentLibraryScoreId).toBeUndefined();
    await application.destroy();
    expect(destroyStudio).toHaveBeenCalledOnce();
  });

  it("waits for an in-flight Viewer open before replacing it with Studio", async () => {
    const scoreId = "00000000-0000-4000-8000-000000000001";
    const sourceBytes = new TextEncoder().encode(
      '<score-partwise><part id="P1"><measure><note/></measure></part></score-partwise>',
    );
    let resolveViewer:
      | ((session: {
          togglePlayback(): Promise<void>;
          pauseAndFlush(): Promise<void>;
          destroy(): Promise<void>;
        }) => void)
      | undefined;
    const viewerSession = new Promise<{
      togglePlayback(): Promise<void>;
      pauseAndFlush(): Promise<void>;
      destroy(): Promise<void>;
    }>((resolve) => {
      resolveViewer = resolve;
    });
    const destroyViewer = vi.fn(async () => undefined);
    const openSession = vi.fn(async () => viewerSession);
    const openStudioRuntime = vi.fn(async () => studioRuntime());
    let document: HarmonyAnalysisDocument | null = null;
    const repository: SheetLibraryRepository & HarmonyAnalysisRepository = {
      initialize: async () => undefined,
      list: async () => [],
      get: async () => ({
        id: scoreId,
        scoreIdentity: "a".repeat(64),
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
      readScore: async () => ({ fileName: "score.musicxml", bytes: sourceBytes }),
      updateMetadata: async () => undefined,
      setFavorite: async () => undefined,
      markOpened: async () => undefined,
      delete: async () => undefined,
      read: async () => document,
      save: async ({ document: next }) => {
        document = { ...next, documentVersion: 0 };
        return { status: "saved", document };
      },
    };
    const adapter: ScoreFormatAdapter = {
      format: "musicxml",
      parse: async () => ({
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
      }),
    };
    const application = new ViewerApplication(
      { openScore: async () => undefined, subscribe: () => () => undefined },
      openSession,
      {
        repository,
        gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" },
        adapters: [adapter],
      },
      openStudioRuntime,
    );

    const viewerOpen = application.openLibraryScore(scoreId);
    await vi.waitFor(() => expect(openSession).toHaveBeenCalledOnce());
    const studioOpen = application.openStudio(scoreId);

    expect(openStudioRuntime).not.toHaveBeenCalled();
    resolveViewer?.({
      togglePlayback: async () => undefined,
      pauseAndFlush: async () => undefined,
      destroy: destroyViewer,
    });
    await Promise.all([viewerOpen, studioOpen]);

    expect(destroyViewer).toHaveBeenCalledOnce();
    expect(application.getSnapshot().currentLibraryScoreId).toBeUndefined();
    expect(application.getSnapshot().studio).toMatchObject({
      libraryScoreId: scoreId,
      status: "ready",
    });
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
    expect(application.getSnapshot().studio).toMatchObject({
      status: "error",
      error: { code: "studio-format-unsupported", recoverable: false },
    });
    await application.destroy();
  });
});
