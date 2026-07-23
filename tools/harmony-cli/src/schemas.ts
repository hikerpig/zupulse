import {
  chordSymbolSchema,
  harmonyAnalysisInputSchema,
  harmonySegmentSchema,
  scoreWrittenMomentSchema,
  scoreWrittenRangeSchema,
} from "@zupulse/web-core";
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

const evaluationProtocolCorpusV3Schema = z
  .object({
    caseId: z.string().min(1),
    sourceRevision: z.string().min(1),
    groupsSha256: z.string().regex(/^[a-f0-9]{64}$/),
    finalHoldoutGroups: z.array(z.string().min(1)),
    regressionGroups: z.array(z.string().min(1)),
    developmentOnly: z.boolean().optional(),
  })
  .strict()
  .superRefine((corpus, context) => {
    const overlap = corpus.finalHoldoutGroups.find((group) => corpus.regressionGroups.includes(group));
    if (overlap)
      context.addIssue({
        code: "custom",
        message: `group cannot be both final holdout and regression: ${overlap}`,
      });
    if (corpus.finalHoldoutGroups.length === 0 && corpus.developmentOnly !== true)
      context.addIssue({ code: "custom", message: "corpus without final holdout must be development-only" });
  });

export const harmonyEvaluationProtocolV3Schema = z
  .object({
    schemaVersion: z.literal("3.0.0"),
    id: z.string().min(1),
    historicalRegressionCases: z.array(z.string().min(1)),
    corpora: z.array(evaluationProtocolCorpusV3Schema).min(1),
  })
  .strict();

export type HarmonyEvaluationProtocolV3 = z.infer<typeof harmonyEvaluationProtocolV3Schema>;

const twoDecimalScoreSchema = z
  .number()
  .finite()
  .refine((value) => Number(value.toFixed(2)) === value, "scores must have at most two decimals");

