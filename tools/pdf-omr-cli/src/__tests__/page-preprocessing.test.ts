import { describe, expect, it } from "vitest";
import { sha256Bytes } from "../canonical-json";
import {
  pagePreprocessingVariants,
  preprocessRenderedPage,
  type PagePreprocessingVariant,
} from "../page-preprocessing";
import type { RenderedPdfPage } from "../render-pdf-pages";

describe("page preprocessing", () => {
  it.each(pagePreprocessingVariants)("keeps %s deterministic, versioned, and immutable", (variant) => {
    const page = slopedLinePage(1.5);
    const original = Uint8Array.from(page.pixels);

    const first = preprocessRenderedPage(page, variant);
    const second = preprocessRenderedPage(page, variant);

    expect(first).toEqual(second);
    expect(page.pixels).toEqual(original);
    expect(first.page.pixels).not.toBe(page.pixels);
    expect(first.identity).toMatchObject({
      id: variant,
      version: "1.0.0",
      inputSha256: page.renderSha256,
      outputSha256: sha256Bytes(first.page.pixels),
    });
    expect(first.page.renderSha256).toBe(first.identity.outputSha256);
    expect(first.identity.parametersSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("deskews a supported small angle", () => {
    const input = slopedLinePage(2);

    const result = preprocessRenderedPage(input, "deskew-v1");

    expect(result.identity.estimatedAngleDegrees).toBeCloseTo(2, 0);
    expect(lineRange(result.page)).toBeLessThan(lineRange(input));
  });

  it("applies distinct local contrast and adaptive threshold outputs", () => {
    const page = gradientPage();

    const contrast = preprocessRenderedPage(page, "local-contrast-v1");
    const threshold = preprocessRenderedPage(page, "adaptive-threshold-v1");

    expect(contrast.identity.outputSha256).not.toBe(page.renderSha256);
    expect(threshold.identity.outputSha256).not.toBe(contrast.identity.outputSha256);
    expect(new Set(grayscaleValues(threshold.page))).toEqual(new Set([0, 255]));
  });

  it("fails closed for empty foreground, excessive skew, malformed pixels, and unknown variants", () => {
    const blank = blankPage(64, 32);
    expect(() => preprocessRenderedPage(blank, "deskew-v1")).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT", context: { reason: "deskew-foreground-empty" } }),
    );
    expect(() => preprocessRenderedPage(slopedLinePage(8), "deskew-v1")).toThrowError(
      expect.objectContaining({
        code: "INVALID_INPUT",
        context: expect.objectContaining({ reason: "deskew-angle-out-of-range" }),
      }),
    );
    expect(() => preprocessRenderedPage({ ...blank, pixels: new Uint8Array(3) }, "none")).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT", context: { reason: "invalid-rgba-page" } }),
    );
    expect(() => preprocessRenderedPage(blank, "unknown" as PagePreprocessingVariant)).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT", context: { reason: "unknown-preprocessing-variant" } }),
    );
  });
});

function blankPage(width: number, height: number): RenderedPdfPage {
  const pixels = new Uint8Array(width * height * 4).fill(255);
  return {
    pageIndex: 0,
    pdfWidth: width,
    pdfHeight: height,
    pixelWidth: width,
    pixelHeight: height,
    scale: 1,
    format: "rgba",
    pixels,
    renderSha256: sha256Bytes(pixels),
  };
}

function slopedLinePage(angleDegrees: number): RenderedPdfPage {
  const page = blankPage(128, 64);
  const pixels = Uint8Array.from(page.pixels);
  const slope = Math.tan((angleDegrees * Math.PI) / 180);
  for (let x = 4; x < page.pixelWidth - 4; x += 1) {
    const y = Math.round(32 + slope * (x - page.pixelWidth / 2));
    for (let offset = -1; offset <= 1; offset += 1) setGray(pixels, page.pixelWidth, x, y + offset, 0);
  }
  return { ...page, pixels, renderSha256: sha256Bytes(pixels) };
}

function gradientPage(): RenderedPdfPage {
  const page = blankPage(32, 32);
  const pixels = Uint8Array.from(page.pixels);
  for (let y = 0; y < page.pixelHeight; y += 1) {
    for (let x = 0; x < page.pixelWidth; x += 1) {
      const value = Math.max(0, Math.min(255, 80 + x * 4 + (y % 4) * 8));
      setGray(pixels, page.pixelWidth, x, y, value);
    }
  }
  return { ...page, pixels, renderSha256: sha256Bytes(pixels) };
}

function setGray(pixels: Uint8Array, width: number, x: number, y: number, value: number): void {
  const offset = (y * width + x) * 4;
  pixels[offset] = value;
  pixels[offset + 1] = value;
  pixels[offset + 2] = value;
  pixels[offset + 3] = 255;
}

function grayscaleValues(page: RenderedPdfPage): number[] {
  const values: number[] = [];
  for (let offset = 0; offset < page.pixels.length; offset += 4) values.push(page.pixels[offset]!);
  return values;
}

function lineRange(page: RenderedPdfPage): number {
  const rows: number[] = [];
  for (let y = 0; y < page.pixelHeight; y += 1) {
    for (let x = 0; x < page.pixelWidth; x += 1) {
      if (page.pixels[(y * page.pixelWidth + x) * 4]! < 32) rows.push(y);
    }
  }
  return Math.max(...rows) - Math.min(...rows);
}
