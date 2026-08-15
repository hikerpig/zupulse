import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDefaultSidecar, type HarmonyAnalysisDocument } from "@zupulse/web-core";
import { sheetLibraryRepositoryContract } from "../../../../../../test-harness/__tests__/sheetLibraryRepositoryContract";
import { DesktopLibraryStore } from "../desktop-library-store";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function store(practice?: ConstructorParameters<typeof DesktopLibraryStore>[2]): Promise<DesktopLibraryStore> {
  const root = await mkdtemp(join(tmpdir(), "zupulse-library-"));
  roots.push(root);
  return new DesktopLibraryStore(join(root, "library.sqlite"), root, practice);
}

sheetLibraryRepositoryContract(store);

describe("DesktopLibraryStore", () => {
  it("summarizes saved loop and resume data for the Library", async () => {
    const id = crypto.randomUUID();
    const sidecar = createDefaultSidecar({ contentHash: "d".repeat(64), format: "gp" }, "2026-07-26T09:00:00.000Z");
    sidecar.practice.playback.loops.push({
      id: "loop-1",
      label: "Verse",
      labelSource: "user",
      start: { measureId: "measure-1", measureIndex: 0, beatIndex: 0, tick: 0, cachedTimeMs: 0 },
      end: { measureId: "measure-2", measureIndex: 1, beatIndex: 0, tick: 1920, cachedTimeMs: 4000 },
      snapMode: "measure",
      createdAt: "2026-07-26T09:00:00.000Z",
      updatedAt: "2026-07-26T09:00:00.000Z",
    });
    const repository = await store({
      readSidecar: async (libraryScoreId) => (libraryScoreId === id ? sidecar : undefined),
      readResume: async (libraryScoreId) =>
        libraryScoreId === id
          ? {
              position: {
                measureId: "measure-7",
                measureIndex: 6,
                beatIndex: 1,
                tick: 12480,
                cachedTimeMs: 26000,
              },
              updatedAt: "2026-07-26T10:00:00.000Z",
            }
          : undefined,
    });
    await repository.initialize();
    await repository.add({
      id,
      scoreIdentity: "d".repeat(64),
      file: { fileName: "practice.gp5", bytes: new Uint8Array([4, 5]) },
      format: "gp",
      importedAt: "2026-07-26T08:00:00.000Z",
    });

    await expect(repository.list()).resolves.toMatchObject([
      {
        id,
        practice: {
          hasLoop: true,
          lastPracticedAt: "2026-07-26T10:00:00.000Z",
          lastPosition: { measureIndex: 6 },
        },
      },
    ]);
    repository.close();
  });

  it("omits optional practice fields when no resume exists", async () => {
    const id = crypto.randomUUID();
    const repository = await store({
      readSidecar: async () => undefined,
      readResume: async () => undefined,
    });
    await repository.initialize();
    await repository.add({
      id,
      scoreIdentity: "e".repeat(64),
      file: { fileName: "fresh.musicxml", bytes: new Uint8Array([4, 5]) },
      format: "musicxml",
      importedAt: "2026-07-26T08:00:00.000Z",
    });

    await expect(repository.list()).resolves.toMatchObject([{ id, practice: { hasLoop: false } }]);
    expect((await repository.list())[0]?.practice).not.toHaveProperty("lastPracticedAt");
    expect((await repository.list())[0]?.practice).not.toHaveProperty("lastPosition");
    repository.close();
  });

  it("keeps sidecar and resume facts independent", async () => {
    const loopOnlyId = crypto.randomUUID();
    const resumeOnlyId = crypto.randomUUID();
    const sidecar = createDefaultSidecar({ contentHash: "f".repeat(64), format: "gp" }, "2026-07-26T09:00:00.000Z");
    sidecar.practice.playback.loops.push({
      id: "loop-1",
      label: "Chorus",
      labelSource: "user",
      start: { measureId: "measure-1", measureIndex: 0, beatIndex: 0, tick: 0, cachedTimeMs: 0 },
      end: { measureId: "measure-2", measureIndex: 1, beatIndex: 0, tick: 1920, cachedTimeMs: 4000 },
      snapMode: "measure",
      createdAt: "2026-07-26T09:00:00.000Z",
      updatedAt: "2026-07-26T09:00:00.000Z",
    });
    const repository = await store({
      readSidecar: async (id) => (id === loopOnlyId ? sidecar : undefined),
      readResume: async (id) =>
        id === resumeOnlyId
          ? {
              position: {
                measureId: "measure-3",
                measureIndex: 2,
                beatIndex: 0,
                tick: 3840,
                cachedTimeMs: 8000,
              },
              updatedAt: "2026-07-26T10:00:00.000Z",
            }
          : undefined,
    });
    await repository.initialize();
    await repository.add({
      id: loopOnlyId,
      scoreIdentity: "f".repeat(64),
      file: { fileName: "loop.gp5", bytes: new Uint8Array([4, 5]) },
      format: "gp",
      importedAt: "2026-07-26T08:00:00.000Z",
    });
    await repository.add({
      id: resumeOnlyId,
      scoreIdentity: "1".repeat(64),
      file: { fileName: "resume.gp5", bytes: new Uint8Array([6, 7]) },
      format: "gp",
      importedAt: "2026-07-26T08:00:00.000Z",
    });

    const summaries = await repository.list();
    expect(summaries.find((score) => score.id === loopOnlyId)?.practice).toEqual({ hasLoop: true });
    expect(summaries.find((score) => score.id === resumeOnlyId)?.practice).toMatchObject({
      hasLoop: false,
      lastPracticedAt: "2026-07-26T10:00:00.000Z",
      lastPosition: { measureIndex: 2 },
    });
    repository.close();
  });

  it("does not disguise a practice store failure as an empty summary", async () => {
    const id = crypto.randomUUID();
    const repository = await store({
      readSidecar: async () => {
        throw new Error("PRACTICE_STORE_UNAVAILABLE");
      },
      readResume: async () => undefined,
    });
    await repository.initialize();
    await repository.add({
      id,
      scoreIdentity: "2".repeat(64),
      file: { fileName: "practice.gp5", bytes: new Uint8Array([4, 5]) },
      format: "gp",
      importedAt: "2026-07-26T08:00:00.000Z",
    });

    await expect(repository.list()).rejects.toThrow("PRACTICE_STORE_UNAVAILABLE");
    repository.close();
  });

  it("stores managed bytes independently from the source path", async () => {
    const repository = await store();
    await repository.initialize();
    const id = crypto.randomUUID();
    await repository.add({
      id,
      scoreIdentity: "b".repeat(64),
      file: { fileName: "external.gp5", bytes: new Uint8Array([4, 5]) },
      format: "gp",
      importedAt: "2026-07-12T00:00:00.000Z",
    });
    await expect(repository.readScore(id)).resolves.toMatchObject({
      fileName: "external.gp5",
      bytes: new Uint8Array([4, 5]),
    });
    repository.close();
  });

  it("deletes analysis with its score and rejects a stale session from recreating it", async () => {
    const repository = await store();
    await repository.initialize();
    const draft = {
      id: crypto.randomUUID(),
      scoreIdentity: "c".repeat(64),
      file: { fileName: "analysis.musicxml", bytes: new Uint8Array([4, 5]) },
      format: "musicxml" as const,
      importedAt: "2026-07-15T00:00:00.000Z",
    };
    await repository.add(draft);
    const document = harmonyDocument(draft.id, draft.scoreIdentity);
    await expect(repository.save({ document, expectedDocumentVersion: null })).resolves.toMatchObject({
      status: "saved",
    });

    await repository.delete(draft.id);

    await expect(repository.read(draft.id)).resolves.toBeNull();
    await expect(repository.save({ document, expectedDocumentVersion: 0 })).rejects.toThrow("identity");
    repository.close();
  });
});

function harmonyDocument(libraryScoreId: string, sourceContentHash: string): HarmonyAnalysisDocument {
  return {
    schemaVersion: "1.0.0",
    libraryScoreId,
    sourceContentHash,
    documentVersion: 0,
    activeRevision: {
      id: crypto.randomUUID(),
      algorithmVersion: "rules-1",
      createdAt: "2026-07-15T00:00:00.000Z",
      parameters: { scope: { includedTrackIds: ["part-1"] }, topK: 8, decisionThreshold: 0.6 },
      segments: [],
    },
    corrections: [],
    annotationTarget: { trackId: "part-1", staffIndex: 0 },
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
}
