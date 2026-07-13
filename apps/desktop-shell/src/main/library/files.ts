import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LibraryScoreId, StoredScoreFile } from "@zupulse/web-core";

export function managedScorePath(root: string, id: LibraryScoreId): string {
  return join(root, "scores", `${id}.score`);
}

export async function writeManagedScore(root: string, id: LibraryScoreId, file: StoredScoreFile): Promise<void> {
  const target = managedScorePath(root, id);
  const staging = `${target}.${crypto.randomUUID()}.staging`;
  await mkdir(join(root, "scores"), { recursive: true });
  try {
    await writeFile(staging, file.bytes, { mode: 0o600 });
    await rename(staging, target);
  } finally {
    await rm(staging, { force: true });
  }
}

export async function readManagedScore(root: string, id: LibraryScoreId, fileName: string): Promise<StoredScoreFile> {
  return { fileName, bytes: new Uint8Array(await readFile(managedScorePath(root, id))) };
}

export async function removeManagedScore(root: string, id: LibraryScoreId): Promise<void> {
  await rm(managedScorePath(root, id), { force: true });
}