const harmonyRankingRecordsReportV11Schema = z
  .object({
    schemaVersion: z.literal("1.1.0"),
    command: z.literal("ranking-records"),
    split: z.enum(["train", "tune"]),
    featureVersion: z.literal("relative-pc-presence-v1"),
    groupsSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sources: z.array(
      z
        .object({
          caseId: z.string().min(1),
          revision: z.string().min(1),
          groupsSha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    ),
    records: z.array(
      z
        .object({
          id: z.string().min(1),
          corpus: z.string().min(1),
          groupId: z.string().min(1),
          range: scoreWrittenRangeSchema,
          weight: z.number().int().positive(),
          outcome: z.enum(["oracle-hit", "oracle-miss"]),
          primaryIndex: z.number().int().min(-1).max(7),
          targetIndex: z.number().int().min(0).max(7).optional(),
          candidates: z
            .array(
              z
                .object({
                  chord: chordSymbolSchema,
                  features: z.array(twoDecimalScoreSchema).length(37),
                  ruleLocalScore: twoDecimalScoreSchema,
                  ruleSequenceScore: twoDecimalScoreSchema,
                })
                .strict(),
            )
            .min(1)
            .max(8),
        })
        .strict(),
    ),
  })
  .strict();

export const harmonyRankingRecordsReportSchema = z.preprocess((input) => {
  if (typeof input !== "object" || input === null) return input;
  const legacy = input as Record<string, unknown>;
  if (legacy.schemaVersion !== "1.0.0" || typeof legacy.trainingGroupsSha256 !== "string") return input;
  const { trainingGroupsSha256, ...report } = legacy;
  return { ...report, schemaVersion: "1.1.0", split: "train", groupsSha256: trainingGroupsSha256 };
}, harmonyRankingRecordsReportV11Schema);

export type HarmonyRankingRecordsReport = z.infer<typeof harmonyRankingRecordsReportSchema>;

export const harmonyBoundaryRecordsReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    command: z.literal("boundary-records"),
    split: z.enum(["train", "tune"]),
    featureVersion: z.literal("boundary-evidence-v1"),
    groupsSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sources: z.array(
      z
        .object({
          caseId: z.string().min(1),
          revision: z.string().min(1),
          groupsSha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    ),
    records: z.array(
      z
        .object({
          id: z.string().min(1),
          corpus: z.string().min(1),
          groupId: z.string().min(1),
          moment: scoreWrittenMomentSchema,
          target: z.union([z.literal(0), z.literal(1)]),
          features: z.array(twoDecimalScoreSchema).length(5),
        })
        .strict(),
    ),
  })
  .strict();

export type HarmonyBoundaryRecordsReport = z.infer<typeof harmonyBoundaryRecordsReportSchema>;

const fractionSchema = z.number().min(0).max(1);
const accuracySliceSchema = z
  .object({
    cases: z.number().int().nonnegative(),
    top1Accuracy: fractionSchema,
    predictedPrimaryAccuracy: fractionSchema,
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
  "resolved-wrong-oracle-hit",
  "resolved-wrong-oracle-miss",
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
const intervalOverlapDiagnosticsSchema = z
  .object({
    overlap: z
      .object({
        mappedDurationTicks: z.number().int().nonnegative(),
        correctDurationTicks: z.number().int().nonnegative(),
        wrongDurationTicks: z.number().int().nonnegative(),
        unresolvedDurationTicks: z.number().int().nonnegative(),
        accuracy: fractionSchema,
        resolvedPrecision: fractionSchema,
        resolvedCoverage: fractionSchema,
      })
      .strict(),
    boundaries: z
      .object({
        expected: z.number().int().nonnegative(),
        predicted: z.number().int().nonnegative(),
        truePositive: z.number().int().nonnegative(),
        overSegmented: z.number().int().nonnegative(),
        underSegmented: z.number().int().nonnegative(),
        f1: fractionSchema,
      })
      .strict(),
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
    predictedPrimaryAccuracy: fractionSchema,
    top8OracleRecall: fractionSchema,
    resolvedPrecision: fractionSchema,
    resolvedCoverage: fractionSchema,
    boundaryF1: fractionSchema,
    expectedCalibrationError: fractionSchema,
    segmentDensity: z
      .object({
        predictedSegments: z.number().int().nonnegative(),
        measures: z.number().int().nonnegative(),
        segmentsPerMeasure: z.number().nonnegative(),
      })
      .strict(),
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
        intervalOverlap: intervalOverlapDiagnosticsSchema,
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
        calibrationBins: z
          .array(
            z
              .object({
                index: z.number().int().min(0).max(99),
                cases: z.number().int().nonnegative(),
                weight: z.number().nonnegative(),
                averageConfidence: fractionSchema,
                accuracy: fractionSchema,
              })
              .strict(),
          )
          .length(100),
        precisionCoverageCurve: z.array(
          z.object({ threshold: fractionSchema, precision: fractionSchema, coverage: fractionSchema }).strict(),
        ),
      })
      .strict(),
  })
  .strict();

export const harmonyDatasetEvalReportSchema = z
  .object({
    schemaVersion: z.literal("2.7.0"),
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
            reportSplit: z.enum(["train", "tune", "eval"]),
            decisionThreshold: fractionSchema,
            boundaryPolicy: z.enum([
              "dense-note-events",
              "metric-beats",
              "metric-half-beats",
              "metric-strong-onsets",
              "learned-evidence",
            ]),
            boundaryModel: z
              .object({ featureVersion: z.literal("boundary-evidence-v1"), threshold: fractionSchema })
              .strict()
              .optional(),
            sourceRevision: z.string().min(1),
            reportGroupsSha256: z.string().regex(/^[a-f0-9]{64}$/),
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
    predictedPrimaryAccuracy: fractionSchema.optional(),
    top8OracleRecall: fractionSchema,
    resolvedPrecision: fractionSchema,
    resolvedCoverage: fractionSchema,
    boundaryF1: fractionSchema,
    expectedCalibrationError: fractionSchema,
    segmentDensity: z
      .object({
        predictedSegments: z.number().int().nonnegative(),
        measures: z.number().int().nonnegative(),
        segmentsPerMeasure: z.number().nonnegative(),
      })
      .strict()
      .optional(),
    boundaryPolicy: z
      .enum(["dense-note-events", "metric-beats", "metric-half-beats", "metric-strong-onsets", "learned-evidence"])
      .optional(),
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
