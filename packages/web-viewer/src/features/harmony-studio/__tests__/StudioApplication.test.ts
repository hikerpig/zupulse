import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type {
  HarmonyAnalysisDocument,
  HarmonyAnalysisRepository,
  ScoreFormatAdapter,
  SheetLibraryRepository,
} from "@zupulse/web-core";
import { StudioApplication } from "../StudioApplication";

function studioRuntime({
  destroy = async () => undefined,
  applyPreview = () => ({ status: "unavailable" as const }),
  togglePlayback = () => ({ status: "unavailable" as const }),
  setPosition = () => ({ status: "unavailable" as const }),
  setSpeed = () => ({ status: "unavailable" as const }),
  setLoop = () => ({ status: "unavailable" as const }),
  highlight = () => ({ status: "unavailable" as const }),
}: {
  destroy?: () => Promise<void>;
  applyPreview?: () => { status: "unavailable" };
  togglePlayback?: () => { status: "unavailable" };
  setPosition?: () => { status: "unavailable" };
  setSpeed?: () => { status: "unavailable" };
  setLoop?: () => { status: "unavailable" };
  highlight?: () => { status: "unavailable" };
} = {}) {
  return {
    getSnapshot: () => ({
      status: "ready" as const,
      transport: { status: "paused" as const, positionTicks: 0, speed: 1 },
    }),
    subscribeTransport: () => () => undefined,
    subscribeSelection: () => () => undefined,
    subscribeErrors: () => () => undefined,
    highlight,
    applyPreview,
    togglePlayback,
    setPosition,
    setSpeed,
    setLoop,
    destroy,
  };
}

