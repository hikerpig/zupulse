import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { LibraryScoreId } from "@tab-viewer/web-core";
import { managedScorePath, removeManagedScore } from "./files";
import type { openSqliteDatabase } from "./sqlite";

type Database = ReturnType<typeof openSqliteDatabase>;
type Row = { id: LibraryScoreId; storage_state: "pending" | "ready" | "deleting" };

export async function reconcileManagedScores(database: Database, root: string): Promise<void> {
  const rows = database
    .prepare("SELECT id, storage_state FROM library_scores WHERE storage_state != 'ready'")
    .all() as Row[];
  for (const row of rows) {
    if (row.storage_state === "deleting") {
      await removeManagedScore(root, row.id);
      database.prepare("DELETE FROM library_scores WHERE id = ?").run(row.id);
      continue;
    }
    if (await exists(managedScorePath(root, row.id))) {
      database.prepare("UPDATE library_scores SET storage_state = 'ready' WHERE id = ?").run(row.id);
    } else {
      database.prepare("DELETE FROM library_scores WHERE id = ?").run(row.id);
    }
  }
  const directory = join(root, "scores");
  try {
    for (const file of await readdir(directory)) if (file.endsWith(".staging")) await removeFile(join(directory, file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
async function removeFile(path: string): Promise<void> {
  await rm(path, { force: true });
}
