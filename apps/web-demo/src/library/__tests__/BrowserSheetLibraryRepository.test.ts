import { IDBFactory } from "fake-indexeddb";
import { expect, it } from "vitest";
import { sheetLibraryRepositoryContract } from "../../../../../test-harness/__tests__/sheetLibraryRepositoryContract";
import { BrowserSheetLibraryRepository } from "../BrowserSheetLibraryRepository";

sheetLibraryRepositoryContract(() => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
  return new BrowserSheetLibraryRepository();
});

it("does not create practice data for a missing Library Score", async () => {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: new IDBFactory() });
  const repository = new BrowserSheetLibraryRepository();
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
