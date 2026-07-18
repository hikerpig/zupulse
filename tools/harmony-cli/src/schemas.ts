import { harmonyAnalysisInputSchema, harmonySegmentSchema } from "@zupulse/web-core";
import { z } from "zod";

export const harmonyInspectReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    command: z.literal("inspect"),
    source: z.object({ name: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
    model: harmonyAnalysisInputSchema.optional(),
    result: z.array(harmonySegmentSchema).optional(),
  })
  .strict()
  .refine((report) => report.model !== undefined || report.result !== undefined, "inspect payload is empty");

export type HarmonyInspectReport = z.infer<typeof harmonyInspectReportSchema>;

const regressionModelSummarySchema = z
  .object({
    measures: z.number().int().nonnegative(),
    tracks: z.number().int().nonnegative(),
    staves: z.number().int().nonnegative(),
    notes: z.number().int().nonnegative(),
  })
  .strict();
const regressionResultSummarySchema = z
  .object({
    segments: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
  })
  .strict();

export const harmonyRegressionManifestSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    id: z.string().min(1),
    cases: z
      .array(
        z
          .object({
            id: z.string().min(1),
            kind: z.literal("structural-regression"),
            score: z.string().min(1),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            expected: z.object({ model: regressionModelSummarySchema, result: regressionResultSummarySchema }).strict(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const datasetSourceSchema = z
  .object({
    url: z.url(),
    revision: z.string().min(1),
    license: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const datasetCaseBase = {
  id: z.string().min(1),
  datasetPath: z.string().min(1),
  source: datasetSourceSchema,
};

export const harmonyDatasetManifestSchema = z
  .object({
    schemaVersion: z.literal("2.0.0"),
    id: z.string().min(1),
    cases: z
      .array(
        z.discriminatedUnion("kind", [
          z
            .object({
              ...datasetCaseBase,
              kind: z.literal("accuracy-corpus"),
              adapter: z.enum(["dcml", "pop909"]),
              forcedEvalGroups: z.array(z.string().min(1)),
              include: z.array(z.string().min(1)).optional(),
            })
            .strict(),
          z
            .object({
              ...datasetCaseBase,
              kind: z.literal("ingestion-corpus"),
              adapter: z.literal("asap"),
            })
            .strict(),
          z
            .object({
              ...datasetCaseBase,
              kind: z.literal("label-prior-corpus"),
              adapter: z.enum(["choco", "wjazzd"]),
            })
            .strict(),
        ]),
      )
      .min(1),
  })
  .strict();

export type HarmonyDatasetManifest = z.infer<typeof harmonyDatasetManifestSchema>;

const fractionSchema = z.number().min(0).max(1);
const accuracySliceSchema = z
  .object({
    cases: z.number().int().nonnegative(),
    top1Accuracy: fractionSchema,
    resolvedPrecision: fractionSchema,
    resolvedCoverage: fractionSchema,
  })
  .strict();

export const harmonyAccuracyMetricsSchema = z
  .object({
    gold: z
      .object({
        total: z.number().int().nonnegative(),
        mapped: z.number().int().nonnegative(),
        unsupported: z.number().int().nonnegative(),
      })
      .strict(),
    mappingCoverage: fractionSchema,
    unsupportedLabelRate: fractionSchema,
    top1Accuracy: fractionSchema,
    top8OracleRecall: fractionSchema,
    resolvedPrecision: fractionSchema,
    resolvedCoverage: fractionSchema,
    boundaryF1: fractionSchema,
    expectedCalibrationError: fractionSchema,
    facets: z
      .object({
        root: fractionSchema,
        bass: fractionSchema,
        kind: fractionSchema,
        extension: fractionSchema,
        degrees: fractionSchema,
      })
      .strict(),
    slices: z
      .object({
        corpus: z.record(z.string(), accuracySliceSchema),
        chordFamily: z.record(z.string(), accuracySliceSchema),
      })
      .strict(),
  })
  .strict();

export const harmonyDatasetEvalReportSchema = z
  .object({
    schemaVersion: z.literal("2.0.0"),
    command: z.literal("eval"),
    manifest: z.string().min(1),
    summary: z.object({ passed: z.number().int().nonnegative(), failed: z.number().int().nonnegative() }).strict(),
    cases: z.array(
      z.discriminatedUnion("kind", [
        z
          .object({
            id: z.string().min(1),
            kind: z.literal("accuracy-corpus"),
            adapter: z.enum(["dcml", "pop909"]),
            status: z.enum(["passed", "failed"]),
            splits: z.record(z.enum(["train", "tune", "eval"]), z.number().int().nonnegative()),
            metrics: harmonyAccuracyMetricsSchema,
          })
          .strict(),
        z
          .object({
            id: z.string().min(1),
            kind: z.literal("ingestion-corpus"),
            adapter: z.literal("asap"),
            status: z.enum(["passed", "failed"]),
            files: z.number().int().nonnegative(),
            parsed: z.number().int().nonnegative(),
            failed: z.number().int().nonnegative(),
            notes: z.number().int().nonnegative(),
            measures: z.number().int().nonnegative(),
          })
          .strict(),
        z
          .object({
            id: z.string().min(1),
            kind: z.literal("label-prior-corpus"),
            adapter: z.enum(["choco", "wjazzd"]),
            status: z.enum(["passed", "failed"]),
            labels: z.number().int().nonnegative(),
            mapped: z.number().int().nonnegative(),
            unsupported: z.number().int().nonnegative(),
          })
          .strict(),
      ]),
    ),
  })
  .strict();

export type HarmonyDatasetEvalReport = z.infer<typeof harmonyDatasetEvalReportSchema>;

export const harmonyRegressionCheckSchema = z
  .object({
    field: z.string().min(1),
    expected: z.union([z.string(), z.number()]),
    actual: z.union([z.string(), z.number()]),
    status: z.enum(["passed", "failed"]),
  })
  .strict();

export const harmonyEvalReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    command: z.literal("eval"),
    manifest: z.string().min(1),
    summary: z.object({ passed: z.number().int().nonnegative(), failed: z.number().int().nonnegative() }).strict(),
    cases: z.array(
      z
        .object({
          id: z.string().min(1),
          status: z.enum(["passed", "failed"]),
          checks: z.array(harmonyRegressionCheckSchema),
        })
        .strict(),
    ),
  })
  .strict();

export type HarmonyRegressionManifest = z.infer<typeof harmonyRegressionManifestSchema>;
export type HarmonyRegressionCheck = z.infer<typeof harmonyRegressionCheckSchema>;
export type HarmonyEvalReport = z.infer<typeof harmonyEvalReportSchema>;
