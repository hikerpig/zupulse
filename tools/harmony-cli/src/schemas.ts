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
  adapterVersion: z.literal("1.0.0"),
  datasetPath: z.string().min(1),
  archivePath: z.string().min(1),
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
              groupBy: z.enum(["prefix-before-hyphen", "corpus"]).optional(),
            })
            .strict(),
          z
            .object({
              ...datasetCaseBase,
              kind: z.literal("ingestion-corpus"),
              adapter: z.literal("asap"),
              include: z.array(z.string().min(1)).optional(),
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
const accuracyOutcomeSchema = z.enum([
  "unsupported-label",
  "unresolved-oracle-top1",
  "unresolved-oracle-hit",
  "unresolved-oracle-miss",
  "resolved-correct",
  "resolved-wrong",
]);
const accuracyErrorCategorySchema = z.enum([
  "unsupported-label",
  "unresolved-oracle-top1",
  "unresolved-oracle-hit",
  "unresolved-oracle-miss",
  "root",
  "bass",
  "kind",
  "extension",
  "degrees",
  "boundary",
]);
const diagnosticBucketSchema = z
  .object({ cases: z.number().int().nonnegative(), weight: z.number().nonnegative() })
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
    diagnostics: z
      .object({
        outcomes: z.partialRecord(accuracyOutcomeSchema, diagnosticBucketSchema),
        outcomesByFamily: z.record(z.string(), z.partialRecord(accuracyOutcomeSchema, diagnosticBucketSchema)),
        errors: z.partialRecord(accuracyErrorCategorySchema, diagnosticBucketSchema),
        confidenceBins: z
          .array(
            z
              .object({
                index: z.number().int().min(0).max(9),
                cases: z.number().int().nonnegative(),
                weight: z.number().nonnegative(),
                averageConfidence: fractionSchema,
                accuracy: fractionSchema,
              })
              .strict(),
          )
          .length(10),
        precisionCoverageCurve: z.array(
          z.object({ threshold: fractionSchema, precision: fractionSchema, coverage: fractionSchema }).strict(),
        ),
      })
      .strict(),
  })
  .strict();

export const harmonyDatasetEvalReportSchema = z
  .object({
    schemaVersion: z.literal("2.1.0"),
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
            errors: z.array(
              z
                .object({
                  pieceId: z.string().min(1),
                  groupId: z.string().min(1),
                  measureIndex: z.number().int().nonnegative(),
                  offsetTicks: z.number().int().nonnegative(),
                  label: z.string().min(1),
                  family: z.string().min(1),
                  category: accuracyErrorCategorySchema,
                })
                .strict(),
            ),
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
            segments: z.number().int().nonnegative(),
            runtimeMs: z.number().nonnegative(),
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

const accuracyBaselineCaseSchema = z
  .object({
    splits: z
      .object({
        train: z.number().int().nonnegative(),
        tune: z.number().int().nonnegative(),
        eval: z.number().int().nonnegative(),
      })
      .strict(),
    gold: z
      .object({
        total: z.number().int().nonnegative(),
        mapped: z.number().int().nonnegative(),
        unsupported: z.number().int().nonnegative(),
      })
      .strict(),
    mappingCoverage: fractionSchema,
    top1Accuracy: fractionSchema,
    top8OracleRecall: fractionSchema,
    resolvedPrecision: fractionSchema,
    resolvedCoverage: fractionSchema,
    boundaryF1: fractionSchema,
    expectedCalibrationError: fractionSchema,
  })
  .strict();

export const harmonyAccuracyBaselineSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    sourceManifest: z.string().min(1),
    datasetRevision: z.string().min(1),
    algorithmVersion: z.string().min(1),
    tolerance: fractionSchema,
    cases: z.record(z.string().min(1), accuracyBaselineCaseSchema),
  })
  .strict();

export const harmonyBaselineComparisonReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    command: z.literal("compare"),
    baseline: z.string().min(1),
    report: z.string().min(1),
    summary: z.object({ passed: z.number().int().nonnegative(), failed: z.number().int().nonnegative() }).strict(),
    cases: z.array(
      z
        .object({
          id: z.string().min(1),
          status: z.enum(["passed", "failed"]),
          checks: z.array(
            z
              .object({
                field: z.string().min(1),
                expected: z.number(),
                actual: z.number(),
                direction: z.enum(["equal", "higher", "lower"]),
                tolerance: z.number().nonnegative(),
                status: z.enum(["passed", "failed"]),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();

export type HarmonyAccuracyBaseline = z.infer<typeof harmonyAccuracyBaselineSchema>;
export type HarmonyBaselineComparisonReport = z.infer<typeof harmonyBaselineComparisonReportSchema>;
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
