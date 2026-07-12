import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrateLibraryDatabase } from "./migrations";
import { managedScorePath } from "./files";
import { reconcileManagedScores } from "./reconcile";
import { openSqliteDatabase } from "./sqlite";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("reconcileManagedScores", () => {
  it("completes pending files and removes deleting records plus staging files", async () => {
    const root = await mkdtemp(join(tmpdir(), "tab-viewer-reconcile-"));
    roots.push(root);
    const database = openSqliteDatabase(join(root, "library.sqlite"));
    migrateLibraryDatabase(database);
    const pending = crypto.randomUUID();
    const deleting = crypto.randomUUID();
    for (const [id, state, hash] of [
      [pending, "pending", "a".repeat(64)],
      [deleting, "deleting", "b".repeat(64)],
    ] as const)
      database
        .prepare(
          "INSERT INTO library_scores (id, score_identity, file_name, format, imported_at, storage_state) VALUES (?, ?, 'score.gp5', 'gp', '2026-07-12T00:00:00.000Z', ?)",
        )
        .run(id, hash, state);
    await mkdir(join(root, "scores"), { recursive: true });
    await writeFile(managedScorePath(root, pending), new Uint8Array([1]));
    await writeFile(managedScorePath(root, deleting), new Uint8Array([2]));
    await writeFile(join(root, "scores", "orphan.staging"), new Uint8Array([3]));
    await reconcileManagedScores(database, root);
    expect(database.prepare("SELECT storage_state FROM library_scores WHERE id = ?").get(pending)).toMatchObject({
      storage_state: "ready",
    });
    expect(database.prepare("SELECT id FROM library_scores WHERE id = ?").get(deleting)).toBeUndefined();
    await expect(rm(join(root, "scores", "orphan.staging"))).rejects.toMatchObject({ code: "ENOENT" });
    database.close();
  });
});
