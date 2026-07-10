import type { OpenFileResponse } from "@tab-viewer/web-core";
import { dialog } from "electron";
import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { FileTokenStore } from "./fileTokens";

export const MAX_SCORE_BYTES = 64 * 1024 * 1024;
const GP_EXTENSIONS = new Set([".gp3", ".gp4", ".gp5", ".gpx", ".gp"]);

export type ReadableGpMetadata = {
  fileName: string;
  sizeBytes: number;
  isFile: boolean;
};

export function assertReadableGp(metadata: ReadableGpMetadata): void {
  if (!metadata.isFile) throw new Error("FILE_NOT_REGULAR");
  if (!GP_EXTENSIONS.has(extname(metadata.fileName).toLowerCase())) {
    throw new Error("FILE_TYPE_NOT_ALLOWED");
  }
  if (!Number.isSafeInteger(metadata.sizeBytes) || metadata.sizeBytes < 0) {
    throw new Error("FILE_SIZE_INVALID");
  }
  if (metadata.sizeBytes > MAX_SCORE_BYTES) throw new Error("FILE_TOO_LARGE");
}

type FileDependencies = {
  showOpenDialog(): Promise<{ canceled: boolean; filePaths: string[] }>;
  stat(path: string): Promise<{ size: number; isFile(): boolean }>;
};

const defaultDependencies: FileDependencies = {
  showOpenDialog: () => dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Guitar Pro", extensions: ["gp3", "gp4", "gp5", "gpx", "gp"] }],
  }),
  stat,
};

export async function openGpFile(
  tokens: FileTokenStore,
  dependencies: FileDependencies = defaultDependencies,
): Promise<OpenFileResponse> {
  const selection = await dependencies.showOpenDialog();
  const path = selection.filePaths[0];
  if (selection.canceled || !path) return { status: "cancelled" };

  const info = await dependencies.stat(path);
  const fileName = basename(path);
  assertReadableGp({ fileName, sizeBytes: info.size, isFile: info.isFile() });
  return {
    status: "opened",
    fileToken: tokens.issue(path, { fileName, sizeBytes: info.size }),
    fileName,
    sizeBytes: info.size,
  };
}

export async function readGpFileBytes(
  tokens: FileTokenStore,
  token: string,
  read: (path: string) => Promise<Uint8Array> = readFile,
): Promise<{ fileName: string; bytes: Uint8Array }> {
  const entry = tokens.consume(token);
  const bytes = new Uint8Array(await read(entry.path));
  if (bytes.byteLength > MAX_SCORE_BYTES) throw new Error("FILE_TOO_LARGE");
  return { fileName: entry.fileName, bytes };
}
