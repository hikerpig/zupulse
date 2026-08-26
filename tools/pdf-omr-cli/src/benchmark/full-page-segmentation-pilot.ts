import { z } from "zod";
import { canonicalJson, sha256Bytes } from "../canonical-json";
import { type PdfOmrErrorCode, PdfOmrError, pdfOmrErrorCodes } from "../errors";
import {
  pagePreprocessingVariants,
  preprocessingDescriptor,
  preprocessRenderedPage,
  type PagePreprocessingVariant,
} from "../page-preprocessing";
import type { RenderedPdfPage } from "../render-pdf-pages";
import { sha256Schema } from "../schemas";
import { STAFF_SYSTEM_SEGMENTATION_PARAMETERS, type StaffSystemSegmentation } from "../staff-system-segmentation";
import { type CorpusManifest, verifyCorpusManifest } from "./corpus";

const pilotConfigSchema = z
  .object({
    detector: z.literal("rokot-staff-system-v2"),
    preprocess: z.enum(pagePreprocessingVariants),
  })
  .strict();

const bboxSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().nonnegative(),
    height: z.number().finite().nonnegative(),
  })
  .strict();

const systemSchema = z
  .object({
    systemIndex: z.number().int().nonnegative(),
    staffLayout: z.enum(["single-staff", "grand-staff"]),
    staffCount: z.union([z.literal(1), z.literal(2)]),
    pixelBBox: bboxSchema,
    pdfPointBBox: bboxSchema,
    cropSha256: sha256Schema,
  })
  .strict();

