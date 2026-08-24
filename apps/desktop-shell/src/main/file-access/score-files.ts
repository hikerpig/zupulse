import { isSupportedLibraryScoreFile } from "@zupulse/web-core";
import { createAppI18n, type SupportedLocale } from "@zupulse/app-i18n";
import { dialog } from "electron";
import { mkdir, open, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { FileTokenEntry, FileTokenStore } from "./file-token-store";

export const MAX_SCORE_BYTES = 64 * 1024 * 1024;
// PDF OMR inputs bridge select → preview → start, which can take minutes; the default 60s
// token TTL would expire while the user reviews the preview.
export const PDF_OMR_INPUT_TOKEN_TTL_MS = 30 * 60_000;
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

type TokenFile = { fileToken: string; fileName: string; sizeBytes: number };

export type PdfFileDependencies = {
  showOpenDialog(): Promise<{ canceled: boolean; filePaths: string[] }>;
  stat(path: string): Promise<{
    size: number;
    isFile(): boolean;
    dev?: number;
    ino?: number;
    mtimeMs?: number;
  }>;
};

export async function selectMidiFile(
  tokens: FileTokenStore,
  dependencies?: PdfFileDependencies,
  locale: SupportedLocale = "en-US",
): Promise<{ status: "cancelled" } | { status: "selected"; fileToken: string; fileName: string; sizeBytes: number }> {
  const resolvedDependencies = dependencies ?? defaultMidiDependencies(locale);
  const selection = await resolvedDependencies.showOpenDialog();
  const path = selection.filePaths[0];
  if (selection.canceled || !path || !/\.midi?$/i.test(path)) return { status: "cancelled" };
  const fileName = basename(path);
  const info = await resolvedDependencies.stat(path);
  assertReadableScore({ fileName, sizeBytes: info.size, isFile: info.isFile() });
  return {
    status: "selected",
    fileToken: tokens.issue(path, { fileName, sizeBytes: info.size, ...fileIdentity(info) }),
    fileName,
    sizeBytes: info.size,
  };
}

export async function selectScoreFiles(
  tokens: FileTokenStore,
  multiple: boolean,
  locale: SupportedLocale = "en-US",
): Promise<{ status: "cancelled" } | { status: "selected"; files: readonly TokenFile[] }> {
  const t = createAppI18n(locale).getFixedT(locale, "desktop");
  const selection = await dialog.showOpenDialog({
    title: t("dialog.openTitle"),
    buttonLabel: t("dialog.openButton"),
    properties: multiple ? ["openFile", "multiSelections"] : ["openFile"],
    filters: [{ name: t("dialog.scoreFiles"), extensions: ["gp3", "gp4", "gp5", "gpx", "gp", "musicxml", "mxl"] }],
  });
  if (selection.canceled || selection.filePaths.length === 0) return { status: "cancelled" };
  const accepted = await acceptScorePaths(tokens, selection.filePaths);
  if (accepted.status === "cancelled") return { status: "cancelled" };
  return { status: "selected", files: accepted.files };
}

export async function selectPdfFile(
  tokens: FileTokenStore,
  dependencies?: PdfFileDependencies,
  locale: SupportedLocale = "en-US",
): Promise<
  | { status: "cancelled" }
  | { status: "selected"; fileToken: string; fileName: string; sizeBytes: number; inputKind: "pdf" | "image" }
> {
  const resolvedDependencies = dependencies ?? defaultPdfDependencies(locale);
  const selection = await resolvedDependencies.showOpenDialog();
  const path = selection.filePaths[0];
  const extension = path?.toLowerCase().match(/\.(pdf|png|jpe?g)$/)?.[1];
  if (selection.canceled || !path || extension === undefined) return { status: "cancelled" };
  const fileName = basename(path);
  const info = await resolvedDependencies.stat(path);
  assertReadableScore({ fileName, sizeBytes: info.size, isFile: info.isFile() });
  return {
    status: "selected",
    fileToken: tokens.issue(
      path,
      { fileName, sizeBytes: info.size, ...fileIdentity(info) },
      PDF_OMR_INPUT_TOKEN_TTL_MS,
    ),
    fileName,
    sizeBytes: info.size,
    inputKind: extension === "pdf" ? "pdf" : "image",
  };
}

function defaultPdfDependencies(locale: SupportedLocale): PdfFileDependencies {
  const t = createAppI18n(locale).getFixedT(locale, "desktop");
  return {
    showOpenDialog: () =>
      dialog.showOpenDialog({
        title: t("dialog.openTitle"),
        buttonLabel: t("dialog.openButton"),
        properties: ["openFile"],
        filters: [{ name: "PDF / PNG / JPEG", extensions: ["pdf", "png", "jpg", "jpeg"] }],
      }),
    stat,
  };
}

function defaultMidiDependencies(locale: SupportedLocale): PdfFileDependencies {
  const t = createAppI18n(locale).getFixedT(locale, "desktop");
  return {
    showOpenDialog: () =>
      dialog.showOpenDialog({
        title: t("dialog.openTitle"),
        buttonLabel: t("dialog.openButton"),
        properties: ["openFile"],
        filters: [{ name: "MIDI", extensions: ["mid", "midi"] }],
      }),
    stat,
  };
}

export async function acceptScorePaths(
  tokens: FileTokenStore,
  paths: readonly string[],
): Promise<{ status: "cancelled" } | { status: "accepted"; files: readonly TokenFile[] }> {
  const validPaths = paths.filter((path) => typeof path === "string" && path.length > 0);
  if (validPaths.length === 0) return { status: "cancelled" };
  const results = await Promise.all(
    validPaths.map(async (path): Promise<TokenFile | null> => {
      try {
        const fileName = basename(path);
        if (!isSupportedLibraryScoreFile(fileName)) return null;
        const info = await stat(path);
        assertReadableScore({ fileName, sizeBytes: info.size, isFile: info.isFile() });
        return {
          fileToken: tokens.issue(path, { fileName, sizeBytes: info.size }),
          fileName,
          sizeBytes: info.size,
        };
      } catch {
        return null;
      }
    }),
  );
  const files = results.filter((entry): entry is TokenFile => entry !== null);
  if (files.length === 0) return { status: "cancelled" };
  return { status: "accepted", files };
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

export async function materializePdfOmrInput(
  tokens: FileTokenStore,
  token: string,
  directory: string,
): Promise<FileTokenEntry> {
  const entry = tokens.consume(token);
  const bytes = await readTokenEntryBytes(entry);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stablePath = join(directory, entry.fileName);
  await writeFile(stablePath, bytes, { mode: 0o600, flag: "wx" });
  return { ...entry, path: stablePath };
}

// Reads a token-issued external file through an open descriptor, revalidating type, size and
// captured identity against the token metadata. Used by preview paths that peek the token and
// by `materializePdfOmrInput` after consuming it.
export async function readTokenEntryBytes(entry: FileTokenEntry): Promise<Uint8Array> {
  const source = await open(entry.path, "r");
  const bytes = await (async () => {
    try {
      const info = await source.stat();
      assertReadableScore({ fileName: entry.fileName, sizeBytes: info.size, isFile: info.isFile() });
      if (
        info.size !== entry.sizeBytes ||
        (entry.identity !== undefined &&
          (info.dev !== entry.identity.dev ||
            info.ino !== entry.identity.ino ||
            info.mtimeMs !== entry.identity.mtimeMs))
      ) {
        throw new Error("FILE_CHANGED");
      }
      return new Uint8Array(await source.readFile());
    } finally {
      await source.close();
    }
  })();
  if (bytes.byteLength !== entry.sizeBytes) throw new Error("FILE_CHANGED");
  return bytes;
}

function fileIdentity(info: { dev?: number; ino?: number; mtimeMs?: number }): Pick<FileTokenEntry, "identity"> {
  if (info.dev === undefined || info.ino === undefined || info.mtimeMs === undefined) return {};
  return { identity: { dev: info.dev, ino: info.ino, mtimeMs: info.mtimeMs } };
}

export async function saveScoreFile(
  file: {
    fileName: string;
    bytes: Uint8Array;
  },
  locale: SupportedLocale = "en-US",
): Promise<{ status: "saved" | "cancelled" }> {
  const t = createAppI18n(locale).getFixedT(locale, "desktop");
  const selection = await dialog.showSaveDialog({
    title: t("dialog.saveTitle"),
    buttonLabel: t("dialog.saveButton"),
    defaultPath: file.fileName,
  });
  if (selection.canceled || !selection.filePath) return { status: "cancelled" };
  await writeFile(selection.filePath, file.bytes, { mode: 0o600 });
  return { status: "saved" };
}
