import { describe, expect, it, vi } from "vitest";
import { InMemoryHarmonyAnalysisRepository, type HarmonyAnalysisDocument } from "@zupulse/web-core";
import { HarmonyStudioSession } from "../harmonyStudioSession";

const document: HarmonyAnalysisDocument = {
  schemaVersion: "1.0.0",
  libraryScoreId: "00000000-0000-4000-8000-000000000001",
  sourceContentHash: "a".repeat(64),
  documentVersion: 0,
  activeRevision: {
    id: "00000000-0000-4000-8000-000000000002",
    algorithmVersion: "rules-1",
    createdAt: "2026-07-15T00:00:00.000Z",
    parameters: { scope: { includedTrackIds: ["piano"] }, topK: 8, decisionThreshold: 0.6 },
    segments: [],
  },
  corrections: [],
  annotationTarget: { trackId: "piano", staffIndex: 0 },
  updatedAt: "2026-07-15T00:00:00.000Z",
};

describe("HarmonyStudioSession", () => {
  it("does not silently reanalyze an existing document", async () => {
    const repository = new InMemoryHarmonyAnalysisRepository(
      new Map([[document.libraryScoreId, document.sourceContentHash]]),
    );
    await repository.save({ document, expectedDocumentVersion: null });
    const session = new HarmonyStudioSession(repository, document.libraryScoreId);
    let calls = 0;
    await session.load(async () => {
      calls += 1;
      return document;
    });
    expect(calls).toBe(0);
    expect(session.getState().status).toBe("ready");
  });

  it("keeps undo and redo local to the current Studio session", async () => {
    const repository = new InMemoryHarmonyAnalysisRepository(
      new Map([[document.libraryScoreId, document.sourceContentHash]]),
    );
    await repository.save({ document, expectedDocumentVersion: null });
    const session = new HarmonyStudioSession(repository, document.libraryScoreId);
    await session.load(async () => document);
    session.setAnnotationTarget({ trackId: "guitar", staffIndex: 1 });
    expect(session.getState().document?.annotationTarget.trackId).toBe("guitar");
    session.undo();
    expect(session.getState().document?.annotationTarget.trackId).toBe("piano");
    session.redo();
    expect(session.getState().document?.annotationTarget.trackId).toBe("guitar");
  });

  it("reapplies the latest corrections when reanalysis completes", async () => {
    const repository = new InMemoryHarmonyAnalysisRepository(
      new Map([[document.libraryScoreId, document.sourceContentHash]]),
    );
    await repository.save({ document, expectedDocumentVersion: null });
    const session = new HarmonyStudioSession(repository, document.libraryScoreId);
    await session.load(async () => document);
    const correction = {
      id: "00000000-0000-4000-8000-000000000003",
      range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 1 } },
      value: { type: "no-chord" as const },
      updatedAt: "2026-07-15T00:00:01.000Z",
    };
    session.setCorrections([correction]);
    await session.reanalyze(async () => ({
      ...document,
      activeRevision: { ...document.activeRevision, id: "00000000-0000-4000-8000-000000000004" },
    }));
    expect(session.getState().document?.corrections).toEqual([correction]);
  });

  it("reanalyses on Scope changes but not Annotation Target changes", async () => {
    const repository = new InMemoryHarmonyAnalysisRepository(
      new Map([[document.libraryScoreId, document.sourceContentHash]]),
    );
    await repository.save({ document, expectedDocumentVersion: null });
    const session = new HarmonyStudioSession(repository, document.libraryScoreId);
    await session.load(async () => document);
    session.setAnnotationTarget({ trackId: "guitar", staffIndex: 0 });
    let scopes: readonly string[] = [];
    await session.setScope(["guitar"], async ({ scope }) => {
      scopes = scope;
      return {
        ...document,
        activeRevision: { ...document.activeRevision, id: "00000000-0000-4000-8000-000000000005" },
      };
    });
    expect(scopes).toEqual(["guitar"]);
    expect(session.getState().document?.annotationTarget.trackId).toBe("guitar");
  });

  it("autosaves edits after the configured debounce delay", async () => {
    vi.useFakeTimers();
    try {
      const repository = new InMemoryHarmonyAnalysisRepository(
        new Map([[document.libraryScoreId, document.sourceContentHash]]),
      );
      await repository.save({ document, expectedDocumentVersion: null });
      const session = new HarmonyStudioSession(repository, document.libraryScoreId, 500);
      await session.load(async () => document);
      session.setAnnotationTarget({ trackId: "guitar", staffIndex: 0 });
      await vi.advanceTimersByTimeAsync(500);
      expect((await repository.read(document.libraryScoreId))?.annotationTarget.trackId).toBe("guitar");
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces an external CAS write as a conflict without replacing the local revision", async () => {
    const repository = new InMemoryHarmonyAnalysisRepository(
      new Map([[document.libraryScoreId, document.sourceContentHash]]),
    );
    await repository.save({ document, expectedDocumentVersion: null });
    const session = new HarmonyStudioSession(repository, document.libraryScoreId);
    await session.load(async () => document);
    const external = {
      ...document,
      activeRevision: { ...document.activeRevision, id: "00000000-0000-4000-8000-000000000006" },
    };
    expect((await repository.save({ document: external, expectedDocumentVersion: 0 })).status).toBe("saved");
    session.setAnnotationTarget({ trackId: "guitar", staffIndex: 0 });
    const result = await session.flush();
    expect(result.status).toBe("conflict");
    expect(session.getState().document?.activeRevision.id).toBe(document.activeRevision.id);
    expect(session.getState().document?.annotationTarget.trackId).toBe("guitar");
  });

  it("drops undo history when the Studio session is disposed", async () => {
    const repository = new InMemoryHarmonyAnalysisRepository(
      new Map([[document.libraryScoreId, document.sourceContentHash]]),
    );
    await repository.save({ document, expectedDocumentVersion: null });
    const session = new HarmonyStudioSession(repository, document.libraryScoreId);
    await session.load(async () => document);
    session.setAnnotationTarget({ trackId: "guitar", staffIndex: 0 });
    session.dispose();
    session.undo();
    expect(session.getState().document?.annotationTarget.trackId).toBe("guitar");
  });
});
