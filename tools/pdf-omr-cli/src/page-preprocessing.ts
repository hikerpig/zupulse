import { canonicalJson, sha256Bytes } from "./canonical-json";
import { PdfOmrError } from "./errors";
import type { RenderedPdfPage } from "./render-pdf-pages";

export const pagePreprocessingVariants = ["none", "deskew-v1", "local-contrast-v1", "adaptive-threshold-v1"] as const;

export type PagePreprocessingVariant = (typeof pagePreprocessingVariants)[number];

type PreprocessingParameters = Readonly<Record<string, number | string>>;

const parametersByVariant: Record<PagePreprocessingVariant, PreprocessingParameters> = {
  none: {},
  "deskew-v1": { maximumAngleDegrees: 3, angleStepDegrees: 0.25, foregroundThreshold: 192 },
  "local-contrast-v1": { windowSize: 31, targetStandardDeviation: 48, maximumGain: 3 },
  "adaptive-threshold-v1": { windowSize: 31, offset: 12 },
};

export type PagePreprocessingIdentity = {
  readonly id: PagePreprocessingVariant;
  readonly version: "1.0.0";
  readonly parametersSha256: string;
  readonly inputSha256: string;
  readonly outputSha256: string;
  readonly estimatedAngleDegrees?: number;
};

export function preprocessRenderedPage(
  page: RenderedPdfPage,
  variant: PagePreprocessingVariant,
): { readonly page: RenderedPdfPage; readonly identity: PagePreprocessingIdentity } {
  validatePage(page);
  if (!pagePreprocessingVariants.includes(variant)) {
    throw invalidInput("unknown page preprocessing variant", "unknown-preprocessing-variant");
  }

  let pixels: Uint8Array;
  let estimatedAngleDegrees: number | undefined;
  switch (variant) {
    case "none":
      pixels = Uint8Array.from(page.pixels);
      break;
    case "deskew-v1": {
      estimatedAngleDegrees = estimateSkewAngle(page);
      pixels = shearDeskew(page, estimatedAngleDegrees);
      break;
    }
    case "local-contrast-v1":
      pixels = stretchLocalContrast(page);
      break;
    case "adaptive-threshold-v1":
      pixels = adaptiveThreshold(page);
      break;
  }

  const outputSha256 = sha256Bytes(pixels);
  return {
    page: { ...page, pixels, renderSha256: outputSha256 },
    identity: {
      id: variant,
      version: "1.0.0",
      parametersSha256: hashCanonical(parametersByVariant[variant]),
      inputSha256: page.renderSha256,
      outputSha256,
      ...(estimatedAngleDegrees === undefined ? {} : { estimatedAngleDegrees }),
    },
  };
}

export function preprocessingDescriptor(variant: PagePreprocessingVariant): {
  readonly id: PagePreprocessingVariant;
  readonly version: "1.0.0";
  readonly parametersSha256: string;
} {
  if (!pagePreprocessingVariants.includes(variant)) {
    throw invalidInput("unknown page preprocessing variant", "unknown-preprocessing-variant");
  }
  return {
    id: variant,
    version: "1.0.0",
    parametersSha256: hashCanonical(parametersByVariant[variant]),
  };
}

function validatePage(page: RenderedPdfPage): void {
  if (
    page.format !== "rgba" ||
    !Number.isSafeInteger(page.pixelWidth) ||
    page.pixelWidth <= 0 ||
    !Number.isSafeInteger(page.pixelHeight) ||
    page.pixelHeight <= 0 ||
    page.pixels.byteLength !== page.pixelWidth * page.pixelHeight * 4 ||
    sha256Bytes(page.pixels) !== page.renderSha256
  ) {
    throw invalidInput("page preprocessing requires a valid immutable RGBA render", "invalid-rgba-page");
  }
}

function estimateSkewAngle(page: RenderedPdfPage): number {
  const { maximumAngleDegrees, angleStepDegrees, foregroundThreshold } = parametersByVariant["deskew-v1"] as {
    maximumAngleDegrees: number;
    angleStepDegrees: number;
    foregroundThreshold: number;
  };
  const foreground: Array<readonly [number, number]> = [];
  for (let y = 0; y < page.pixelHeight; y += 1) {
    for (let x = 0; x < page.pixelWidth; x += 1) {
      if (luminanceAt(page.pixels, (y * page.pixelWidth + x) * 4) < foregroundThreshold) foreground.push([x, y]);
    }
  }
  if (foreground.length === 0) throw invalidInput("deskew requires foreground pixels", "deskew-foreground-empty");

  let bestAngle = -maximumAngleDegrees;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let angle = -maximumAngleDegrees; angle <= maximumAngleDegrees + 1e-9; angle += angleStepDegrees) {
    const slope = Math.tan((angle * Math.PI) / 180);
    const rows = new Uint32Array(page.pixelHeight + Math.ceil(page.pixelWidth * Math.abs(slope)) + 2);
    const offset = Math.ceil((page.pixelWidth * Math.abs(slope)) / 2) + 1;
    for (const [x, y] of foreground) {
      const adjustedY = Math.round(y - slope * (x - page.pixelWidth / 2)) + offset;
      if (adjustedY >= 0 && adjustedY < rows.length) rows[adjustedY] = rows[adjustedY]! + 1;
    }
    let score = 0;
    for (const count of rows) score += count * count;
    if (score > bestScore) {
      bestAngle = angle;
      bestScore = score;
    }
  }
  const rounded = Math.round(bestAngle / angleStepDegrees) * angleStepDegrees;
  if (Math.abs(rounded) >= maximumAngleDegrees) {
    throw invalidInput("estimated page skew exceeds supported range", "deskew-angle-out-of-range", {
      maximumAngleDegrees,
    });
  }
  return Object.is(rounded, -0) ? 0 : rounded;
}

