import type { OpenFileResponse } from "@tab-viewer/web-core";
import { dialog } from "electron";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import type { FileTokenStore } from "./fileTokens";

export const MAX_SCORE_BYTES = 64 * 1024 * 1024;
export type ReadableScoreMetadata = {
  fileName: string;
  sizeBytes: number;
  isFile: boolean;
};

export function assertReadableScore(metadata: ReadableScoreMetadata): void {
  if (!metadata.isFile) throw new Error("FILE_NOT_REGULAR");
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
  showOpenDialog: () =>
    dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "乐谱", extensions: ["gp3", "gp4", "gp5", "gpx", "gp", "musicxml", "mxl"] },
        { name: "Guitar Pro", extensions: ["gp3", "gp4", "gp5", "gpx", "gp"] },
        { name: "MusicXML", extensions: ["musicxml", "mxl"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    }),
  stat,
};

export async function openScoreFile(
  tokens: FileTokenStore,
  dependencies: FileDependencies = defaultDependencies,
): Promise<OpenFileResponse> {
  const selection = await dependencies.showOpenDialog();
  const path = selection.filePaths[0];
  if (selection.canceled || !path) return { status: "cancelled" };

  const info = await dependencies.stat(path);
  const fileName = basename(path);
  assertReadableScore({ fileName, sizeBytes: info.size, isFile: info.isFile() });
  return {
    status: "opened",
    fileToken: tokens.issue(path, { fileName, sizeBytes: info.size }),
    fileName,
    sizeBytes: info.size,
  };
}

export async function selectScoreFiles(
  tokens: FileTokenStore,
  multiple: boolean,
): Promise<
  { status: "cancelled" } | { status: "selected"; files: { fileToken: string; fileName: string; sizeBytes: number }[] }
> {
  const selection = await dialog.showOpenDialog({
    properties: multiple ? ["openFile", "multiSelections"] : ["openFile"],
    filters: [{ name: "乐谱", extensions: ["gp3", "gp4", "gp5", "gpx", "gp", "musicxml", "mxl"] }],
  });
  if (selection.canceled || selection.filePaths.length === 0) return { status: "cancelled" };
  const files = await Promise.all(
    selection.filePaths.map(async (path) => {
      const info = await stat(path);
      const fileName = basename(path);
      assertReadableScore({ fileName, sizeBytes: info.size, isFile: info.isFile() });
      return { fileToken: tokens.issue(path, { fileName, sizeBytes: info.size }), fileName, sizeBytes: info.size };
    }),
  );
  return { status: "selected", files };
}

export async function readScoreFileBytes(
  tokens: FileTokenStore,
  token: string,
  read: (path: string) => Promise<Uint8Array> = readFile,
): Promise<{ fileName: string; bytes: Uint8Array }> {
  const entry = tokens.consume(token);
  const bytes = new Uint8Array(await read(entry.path));
  if (bytes.byteLength > MAX_SCORE_BYTES) throw new Error("FILE_TOO_LARGE");
  return { fileName: entry.fileName, bytes };
}

export async function saveScoreFile(file: {
  fileName: string;
  bytes: Uint8Array;
}): Promise<{ status: "saved" | "cancelled" }> {
  const selection = await dialog.showSaveDialog({ defaultPath: file.fileName });
  if (selection.canceled || !selection.filePath) return { status: "cancelled" };
  await writeFile(selection.filePath, file.bytes, { mode: 0o600 });
  return { status: "saved" };
}

/** @deprecated Use the format-neutral score APIs. */
export const assertReadableGp = assertReadableScore;
/** @deprecated Use the format-neutral score APIs. */
export const openGpFile = openScoreFile;
/** @deprecated Use the format-neutral score APIs. */
export const readGpFileBytes = readScoreFileBytes;
