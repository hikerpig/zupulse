import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256Bytes } from "./canonical-json";
import { PdfOmrError } from "./errors";
import { mapPdfLoadError } from "./inspect-pdf";

export interface RenderedPdfPage {
  readonly pageIndex: number;
  readonly pdfWidth: number;
  readonly pdfHeight: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly scale: number;
  readonly format: "rgba";
  readonly pixels: Uint8Array;
  readonly renderSha256: string;
}

type PdfCanvasFactory = {
  create(
    width: number,
    height: number,
  ): {
    canvas: unknown;
    context: {
      fillStyle: string;
      fillRect(x: number, y: number, width: number, height: number): void;
      getImageData(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray };
    };
  };
  destroy(value: { canvas: unknown; context: unknown }): void;
};

export async function renderPdfPages(
  bytes: Uint8Array,
  options: { readonly targetWidth?: number } = {},
): Promise<readonly RenderedPdfPage[]> {
  const targetWidth = options.targetWidth ?? 1400;
  if (!Number.isInteger(targetWidth) || targetWidth <= 0) {
    throw new PdfOmrError("INVALID_INPUT", "PDF render target width must be a positive integer", {
      context: { reason: "invalid-render-target-width" },
    });
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfjsModulePath = createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.mjs");
  const standardFontDataUrl = pathToFileURL(resolve(dirname(pdfjsModulePath), "../../standard_fonts/")).href;
  const loadingTask = pdfjs.getDocument({
    data: Uint8Array.from(bytes),
    standardFontDataUrl: standardFontDataUrl.endsWith("/") ? standardFontDataUrl : `${standardFontDataUrl}/`,
  });
  const document = await loadingTask.promise.catch((error: unknown) => mapPdfLoadError(error, "input.pdf"));

  try {
    if (document.numPages === 0) {
      throw new PdfOmrError("ENGINE_OUTPUT_INVALID", "PDF contains no pages", {
        context: { reason: "zero-page-pdf" },
      });
    }

    const pages: RenderedPdfPage[] = [];
    for (let pageIndex = 0; pageIndex < document.numPages; pageIndex += 1) {
      const page = await document.getPage(pageIndex + 1);
      const pdfViewport = page.getViewport({ scale: 1 });
      if (pdfViewport.width > pdfViewport.height) {
        page.cleanup();
        throw new PdfOmrError("ENGINE_OUTPUT_INVALID", "Landscape PDF pages are not supported", {
          context: { reason: "unsupported-page-orientation", pageIndex },
        });
      }

      const scale = targetWidth / pdfViewport.width;
      const viewport = page.getViewport({ scale });
      const pixelWidth = targetWidth;
      const pixelHeight = Math.round(viewport.height);
      const canvasFactory = document.canvasFactory as PdfCanvasFactory;
      const canvasAndContext = canvasFactory.create(pixelWidth, pixelHeight);
      try {
        canvasAndContext.context.fillStyle = "#ffffff";
        canvasAndContext.context.fillRect(0, 0, pixelWidth, pixelHeight);
        await page.render({
          canvas: canvasAndContext.canvas as HTMLCanvasElement,
          viewport,
          background: "#ffffff",
        }).promise;
        const imageData = canvasAndContext.context.getImageData(0, 0, pixelWidth, pixelHeight);
        const pixels = Uint8Array.from(imageData.data);
        pages.push({
          pageIndex,
          pdfWidth: pdfViewport.width,
          pdfHeight: pdfViewport.height,
          pixelWidth,
          pixelHeight,
          scale,
          format: "rgba",
          pixels,
          renderSha256: sha256Bytes(pixels),
        });
      } finally {
        canvasFactory.destroy(canvasAndContext);
        page.cleanup();
      }
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}
