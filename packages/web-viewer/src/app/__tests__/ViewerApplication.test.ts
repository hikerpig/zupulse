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
import type { ViewerSessionPort } from "../../viewer-session/viewer-session-types";

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
function viewerSession(
  dispatch: ViewerSessionPort["dispatch"] = async () => undefined,
  destroy: ViewerSessionPort["destroy"] = async () => undefined,
): ViewerSessionPort {
  return {
    getSnapshot: () => ({ loopEditor: { measureBounds: [], staffBounds: [] } }),
    subscribe: () => () => undefined,
    dispatch,
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

  it("forwards toggle-playback host commands to the active session", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    let hostListener: ((event: { type: "toggle-playback" }) => void) | undefined;
    const togglePlayback = vi.fn(async () => undefined);
    const repository: SheetLibraryRepository = {
      initialize: async () => undefined,
      list: async () => [],
      get: async () => undefined,
      findByIdentity: async () => undefined,
      add: async () => {
        throw new Error("unused");
      },
      readScore: async () => ({ fileName: "score-a.gp", bytes: new Uint8Array([1]) }),
      updateMetadata: async () => {
        throw new Error("unused");
      },
      setFavorite: async () => undefined,
      markOpened: async () => undefined,
      delete: async () => undefined,
    };
    const application = new ViewerApplication(
      {
        subscribe: (listener) => {
          hostListener = listener as typeof hostListener;
          return () => undefined;
        },
      },
      async () => viewerSession(async () => togglePlayback()),
      { repository, gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" }, adapters: [] },
    );

    await application.openLibraryScore(id);
    hostListener?.({ type: "toggle-playback" });
    expect(togglePlayback).toHaveBeenCalledOnce();
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
    const application = new ViewerApplication({ subscribe: () => () => undefined }, openSession, {
      repository,
      gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" },
      adapters: [],
    });

    await Promise.all([application.openLibraryScore(scoreId), application.openLibraryScore(scoreId)]);

    expect(readScore).toHaveBeenCalledOnce();
    expect(openSession).toHaveBeenCalledOnce();
    await application.destroy();
  });

  it("reopens a library score after its Viewer route releases the previous session", async () => {
    const scoreId = "00000000-0000-4000-8000-000000000001";
    const readScore = vi.fn(async () => ({ fileName: "score.gp", bytes: new Uint8Array([1]) }));
    const destroy = vi.fn(async () => undefined);
    const openSession = vi.fn(async () => viewerSession(undefined, destroy));
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
    const application = new ViewerApplication({ subscribe: () => () => undefined }, openSession, {
      repository,
      gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" },
      adapters: [],
    });

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
      { subscribe: () => () => undefined },
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
      { subscribe: () => () => undefined },
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
      { subscribe: () => () => undefined },
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
    let selectedForImport: { fileName: string; readBytes(): Promise<Uint8Array> }[] = [];
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
      { subscribe: () => () => undefined },
      async () => {
        throw new Error("unused");
      },
      {
        repository,
        gateway: {
          selectForImport: async () => selectedForImport,
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

    await application.importScoreSources([{ fileName: "imported.musicxml", readBytes: async () => bytes }]);

    expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(application.getSnapshot().currentLibraryScoreId).toBeUndefined();

    selectedForImport = [{ fileName: "single-from-multi-picker.musicxml", readBytes: async () => bytes }];
    await application.importScores(true);

    expect(navigate).toHaveBeenCalledTimes(2);

    await application.importScoreSources([{ fileName: "broken.txt", readBytes: async () => bytes }]);

    expect(application.getSnapshot().library).toMatchObject({
      importSummary: {
        total: 1,
        cancelled: 0,
        running: false,
        results: [{ status: "failed", fileName: "broken.txt" }],
      },
    });
    expect(application.getSnapshot().library?.error).toBeUndefined();
    expect(navigate).toHaveBeenCalledTimes(2);

    await application.importScoreSources([
      { fileName: "batch.musicxml", readBytes: async () => bytes },
      { fileName: "broken.txt", readBytes: async () => bytes },
    ]);

    expect(application.getSnapshot().library?.importSummary).toMatchObject({
      total: 2,
      cancelled: 0,
      running: false,
      results: [{ status: "created" }, { status: "failed", fileName: "broken.txt" }],
    });
    expect(navigate).toHaveBeenCalledTimes(2);
    unsubscribe();
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
      { subscribe: () => () => undefined },
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
    expect(application.getStudioApplication().getSnapshot()).toMatchObject({
      libraryScoreId: studioScoreId,
      status: "ready",
    });
    expect(application.getStudioApplication().getSnapshot()?.document?.activeRevision.algorithmVersion).toContain(
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
      { subscribe: () => () => undefined },
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
    expect(application.getStudioApplication().getSnapshot()).toMatchObject({
      libraryScoreId: scoreId,
      status: "ready",
    });
    await application.destroy();
  });

  it("delegates Studio opens to the Studio application seam", async () => {
    const scoreId = "00000000-0000-4000-8000-000000000001";
    const sourceBytes = new TextEncoder().encode(
      '<score-partwise><part id="P1"><measure><note/></measure></part></score-partwise>',
    );
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
      updateMetadata: async () => {
        throw new Error("unused");
      },
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
      { subscribe: () => () => undefined },
      async () => {
        throw new Error("viewer must not open");
      },
      {
        repository,
        gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" },
        adapters: [adapter],
      },
      async () => studioRuntime(),
    );

    const studioApplication = application.getStudioApplication();
    await studioApplication.open(scoreId);

    expect(application.getStudioApplication()).toBe(studioApplication);
    expect(studioApplication.getSnapshot()).toMatchObject({
      libraryScoreId: scoreId,
      status: "ready",
    });
    expect(application.getSnapshot()).not.toHaveProperty("studio");
    await application.destroy();
  });
});