function shearDeskew(page: RenderedPdfPage, angleDegrees: number): Uint8Array {
  const output = new Uint8Array(page.pixels.byteLength).fill(255);
  const slope = Math.tan((angleDegrees * Math.PI) / 180);
  for (let y = 0; y < page.pixelHeight; y += 1) {
    for (let x = 0; x < page.pixelWidth; x += 1) {
      const sourceY = Math.round(y + slope * (x - page.pixelWidth / 2));
      const targetOffset = (y * page.pixelWidth + x) * 4;
      if (sourceY < 0 || sourceY >= page.pixelHeight) continue;
      const sourceOffset = (sourceY * page.pixelWidth + x) * 4;
      output.set(page.pixels.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
  }
  return output;
}

function stretchLocalContrast(page: RenderedPdfPage): Uint8Array {
  const width = page.pixelWidth;
  const height = page.pixelHeight;
  const stride = width + 1;
  const luminances = new Uint8Array(width * height);
  const integral = new Float64Array(stride * (height + 1));
  const squaredIntegral = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    let squaredRowSum = 0;
    for (let x = 0; x < width; x += 1) {
      const value = luminanceAt(page.pixels, (y * width + x) * 4);
      luminances[y * width + x] = value;
      rowSum += value;
      squaredRowSum += value * value;
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1]! + rowSum;
      squaredIntegral[(y + 1) * stride + x + 1] = squaredIntegral[y * stride + x + 1]! + squaredRowSum;
    }
  }

  const radius = 15;
  const output = new Uint8Array(page.pixels.byteLength);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = rectangleSum(integral, stride, x0, y0, x1, y1);
      const squaredSum = rectangleSum(squaredIntegral, stride, x0, y0, x1, y1);
      const mean = sum / count;
      const standardDeviation = Math.sqrt(Math.max(0, squaredSum / count - mean * mean));
      const gain = Math.min(3, 48 / Math.max(16, standardDeviation));
      const value = Math.round(mean + (luminances[y * width + x]! - mean) * gain);
      const offset = (y * width + x) * 4;
      setGrayscale(output, offset, value);
    }
  }
  return output;
}

function adaptiveThreshold(page: RenderedPdfPage): Uint8Array {
  const width = page.pixelWidth;
  const height = page.pixelHeight;
  const luminances = new Uint8Array(width * height);
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      const value = luminanceAt(page.pixels, (y * width + x) * 4);
      luminances[y * width + x] = value;
      rowSum += value;
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1]! + rowSum;
    }
  }
  const radius = 15;
  const output = new Uint8Array(page.pixels.byteLength);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      const stride = width + 1;
      const sum =
        integral[(y1 + 1) * stride + x1 + 1]! -
        integral[y0 * stride + x1 + 1]! -
        integral[(y1 + 1) * stride + x0]! +
        integral[y0 * stride + x0]!;
      const mean = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
      const value = luminances[y * width + x]! < mean - 12 ? 0 : 255;
      const offset = (y * width + x) * 4;
      output[offset] = value;
      output[offset + 1] = value;
      output[offset + 2] = value;
      output[offset + 3] = 255;
    }
  }
  return output;
}

function rectangleSum(integral: Float64Array, stride: number, x0: number, y0: number, x1: number, y1: number): number {
  return (
    integral[(y1 + 1) * stride + x1 + 1]! -
    integral[y0 * stride + x1 + 1]! -
    integral[(y1 + 1) * stride + x0]! +
    integral[y0 * stride + x0]!
  );
}

function setGrayscale(pixels: Uint8Array, offset: number, input: number): void {
  const value = Math.max(0, Math.min(255, input));
  pixels[offset] = value;
  pixels[offset + 1] = value;
  pixels[offset + 2] = value;
  pixels[offset + 3] = 255;
}

function luminanceAt(pixels: Uint8Array, offset: number): number {
  return Math.round(pixels[offset]! * 0.299 + pixels[offset + 1]! * 0.587 + pixels[offset + 2]! * 0.114);
}

function invalidInput(message: string, reason: string, context: Readonly<Record<string, unknown>> = {}): PdfOmrError {
  return new PdfOmrError("INVALID_INPUT", message, { context: { reason, ...context } });
}

function hashCanonical(value: unknown): string {
  return sha256Bytes(new TextEncoder().encode(canonicalJson(value)));
}
