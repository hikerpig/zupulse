import { z } from "zod";
import { sha256Bytes } from "./canonical-json";
import { PdfOmrError } from "./errors";
import type { RenderedPdfPage } from "./render-pdf-pages";
import { sha256Schema } from "./schemas";

export const LEARNED_LAYOUT_VALIDATION_PARAMETERS = {
  detectorVersion: "learned-staff-system-v1",
  outputSchemaVersion: "1.0.0",
  targetWidth: 1400,
  cropPaddingMultiplier: 4,
  maximumStaffCount: 3,
  maximumStaffSpacingDeviationRatio: 0.35,
} as const;

const normalizedPointSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
const normalizedPolylineSchema = z.array(normalizedPointSchema).min(2);
const normalizedBBoxSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
  })
  .strict();

export const learnedLayoutDetectorIdentitySchema = z
  .object({
    id: z.literal(LEARNED_LAYOUT_VALIDATION_PARAMETERS.detectorVersion),
    modelRevision: z.string().min(1),
    weightsSha256: sha256Schema,
    weightsLicense: z.string().min(1),
    trainingDataDeclarationSha256: sha256Schema,
    runtime: z.object({ id: z.string().min(1), version: z.string().min(1), backend: z.literal("cpu") }).strict(),
    input: z.object({ format: z.literal("grayscale-u8"), targetWidth: z.literal(1400) }).strict(),
    outputSchemaVersion: z.literal(LEARNED_LAYOUT_VALIDATION_PARAMETERS.outputSchemaVersion),
    parametersSha256: sha256Schema,
  })
  .strict();

const learnedSystemCandidateSchema = z
  .object({
    pageIndex: z.number().int().nonnegative(),
    confidence: z.number().finite().min(0).max(1),
    normalizedBBox: normalizedBBoxSchema,
    staffCount: z.number().int().positive().max(LEARNED_LAYOUT_VALIDATION_PARAMETERS.maximumStaffCount),
    staffLinePolylines: z.array(normalizedPolylineSchema),
    connectorEvidence: z
      .array(
        z
          .object({ confidence: z.number().finite().min(0).max(1), normalizedPolyline: normalizedPolylineSchema })
          .strict(),
      )
      .optional(),
  })
  .strict();

export const learnedLayoutPageOutputSchema = z
  .object({
    schemaVersion: z.literal(LEARNED_LAYOUT_VALIDATION_PARAMETERS.outputSchemaVersion),
    pageIndex: z.number().int().nonnegative(),
    systems: z.array(learnedSystemCandidateSchema).min(1),
  })
  .strict();

export type LearnedLayoutDetectorIdentity = z.infer<typeof learnedLayoutDetectorIdentitySchema>;
export type LearnedLayoutPageOutput = z.infer<typeof learnedLayoutPageOutputSchema>;

export type LearnedStaffSystem = {
  pageIndex: number;
  systemIndex: number;
  staffCount: number;
  confidence: number;
  pageRenderSha256: string;
  localStaffSpacingPx: number;
  pixelBBox: { x: number; y: number; width: number; height: number };
  pdfPointBBox: { x: number; y: number; width: number; height: number };
  cropPixels: Uint8Array;
  cropSha256: string;
  staffLineYs: number[];
};

export type LearnedLayoutSegmentation = {
  detectorVersion: typeof LEARNED_LAYOUT_VALIDATION_PARAMETERS.detectorVersion;
  validationParameters: typeof LEARNED_LAYOUT_VALIDATION_PARAMETERS;
  systems: LearnedStaffSystem[];
};

type ValidatedCandidate = z.infer<typeof learnedSystemCandidateSchema> & {
  staffLineYs: number[];
  localStaffSpacingPx: number;
};

