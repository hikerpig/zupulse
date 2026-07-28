import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256Bytes } from "./canonical-json";
import { PdfOmrError } from "./errors";
import { pdfOmrInspectReportSchema, type PdfOmrInspectReport } from "./schemas";

export async function inspectPdfBytes(bytes: Uint8Array, options: { fileName: string }): Promise<PdfOmrInspectReport> {
  const fileName = basename(options.fileName);
  const source = {
    fileName,
    sha256: sha256Bytes(bytes),
    sizeBytes: bytes.byteLength,
  };

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfjsModulePath = createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.mjs");
  const standardFontDataUrl = pathToFileURL(resolve(dirname(pdfjsModulePath), "../../standard_fonts/")).href;
  const loadingTask = pdfjs.getDocument({
    data: Uint8Array.from(bytes),
    standardFontDataUrl: standardFontDataUrl.endsWith("/") ? standardFontDataUrl : `${standardFontDataUrl}/`,
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
