import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sheetLibraryRepositoryContract } from "./repositoryContract";
import { DesktopLibraryStore } from "../DesktopLibraryStore";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function store(): Promise<DesktopLibraryStore> {
  const root = await mkdtemp(join(tmpdir(), "tab-viewer-library-"));
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
});