export function materializeLearnedLayoutPage(page: RenderedPdfPage, rawOutput: unknown): LearnedLayoutSegmentation {
  validatePage(page);
  const output = parseOutput(page.pageIndex, rawOutput);
  if (output.pageIndex !== page.pageIndex || output.systems.some((system) => system.pageIndex !== page.pageIndex)) {
    throw invalidOutput(page.pageIndex, "learned-page-index");
  }

  const candidates = output.systems.map((candidate, systemIndex) => validateCandidate(page, candidate, systemIndex));
  for (let systemIndex = 1; systemIndex < candidates.length; systemIndex += 1) {
    const previous = candidates[systemIndex - 1]!.normalizedBBox;
    const current = candidates[systemIndex]!.normalizedBBox;
    if (current.y < previous.y + previous.height) {
      throw invalidOutput(page.pageIndex, "learned-system-order", { systemIndex });
    }
  }

  const boundaries = candidates.map((candidate, systemIndex) => {
    const previous = candidates[systemIndex - 1];
    const next = candidates[systemIndex + 1];
    const rawTop = candidate.normalizedBBox.y * page.pixelHeight;
    const rawBottom = (candidate.normalizedBBox.y + candidate.normalizedBBox.height) * page.pixelHeight;
    const paddedTop = Math.floor(
      rawTop - LEARNED_LAYOUT_VALIDATION_PARAMETERS.cropPaddingMultiplier * candidate.localStaffSpacingPx,
    );
    const paddedBottom = Math.ceil(
      rawBottom + LEARNED_LAYOUT_VALIDATION_PARAMETERS.cropPaddingMultiplier * candidate.localStaffSpacingPx,
    );
    const previousBoundary =
      previous === undefined
        ? 0
        : Math.floor(
            ((previous.normalizedBBox.y + previous.normalizedBBox.height + candidate.normalizedBBox.y) / 2) *
              page.pixelHeight,
          );
    const nextBoundary =
      next === undefined
        ? page.pixelHeight
        : Math.floor(
            ((candidate.normalizedBBox.y + candidate.normalizedBBox.height + next.normalizedBBox.y) / 2) *
              page.pixelHeight,
          );
    return {
      top: Math.max(0, paddedTop, previousBoundary),
      bottom: Math.min(page.pixelHeight, paddedBottom, nextBoundary),
    };
  });

  const systems = candidates.map((candidate, systemIndex): LearnedStaffSystem => {
    const boundary = boundaries[systemIndex]!;
    if (boundary.bottom <= boundary.top) {
      throw invalidOutput(page.pageIndex, "learned-crop-boundaries", { systemIndex });
    }
    const pixelBBox = { x: 0, y: boundary.top, width: page.pixelWidth, height: boundary.bottom - boundary.top };
    const cropPixels = cropRgba(page, pixelBBox);
    return {
      pageIndex: page.pageIndex,
      systemIndex,
      staffCount: candidate.staffCount,
      confidence: candidate.confidence,
      pageRenderSha256: page.renderSha256,
      localStaffSpacingPx: candidate.localStaffSpacingPx,
      pixelBBox,
      pdfPointBBox: {
        x: pixelBBox.x / page.scale,
        y: page.pdfHeight - (pixelBBox.y + pixelBBox.height) / page.scale,
        width: pixelBBox.width / page.scale,
        height: pixelBBox.height / page.scale,
      },
      cropPixels,
      cropSha256: sha256Bytes(cropPixels),
      staffLineYs: candidate.staffLineYs,
    };
  });

  return {
    detectorVersion: LEARNED_LAYOUT_VALIDATION_PARAMETERS.detectorVersion,
    validationParameters: LEARNED_LAYOUT_VALIDATION_PARAMETERS,
    systems,
  };
}

function validatePage(page: RenderedPdfPage): void {
  if (
    page.format !== "rgba" ||
    page.pixelWidth !== LEARNED_LAYOUT_VALIDATION_PARAMETERS.targetWidth ||
    page.pixels.length !== page.pixelWidth * page.pixelHeight * 4
  ) {
    throw invalidOutput(page.pageIndex, "learned-input-page");
  }
}