function musicXmlRepository(
  score: {
    id: string;
    format: "musicxml" | "gp";
    scoreIdentity: string;
    fileName: string;
  },
  sourceBytes: Uint8Array,
  document: { get(): HarmonyAnalysisDocument | null; set(value: HarmonyAnalysisDocument | null): void },
): SheetLibraryRepository & HarmonyAnalysisRepository {
  return {
    initialize: async () => undefined,
    list: async () => [],
    get: async () => ({
      id: score.id,
      scoreIdentity: score.scoreIdentity,
      fileName: score.fileName,
      format: score.format,
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
    readScore: async () => ({ fileName: score.fileName, bytes: sourceBytes }),
    updateMetadata: async () => {
      throw new Error("unused");
    },
    setFavorite: async () => undefined,
    markOpened: async () => undefined,
    delete: async () => {
      document.set(null);
    },
    read: async () => document.get(),
    save: async ({ document: next, expectedDocumentVersion }) => {
      const current = document.get();
      if ((current?.documentVersion ?? null) !== expectedDocumentVersion)
        return { status: "conflict" as const, current };
      document.set({ ...next, documentVersion: (current?.documentVersion ?? -1) + 1 });
      return { status: "saved" as const, document: document.get()! };
    },
  };
}

function musicXmlAdapter() {
  return {
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
}

describe("StudioApplication", () => {
  it("creates an initial Studio document once and restores it on later opens", async () => {
    const scoreId = "00000000-0000-4000-8000-000000000001";
    const hash = "a".repeat(64);
    const sourceBytes = new TextEncoder().encode(
      '<score-partwise><part id="P1"><measure><note/></measure></part></score-partwise>',
    );
    const sourceHash = createHash("sha256").update(sourceBytes).digest("hex");
    let document: HarmonyAnalysisDocument | null = null;
    const adapter = musicXmlAdapter();
    const repository = musicXmlRepository(
      { id: scoreId, format: "musicxml", scoreIdentity: hash, fileName: "score.musicxml" },
      sourceBytes,
      { get: () => document, set: (value) => (document = value) },
    );
    let exported: { fileName: string; bytes: Uint8Array } | undefined;
    const studio = new StudioApplication({
      library: {
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
      openStudioRuntime: async () =>
        studioRuntime({
          applyPreview: () => {
            throw new Error("预览渲染失败");
          },
        }),
    });

    await Promise.all([studio.open(scoreId), studio.open(scoreId)]);
    expect(studio.getSnapshot()).toMatchObject({
      libraryScoreId: scoreId,
      status: "ready",
      previewError: { code: "studio-preview-failed", recoverable: true },
    });
    await studio.setAnnotationTarget(scoreId, { trackId: "track-1", staffIndex: 1 });
    expect(studio.getSnapshot()?.document?.annotationTarget).toEqual({ trackId: "track-1", staffIndex: 1 });
    expect(adapter.parse).toHaveBeenCalledOnce();
    await studio.setCorrection(
      scoreId,
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 1 } },
      {
        type: "chord",
        chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] },
      },
    );
    expect(studio.getSnapshot()?.document?.corrections).toHaveLength(1);
    await studio.resetCorrection(scoreId, {
      start: { measureIndex: 0, offsetTicks: 0 },
      end: { measureIndex: 0, offsetTicks: 1 },
    });
    expect(studio.getSnapshot()?.document?.corrections).toHaveLength(0);
    await studio.setCorrection(
      scoreId,
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 1 } },
      {
        type: "chord",
        chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] },
      },
    );
    expect(studio.getSnapshot()?.document?.corrections).toHaveLength(1);
    studio.undo(scoreId);
    expect(studio.getSnapshot()?.document?.corrections).toHaveLength(0);
    studio.redo(scoreId);
    expect(studio.getSnapshot()?.document?.corrections).toHaveLength(1);
    await studio.setScope(scoreId, ["track-1"]);
    expect(studio.getSnapshot()?.document?.corrections).toHaveLength(1);
    expect(studio.getSnapshot()?.document?.annotationTarget).toEqual({ trackId: "track-1", staffIndex: 1 });
    expect(adapter.parse).toHaveBeenCalledTimes(2);
    await studio.setCorrection(
      scoreId,
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 4 } },
      {
        type: "chord",
        chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] },
      },
    );
    await studio.splitCorrection(scoreId, {
      start: { measureIndex: 0, offsetTicks: 0 },
      end: { measureIndex: 0, offsetTicks: 4 },
    });
    expect(studio.getSnapshot()?.document?.corrections).toHaveLength(2);
    await studio.mergeCorrections(scoreId, {
      start: { measureIndex: 0, offsetTicks: 0 },
      end: { measureIndex: 0, offsetTicks: 4 },
    });
    expect(studio.getSnapshot()?.document?.corrections).toHaveLength(1);
    await studio.moveCorrection(
      scoreId,
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 4 } },
      1,
    );
    expect(studio.getSnapshot()?.document?.corrections[0]?.range).toEqual({
      start: { measureIndex: 0, offsetTicks: 1 },
      end: { measureIndex: 0, offsetTicks: 5 },
    });
    await studio.resetCorrection(scoreId, {
      start: { measureIndex: 0, offsetTicks: 1 },
      end: { measureIndex: 0, offsetTicks: 5 },
    });
    await studio.setCorrection(
      scoreId,
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 1 } },
      {
        type: "chord",
        chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] },
      },
    );
    await expect(studio.export(scoreId)).resolves.toBe("saved");
    expect(exported?.fileName).toBe("score-chords.musicxml");
    expect(new TextDecoder().decode(exported?.bytes)).toContain("<root-step>C</root-step>");
    expect(createHash("sha256").update(sourceBytes).digest("hex")).toBe(sourceHash);
    await studio.open(scoreId);
    expect(adapter.parse).toHaveBeenCalledTimes(2);
    await studio.releaseScore(scoreId);
    expect(studio.getSnapshot()).toBeUndefined();
    await repository.delete(scoreId);
    expect(document).toBeNull();
    await studio.destroy();
  });

  it("rejects non-MusicXML scores before creating a Studio document", async () => {
    const scoreId = "00000000-0000-4000-8000-000000000001";
    const document: { get(): HarmonyAnalysisDocument | null; set(value: HarmonyAnalysisDocument | null): void } = {
      get: () => null,
      set: () => undefined,
    };
    const repository = musicXmlRepository(
      { id: scoreId, format: "gp", scoreIdentity: "a".repeat(64), fileName: "score.gp5" },
      new Uint8Array(),
      document,
    );
    const studio = new StudioApplication({
      library: {
        repository,
        gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" },
        adapters: [],
      },
      openStudioRuntime: async () => {
        throw new Error("must not create Studio runtime");
      },
    });
    await studio.open(scoreId);
    expect(studio.getSnapshot()).toMatchObject({
      status: "error",
      error: { code: "studio-format-unsupported", recoverable: false },
    });
    await studio.destroy();
  });

  it("keeps preview commands and selection local to the Studio application", async () => {
    const scoreId = "00000000-0000-4000-8000-000000000001";
    const sourceBytes = new TextEncoder().encode(
      '<score-partwise><part id="P1"><measure><note/></measure></part></score-partwise>',
    );
    let document: HarmonyAnalysisDocument | null = null;
    const repository = musicXmlRepository(
      { id: scoreId, format: "musicxml", scoreIdentity: "a".repeat(64), fileName: "score.musicxml" },
      sourceBytes,
      { get: () => document, set: (value) => (document = value) },
    );
    const applyPreviewSpy = vi.fn(() => {
      throw new Error("预览渲染失败");
    });
    const highlight = vi.fn(() => ({ status: "unavailable" as const }));
    const runtime = studioRuntime({
      applyPreview: applyPreviewSpy,
      togglePlayback: () => ({ status: "toggled" as const }),
      setPosition: () => ({ status: "positioned" as const }),
      setSpeed: () => ({ status: "sped" as const }),
      setLoop: () => ({ status: "looped" as const }),
      highlight,
    });
    const studio = new StudioApplication({
      library: {
        repository,
        gateway: { selectForImport: async () => [], saveExport: async () => "cancelled" },
        adapters: [musicXmlAdapter()],
      },
      openStudioRuntime: async () => runtime,
    });

    await studio.open(scoreId);
    expect(studio.getSnapshot()?.previewError).toEqual({ code: "studio-preview-failed", recoverable: true });

    applyPreviewSpy.mockReturnValue({ status: "applied", restore: () => undefined });
    studio.retryPreview(scoreId);
    expect(studio.getSnapshot()?.previewError).toBeUndefined();

    const range = { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 1 } };
    studio.selectRange(scoreId, range);
    expect(highlight).toHaveBeenCalledWith(range);
    expect(studio.getSnapshot()?.selection).toEqual({ focus: range.start, range });

    studio.togglePreview(scoreId);
    studio.setPreviewPosition(scoreId, 100);
    studio.setPreviewSpeed(scoreId, 1.5);
    studio.setPreviewLoop(scoreId, range);
    expect(studio.getSnapshot()).toMatchObject({
      libraryScoreId: scoreId,
      status: "ready",
      transport: { status: "paused", positionTicks: 0, speed: 1 },
    });
    expect(studio.getSnapshot()?.audioError).toBeUndefined();

    studio.setPreviewEnabled(scoreId, false);
    expect(applyPreviewSpy).toHaveBeenLastCalledWith([]);
    expect(studio.getSnapshot()?.previewError).toBeUndefined();
    await studio.destroy();
  });
});
