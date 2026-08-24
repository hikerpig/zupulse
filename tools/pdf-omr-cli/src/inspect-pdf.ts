import { basename, extname } from "node:path";
import { sha256Bytes } from "./canonical-json";
import { PdfOmrError } from "./errors";
import { createPdfJsOptions } from "./pdfjs-options";
import { pdfOmrInspectReportSchema, type PdfOmrInspectReport } from "./schemas";

export async function inspectPdfBytes(
  bytes: Uint8Array,
  options: { fileName: string; standardFontDirectory?: string; wasmDirectory?: string },
): Promise<PdfOmrInspectReport> {
  const fileName = basename(options.fileName);
  const source = {
    fileName,
    sha256: sha256Bytes(bytes),
    sizeBytes: bytes.byteLength,
    inputKind: "pdf" as const,
  };

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfJsOptions = createPdfJsOptions(options);
  const loadingTask = pdfjs.getDocument({
    data: Uint8Array.from(bytes),
    ...pdfJsOptions,
  });
  const document = await loadingTask.promise.catch((error: unknown) => mapPdfLoadError(error, fileName));

  try {
    const pages: PdfOmrInspectReport["pages"] = [];
    const vectorOperators = new Set([pdfjs.OPS.constructPath, pdfjs.OPS.showText, pdfjs.OPS.showSpacedText]);
    const rasterOperators = new Set([
      pdfjs.OPS.paintImageMaskXObject,
      pdfjs.OPS.paintImageMaskXObjectGroup,
      pdfjs.OPS.paintImageXObject,
      pdfjs.OPS.paintInlineImageXObject,
      pdfjs.OPS.paintInlineImageXObjectGroup,
      pdfjs.OPS.paintImageXObjectRepeat,
      pdfjs.OPS.paintImageMaskXObjectRepeat,
      pdfjs.OPS.paintSolidColorImageMask,
    ]);

    for (let pageIndex = 0; pageIndex < document.numPages; pageIndex += 1) {
      const page = await document.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: 1 });
      const operators = await page.getOperatorList();
      pages.push({
        index: pageIndex,
        width: viewport.width,
        height: viewport.height,
        vectorOperators: operators.fnArray.filter((operator) => vectorOperators.has(operator)).length,
        rasterOperators: operators.fnArray.filter((operator) => rasterOperators.has(operator)).length,
      });
      page.cleanup();
    }

    return pdfOmrInspectReportSchema.parse({
      schemaVersion: "1.0.0",
      command: "inspect",
      source,
      pageCount: pages.length,
      pages,
    });
  } finally {
    await loadingTask.destroy();
  }
}

export async function findBlankPdfPages(
  bytes: Uint8Array,
  options: { fileName: string; standardFontDirectory?: string; wasmDirectory?: string },
): Promise<number[]> {
  const report = await inspectPdfBytes(bytes, options);
  return report.pages
    .filter((page) => page.vectorOperators === 0 && page.rasterOperators === 0)
    .map((page) => page.index);
}

export async function inspectOmrInputBytes(
  bytes: Uint8Array,
  options: { fileName: string; standardFontDirectory?: string; wasmDirectory?: string },
): Promise<PdfOmrInspectReport> {
  const extension = extname(options.fileName).toLowerCase();
  if (extension === ".pdf") return inspectPdfBytes(bytes, options);
  const dimensions = extension === ".png" ? pngDimensions(bytes) : jpegDimensions(bytes);
  const fileName = basename(options.fileName);
  if (dimensions === undefined) {
    throw new PdfOmrError("INVALID_INPUT", "Image is malformed or unsupported", {
      context: { reason: "malformed-image", fileName },
    });
  }
  return pdfOmrInspectReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "inspect",
    source: { fileName, sha256: sha256Bytes(bytes), sizeBytes: bytes.byteLength, inputKind: "image" },
    pageCount: 1,
    pages: [{ index: 0, ...dimensions, vectorOperators: 0, rasterOperators: 1 }],
  });
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
  if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : undefined;
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  for (let offset = 2; offset + 8 < bytes.length;) {
    if (bytes[offset] !== 0xff) return undefined;
    const marker = bytes[offset + 1]!;
    if (marker === 0xd9 || marker === 0xda) return undefined;
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2 || offset + 2 + length > bytes.length) return undefined;
    if (sofMarkers.has(marker)) {
      const height = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      const width = (bytes[offset + 7]! << 8) | bytes[offset + 8]!;
      return width > 0 && height > 0 ? { width, height } : undefined;
    }
    offset += length + 2;
  }
  return undefined;
}

export function mapPdfLoadError(error: unknown, fileName: string): never {
  if (error instanceof PdfOmrError) throw error;
  const descriptor =
    typeof error === "object" && error !== null
      ? {
          name: "name" in error ? String(error.name) : "",
          code: "code" in error ? Number(error.code) : undefined,
        }
      : { name: "", code: undefined };
  const encrypted = descriptor.name === "PasswordException" || descriptor.code === 1 || descriptor.code === 2;
  throw new PdfOmrError("INVALID_INPUT", encrypted ? "PDF requires a password" : "PDF is malformed or unsupported", {
    context: { reason: encrypted ? "encrypted-pdf" : "malformed-pdf", fileName: basename(fileName) },
    cause: error,
  });
}
