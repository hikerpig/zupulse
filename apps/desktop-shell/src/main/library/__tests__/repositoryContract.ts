import { describe, expect, it } from "vitest";
import type { SheetLibraryRepository, ValidatedLibraryScoreDraft } from "@tab-viewer/web-core";

export type SheetLibraryRepositoryFactory = () => Promise<SheetLibraryRepository> | SheetLibraryRepository;

export function sheetLibraryRepositoryContract(createRepository: SheetLibraryRepositoryFactory): void {
  describe("SheetLibraryRepository contract", () => {
    it("deduplicates by score identity and keeps the original bytes", async () => {
      const repository = await createRepository();
      await repository.initialize();
      const draft = exampleDraft();
      const created = await repository.add(draft);
      const existing = await repository.add({ ...draft, id: crypto.randomUUID() });
      expect(created.status).toBe("created");
      expect(existing).toMatchObject({ status: "existing", score: { id: draft.id } });
      await expect(repository.readScore(draft.id)).resolves.toMatchObject({
        fileName: draft.file.fileName,
        bytes: draft.file.bytes,
      });
    });

    it("updates metadata and favorites without changing the library identity", async () => {
      const repository = await createRepository();
      await repository.initialize();
      const draft = exampleDraft();
      await repository.add(draft);
      const updated = await repository.updateMetadata(draft.id, { titleOverride: "Changed" });
      await repository.setFavorite(draft.id, true);
      expect(updated).toMatchObject({
        id: draft.id,
        scoreIdentity: draft.scoreIdentity,
        metadata: { titleOverride: "Changed" },
      });
      await expect(repository.get(draft.id)).resolves.toMatchObject({ isFavorite: true });
    });

    it("permanently removes the score and permits a fresh re-import", async () => {
      const repository = await createRepository();
      await repository.initialize();
      const draft = exampleDraft();
      await repository.add(draft);
      await repository.delete(draft.id);
      await expect(repository.get(draft.id)).resolves.toBeUndefined();
      await expect(repository.readScore(draft.id)).rejects.toThrow();
      await expect(repository.add({ ...draft, id: crypto.randomUUID() })).resolves.toMatchObject({ status: "created" });
    });
  });
}

export function exampleDraft(): ValidatedLibraryScoreDraft {
  return {
    id: crypto.randomUUID(),
    scoreIdentity: "a".repeat(64),
    file: { fileName: "example.gp5", bytes: new Uint8Array([1, 2, 3]) },
    format: "gp",
    parsedTitle: "Example",
    importedAt: "2026-07-12T00:00:00.000Z",
  };
}