function parseOutput(pageIndex: number, rawOutput: unknown): LearnedLayoutPageOutput {
  const parsed = learnedLayoutPageOutputSchema.safeParse(rawOutput);
  if (!parsed.success) {
    throw invalidOutput(pageIndex, "learned-output-schema", { issues: parsed.error.issues });
  }
  return parsed.data;
}

function validateCandidate(
  page: RenderedPdfPage,
  candidate: z.infer<typeof learnedSystemCandidateSchema>,
  systemIndex: number,
): ValidatedCandidate {
  const { normalizedBBox: bbox } = candidate;
  if (bbox.x < 0 || bbox.y < 0 || bbox.x + bbox.width > 1 || bbox.y + bbox.height > 1) {
    throw invalidOutput(page.pageIndex, "learned-system-bounds", { systemIndex });
  }
  if (candidate.staffLinePolylines.length !== candidate.staffCount * 5) {
    throw invalidOutput(page.pageIndex, "learned-staff-topology", { systemIndex });
  }

  const normalizedLineYs = candidate.staffLinePolylines.map((polyline) => {
    let previousX = -1;
    let sumY = 0;
    for (const point of polyline) {
      if (point.x < bbox.x || point.x > bbox.x + bbox.width || point.y < bbox.y || point.y > bbox.y + bbox.height) {
        throw invalidOutput(page.pageIndex, "learned-staff-line-bounds", { systemIndex });
      }
      if (point.x <= previousX) {
        throw invalidOutput(page.pageIndex, "learned-staff-line-order", { systemIndex });
      }
      previousX = point.x;
      sumY += point.y;
    }
    return sumY / polyline.length;
  });
  if (normalizedLineYs.some((lineY, index) => index > 0 && lineY <= normalizedLineYs[index - 1]!)) {
    throw invalidOutput(page.pageIndex, "learned-staff-line-order", { systemIndex });
  }

  const staffSpacings: number[] = [];
  for (let staffIndex = 0; staffIndex < candidate.staffCount; staffIndex += 1) {
    const lines = normalizedLineYs.slice(staffIndex * 5, staffIndex * 5 + 5);
    const gaps = lines.slice(1).map((lineY, index) => lineY - lines[index]!);
    const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    if (
      mean <= 0 ||
      gaps.some(
        (gap) => Math.abs(gap - mean) / mean > LEARNED_LAYOUT_VALIDATION_PARAMETERS.maximumStaffSpacingDeviationRatio,
      )
    ) {
      throw invalidOutput(page.pageIndex, "learned-staff-topology", { systemIndex, staffIndex });
    }
    staffSpacings.push(mean * page.pixelHeight);
  }
  const sortedSpacings = [...staffSpacings].sort((left, right) => left - right);
  const localStaffSpacingPx = Math.max(1, Math.round(sortedSpacings[Math.floor(sortedSpacings.length / 2)]!));
  return {
    ...candidate,
    staffLineYs: normalizedLineYs.map((lineY) => Math.round(lineY * page.pixelHeight)),
    localStaffSpacingPx,
  };
}

function cropRgba(page: RenderedPdfPage, bbox: { x: number; y: number; width: number; height: number }): Uint8Array {
  const result = new Uint8Array(bbox.width * bbox.height * 4);
  const sourceRowBytes = page.pixelWidth * 4;
  const cropRowBytes = bbox.width * 4;
  for (let row = 0; row < bbox.height; row += 1) {
    const sourceOffset = (bbox.y + row) * sourceRowBytes + bbox.x * 4;
    result.set(page.pixels.subarray(sourceOffset, sourceOffset + cropRowBytes), row * cropRowBytes);
  }
  return result;
}

function invalidOutput(pageIndex: number, stage: string, details: Readonly<Record<string, unknown>> = {}): PdfOmrError {
  return new PdfOmrError("ENGINE_OUTPUT_INVALID", "Learned layout detector output is invalid", {
    context: { reason: "invalid-learned-layout-output", pageIndex, stage, ...details },
  });
}
