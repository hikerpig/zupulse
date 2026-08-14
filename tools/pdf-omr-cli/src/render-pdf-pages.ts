import { zlibSync } from "fflate";
import { sha256Bytes } from "./canonical-json";
import { PdfOmrError } from "./errors";
import { mapPdfLoadError } from "./inspect-pdf";
import { createPdfJsOptions } from "./pdfjs-options";

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
  options: {
    readonly targetWidth?: number;
    readonly standardFontDirectory?: string;
    readonly wasmDirectory?: string;
    readonly allowLandscape?: boolean;
  } = {},
): Promise<readonly RenderedPdfPage[]> {
  const targetWidth = options.targetWidth ?? 1400;
  if (!Number.isInteger(targetWidth) || targetWidth <= 0) {
    throw new PdfOmrError("INVALID_INPUT", "PDF render target width must be a positive integer", {
      context: { reason: "invalid-render-target-width" },
    });
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfJsOptions = createPdfJsOptions(options);
  const loadingTask = pdfjs.getDocument({
    data: Uint8Array.from(bytes),
    ...pdfJsOptions,
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
      if (!options.allowLandscape && pdfViewport.width > pdfViewport.height) {
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

export function encodeRgbaPng(width: number, height: number, pixels: Uint8Array): Uint8Array {
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) {
    throw new TypeError("PNG dimensions must be positive integers");
  }
  if (pixels.byteLength !== width * height * 4) throw new TypeError("PNG pixels must contain complete RGBA rows");

  const rowBytes = width * 4;
  const scanlines = new Uint8Array((rowBytes + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const targetOffset = row * (rowBytes + 1);
    scanlines[targetOffset] = 0;
    scanlines.set(pixels.subarray(row * rowBytes, (row + 1) * rowBytes), targetOffset + 1);
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  return concatenate([
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlibSync(scanlines, { level: 9 })),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

function pngChunk(name: string, data: Uint8Array): Uint8Array {
  const type = new TextEncoder().encode(name);
  const result = new Uint8Array(12 + data.byteLength);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.byteLength);
  result.set(type, 4);
  result.set(data, 8);
  view.setUint32(8 + data.byteLength, crc32(concatenate([type, data])));
  return result;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}
