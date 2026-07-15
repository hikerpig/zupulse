import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { HarmonyAnalysisDocument } from "@zupulse/web-core";
import { sheetLibraryRepositoryContract } from "../../../../../../test-harness/__tests__/sheetLibraryRepositoryContract";
import { DesktopLibraryStore } from "../DesktopLibraryStore";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function store(): Promise<DesktopLibraryStore> {
  const root = await mkdtemp(join(tmpdir(), "zupulse-library-"));
  roots.push(root);
  return new DesktopLibraryStore(join(root, "library.sqlite"), root);
}

sheetLibraryRepositoryContract(store);

describe("DesktopLibraryStore", () => {
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
