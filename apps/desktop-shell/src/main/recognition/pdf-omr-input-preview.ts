import { readFile } from "node:fs/promises";
import { encodeRgbaPng, readPdfPageCount, renderPdfPages } from "@zupulse/pdf-omr-cli/pipeline";
import type { FileTokenStore } from "../file-access/file-token-store";
import type { PdfOmrJobController } from "./pdf-omr-controller";
import type { DesktopPdfOmrRuntime } from "./pdf-omr-runtime";

export const PDF_OMR_PREVIEW_MAX_PAGES = 64;

export type PdfOmrInputPreviewResponse =
  | { status: "unavailable" }
  | {
      status: "available";
      pageIndex: number;
      pageCount: number;
      contentType: "image/png" | "image/jpeg";
      bytes: Uint8Array;
    };

export type PdfOmrInputPreviewCache = Map<string, Map<number, Promise<Uint8Array | undefined>>>;

type PdfOmrInputPreviewSource = {
  inputPath: string;
  fileName: string;
  inputKind: "pdf" | "image";
};

// Preview resolves either a started job's materialized input or a not-yet-consumed selection
// token. Peeking a token never consumes it; `materializePdfOmrInput` still revalidates at start.
export async function readPdfOmrInputPreview(options: {
  controller: Pick<PdfOmrJobController, "getJobInput">;
  runtime: Pick<DesktopPdfOmrRuntime, "pdfjsAssetDirectories">;
  fileTokens: Pick<FileTokenStore, "peek">;
  cache: PdfOmrInputPreviewCache;
  pageIndex: number;
  jobId?: string;
  fileToken?: string;
}): Promise<PdfOmrInputPreviewResponse> {
  const cacheKey = options.jobId ?? options.fileToken;
  const input = resolvePreviewSource(options);
  if (cacheKey === undefined || input === undefined) return { status: "unavailable" };
  const pageIndex = options.pageIndex;
  if (input.inputKind === "image") {
    const bytes = new Uint8Array(await readFile(input.inputPath).catch(() => new ArrayBuffer(0)));
    if (bytes.byteLength === 0 || bytes.byteLength > 64 * 1024 * 1024 || pageIndex !== 0) {
      return { status: "unavailable" };
    }
    return {
      status: "available",
      pageIndex: 0,
      pageCount: 1,
      contentType: /\.jpe?g$/i.test(input.fileName) ? "image/jpeg" : "image/png",
      bytes,
    };
  }
  const cache = options.cache;
  for (const key of cache.keys()) {
    if (key !== cacheKey) cache.delete(key);
  }
  const source = new Uint8Array(await readFile(input.inputPath).catch(() => new ArrayBuffer(0)));
  if (source.byteLength === 0) return { status: "unavailable" };
  const assets = options.runtime.pdfjsAssetDirectories();
  const pageCount = await readPdfPageCount(source, assets).catch(() => undefined);
  if (pageCount === undefined || pageCount > PDF_OMR_PREVIEW_MAX_PAGES || pageIndex >= pageCount) {
    return { status: "unavailable" };
  }
  let jobCache = cache.get(cacheKey);
  if (jobCache === undefined) {
    jobCache = new Map();
    cache.set(cacheKey, jobCache);
  }
  let page = jobCache.get(pageIndex);
  if (page === undefined) {
    page = renderPdfPages(source, { targetWidth: 1000, allowLandscape: true, pageIndex, ...assets })
      .then((pages) => {
        const rendered = pages[0];
        return rendered === undefined
          ? undefined
          : encodeRgbaPng(rendered.pixelWidth, rendered.pixelHeight, Uint8Array.from(rendered.pixels));
      })
      .catch(() => undefined);
    jobCache.set(pageIndex, page);
  }
  const bytes = await page;
  if (bytes === undefined) return { status: "unavailable" };
  return { status: "available", pageIndex, pageCount, contentType: "image/png", bytes };
}

function resolvePreviewSource(options: {
  controller: Pick<PdfOmrJobController, "getJobInput">;
  fileTokens: Pick<FileTokenStore, "peek">;
  jobId?: string;
  fileToken?: string;
}): PdfOmrInputPreviewSource | undefined {
  if (options.jobId !== undefined) {
    const input = options.controller.getJobInput(options.jobId);
    return input === undefined
      ? undefined
      : { inputPath: input.inputPath, fileName: input.fileName, inputKind: input.inputKind };
  }
  if (options.fileToken === undefined) return undefined;
  try {
    const entry = options.fileTokens.peek(options.fileToken);
    return {
      inputPath: entry.path,
      fileName: entry.fileName,
      inputKind: /\.(png|jpe?g)$/i.test(entry.fileName) ? "image" : "pdf",
    };
  } catch {
    return undefined;
  }
}