const errorSchema = z
  .object({
    code: z.enum(pdfOmrErrorCodes),
    message: z.string().min(1),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const succeededPageSchema = z
  .object({
    pageIndex: z.number().int().nonnegative(),
    renderSha256: sha256Schema,
    preprocessedSha256: sha256Schema,
    estimatedAngleDegrees: z.number().finite().optional(),
    status: z.literal("succeeded"),
    systems: z.array(systemSchema),
  })
  .strict();

const failedPageSchema = z
  .object({
    pageIndex: z.number().int().nonnegative(),
    renderSha256: sha256Schema,
    preprocessedSha256: sha256Schema.optional(),
    estimatedAngleDegrees: z.number().finite().optional(),
    status: z.literal("failed"),
    error: errorSchema,
  })
  .strict();

const countSchema = z
  .object({
    attempted: z.number().int().nonnegative(),
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  })
  .strict();

export const fullPageSegmentationPilotReportSchema = z
  .object({
    schemaVersion: z.literal("3.0.0"),
    corpusId: z.string().min(1),
    manifestSha256: sha256Schema,
    split: z.literal("development"),
    render: z
      .object({
        targetWidth: z.literal(1400),
        allowLandscape: z.literal(true),
        parametersSha256: sha256Schema,
      })
      .strict(),
    preprocess: z
      .object({
        id: z.enum(pagePreprocessingVariants),
        version: z.literal("1.0.0"),
        parametersSha256: sha256Schema,
      })
      .strict(),
    detector: z
      .object({
        id: z.literal("rokot-staff-system-v2"),
        parametersSha256: sha256Schema,
      })
      .strict(),
    items: z.array(
      z
        .object({
          itemId: z.string().min(1),
          workId: z.string().min(1),
          inputSha256: sha256Schema,
          status: z.enum(["succeeded", "failed"]),
          pageCount: z.number().int().nonnegative(),
          systemCount: z.number().int().nonnegative(),
          pages: z.array(z.discriminatedUnion("status", [succeededPageSchema, failedPageSchema])),
        })
        .strict(),
    ),
    summary: z
      .object({
        items: countSchema,
        pages: countSchema,
        systems: z.number().int().nonnegative(),
        failureStages: z.record(z.string(), z.number().int().positive()),
      })
      .strict(),
  })
  .strict();

export type FullPageSegmentationPilotReport = z.infer<typeof fullPageSegmentationPilotReportSchema>;

export type FullPageSegmentationPilotDependencies = {
  readInput(path: string): Promise<Uint8Array>;
  renderPages(input: Uint8Array): Promise<readonly RenderedPdfPage[]>;
  segmentPage(page: RenderedPdfPage): StaffSystemSegmentation;
};

export async function buildFullPageSegmentationPilot(
  request: {
    manifest: CorpusManifest;
    manifestSha256: string;
    config: unknown;
  },
  dependencies: FullPageSegmentationPilotDependencies,
): Promise<FullPageSegmentationPilotReport> {
  const manifest = verifyCorpusManifest(request.manifest);
  const manifestSha256 = parseSha256(request.manifestSha256, "invalid-manifest-sha256");
  const config = parseConfig(request.config);
  const developmentItems = manifest.items.filter((item) => item.split === "development");
  if (developmentItems.length === 0) {
    throw invalidInput("full-page segmentation pilot requires development items", "no-development-items");
  }

  const items: FullPageSegmentationPilotReport["items"] = [];
  for (const item of developmentItems) {
    const input = await dependencies.readInput(item.input.path);
    if (sha256Bytes(input) !== item.input.sha256) {
      throw invalidInput("corpus input hash does not match manifest", "corpus-input-hash-mismatch", {
        itemId: item.id,
      });
    }
    const pages = [...(await dependencies.renderPages(input))].sort((left, right) => left.pageIndex - right.pageIndex);
    const pilotPages = pages.map((page) => buildPageEvidence(page, config.preprocess, dependencies.segmentPage));
    const systemCount = pilotPages.reduce(
      (total, page) => total + (page.status === "succeeded" ? page.systems.length : 0),
      0,
    );
    items.push({
      itemId: item.id,
      workId: item.workId,
      inputSha256: item.input.sha256,
      status: pilotPages.some((page) => page.status === "failed") ? "failed" : "succeeded",
      pageCount: pilotPages.length,
      systemCount,
      pages: pilotPages,
    });
  }

  return fullPageSegmentationPilotReportSchema.parse({
    schemaVersion: "3.0.0",
    corpusId: manifest.corpusId,
    manifestSha256,
    split: "development",
    render: {
      targetWidth: 1400,
      allowLandscape: true,
      parametersSha256: hashCanonical({ targetWidth: 1400, allowLandscape: true }),
    },
    preprocess: preprocessingDescriptor(config.preprocess),
    detector: {
      id: STAFF_SYSTEM_SEGMENTATION_PARAMETERS.detectorVersion,
      parametersSha256: hashCanonical(STAFF_SYSTEM_SEGMENTATION_PARAMETERS),
    },
    items,
    summary: summarize(items),
  });
}

function buildPageEvidence(
  page: RenderedPdfPage,
  variant: PagePreprocessingVariant,
  segmentPage: FullPageSegmentationPilotDependencies["segmentPage"],
): FullPageSegmentationPilotReport["items"][number]["pages"][number] {
  let preprocessing: ReturnType<typeof preprocessRenderedPage> | undefined;
  let segmentation: StaffSystemSegmentation;
  try {
    preprocessing = preprocessRenderedPage(page, variant);
    segmentation = segmentPage(preprocessing.page);
  } catch (error) {
    return {
      pageIndex: page.pageIndex,
      renderSha256: page.renderSha256,
      ...(preprocessing === undefined
        ? {}
        : {
            preprocessedSha256: preprocessing.identity.outputSha256,
            ...(preprocessing.identity.estimatedAngleDegrees === undefined
              ? {}
              : { estimatedAngleDegrees: preprocessing.identity.estimatedAngleDegrees }),
          }),
      status: "failed",
      error: safePageError(error, page.pageIndex),
    };
  }
  if (segmentation.detectorVersion !== STAFF_SYSTEM_SEGMENTATION_PARAMETERS.detectorVersion) {
    throw invalidInput("segmentation detector identity does not match pilot", "detector-identity-mismatch");
  }
  if (preprocessing === undefined) {
    throw invalidInput("page preprocessing evidence is missing", "preprocessing-evidence-missing");
  }
  return {
    pageIndex: page.pageIndex,
    renderSha256: page.renderSha256,
    preprocessedSha256: preprocessing.identity.outputSha256,
    ...(preprocessing.identity.estimatedAngleDegrees === undefined
      ? {}
      : { estimatedAngleDegrees: preprocessing.identity.estimatedAngleDegrees }),
    status: "succeeded",
    systems: [...segmentation.systems]
      .sort((left, right) => left.systemIndex - right.systemIndex)
      .map((system) => ({
        systemIndex: system.systemIndex,
        staffLayout: system.staffLayout,
        staffCount: system.staffCount,
        pixelBBox: system.pixelBBox,
        pdfPointBBox: system.pdfPointBBox,
        cropSha256: system.cropSha256,
      })),
  };
}

function summarize(items: FullPageSegmentationPilotReport["items"]): FullPageSegmentationPilotReport["summary"] {
  const pages = items.flatMap((item) => item.pages);
  const failureStages: Record<string, number> = {};
  for (const page of pages) {
    if (page.status !== "failed") continue;
    const stage =
      stringContext(page.error.context, "stage") ?? stringContext(page.error.context, "reason") ?? page.error.code;
    failureStages[stage] = (failureStages[stage] ?? 0) + 1;
  }
  return {
    items: countStatuses(items),
    pages: countStatuses(pages),
    systems: items.reduce((total, item) => total + item.systemCount, 0),
    failureStages,
  };
}

function countStatuses(values: readonly { status: "succeeded" | "failed" }[]) {
  const succeeded = values.filter((value) => value.status === "succeeded").length;
  return { attempted: values.length, succeeded, failed: values.length - succeeded };
}

function safePageError(
  error: unknown,
  pageIndex: number,
): { code: PdfOmrErrorCode; message: string; context: Readonly<Record<string, unknown>> } {
  if (!(error instanceof PdfOmrError)) {
    return {
      code: "ENGINE_OUTPUT_INVALID",
      message: "full-page segmentation failed",
      context: { reason: "unexpected-segmentation-failure", pageIndex },
    };
  }
  return {
    code: error.code,
    message: error.message,
    context: sanitizeContext(error.context, pageIndex),
  };
}

const allowedContextFields = [
  "reason",
  "stage",
  "pageIndex",
  "groupCount",
  "detectedStaffLineYs",
  "unpairedGroupCount",
  "unpairedStaffLineYs",
] as const;

function sanitizeContext(
  context: Readonly<Record<string, unknown>> | undefined,
  pageIndex: number,
): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = { pageIndex };
  for (const field of allowedContextFields) {
    const value = context?.[field];
    if (value !== undefined && isBoundedJson(value)) result[field] = value;
  }
  return result;
}

function isBoundedJson(value: unknown): boolean {
  if (value === null || typeof value === "boolean" || typeof value === "number") return true;
  if (typeof value === "string") return value.length <= 200 && !looksLikeAbsolutePath(value);
  if (Array.isArray(value)) return value.length <= 100 && value.every(isBoundedJson);
  return false;
}

function looksLikeAbsolutePath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(value);
}

function stringContext(context: Readonly<Record<string, unknown>> | undefined, field: string): string | undefined {
  const value = context?.[field];
  return typeof value === "string" ? value : undefined;
}

function parseConfig(input: unknown): z.infer<typeof pilotConfigSchema> {
  try {
    return pilotConfigSchema.parse(input);
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "full-page segmentation pilot config is invalid", {
      context: { reason: "invalid-full-page-pilot-config" },
      cause: error,
    });
  }
}

function parseSha256(value: string, reason: string): string {
  try {
    return sha256Schema.parse(value);
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "full-page segmentation pilot identity is invalid", {
      context: { reason },
      cause: error,
    });
  }
}

function invalidInput(message: string, reason: string, context: Readonly<Record<string, unknown>> = {}): PdfOmrError {
  return new PdfOmrError("INVALID_INPUT", message, { context: { reason, ...context } });
}

function hashCanonical(value: unknown): string {
  return sha256Bytes(new TextEncoder().encode(canonicalJson(value)));
}
