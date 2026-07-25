import { IDBFactory } from "fake-indexeddb";
import { expect, it } from "vitest";
import type { HarmonyAnalysisDocument } from "@zupulse/web-core";
import {
  exampleDraft,
  sheetLibraryRepositoryContract,
} from "../../../../test-harness/__tests__/sheetLibraryRepositoryContract";
import { IndexedDbSheetLibraryRepository } from "../index";

sheetLibraryRepositoryContract(() => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
  return new IndexedDbSheetLibraryRepository();
});

it("does not create practice data for a missing Library Score", async () => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
  const repository = new IndexedDbSheetLibraryRepository();
  await repository.initialize();
  await expect(
    repository.writeResume(crypto.randomUUID(), {
      schemaVersion: 1,
      identity: { contentHash: "a".repeat(64), format: "gp" },
      position: { measureIndex: 0, beatIndex: 0, tick: 0 },
      updatedAt: "2026-07-12T00:00:00.000Z",
    }),
  ).rejects.toThrow("LIBRARY_SCORE_NOT_FOUND");
});

it("deletes only an analysis document without deleting its Library Score", async () => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
  const repository = new IndexedDbSheetLibraryRepository();
  const draft = exampleDraft();
  await repository.add(draft);

  await repository.deleteHarmonyAnalysis(draft.id);

  await expect(repository.get(draft.id)).resolves.toMatchObject({ id: draft.id });
});

it("deletes analysis with its Library Score and rejects stale recreation", async () => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
  const repository = new IndexedDbSheetLibraryRepository();
  await repository.initialize();
  const draft = exampleDraft();
  await repository.add(draft);
  const document = harmonyDocument(draft.id, draft.scoreIdentity);
  await expect(repository.save({ document, expectedDocumentVersion: null })).resolves.toMatchObject({
    status: "saved",
  });

  await repository.delete(draft.id);

  await expect(repository.read(draft.id)).resolves.toBeNull();
  await expect(repository.save({ document, expectedDocumentVersion: 0 })).rejects.toThrow("identity");
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
