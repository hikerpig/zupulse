import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { engineComparisonReportSchema, engineDraftComparisonSchema } from "../benchmark/engine-comparison";
import { evaluateRepairCandidates } from "../benchmark/repair-candidate-evaluation";
import { aggregateSymbolicMetrics, type SymbolicMetrics } from "../benchmark/symbolic-metrics";
import { sha256Bytes } from "../canonical-json";
import { PdfOmrError } from "../errors";
import { omrScoreDraftSchema, pdfOmrEvaluateRepairCandidatesReportSchema, sha256Schema } from "../schemas";
import { writeCanonicalNew } from "./draft-io";

const metricSummarySchema = z
  .object({
    pitchF1: z.number().min(0).max(1),
    onsetF1: z.number().min(0).max(1),
    durationF1: z.number().min(0).max(1),
    jointF1: z.number().min(0).max(1),
    validMeasureRate: z.number().min(0).max(1),
  })
  .strict();

const metricDeltaSchema = z
  .object({
    pitchF1: z.number().min(-1).max(1),
    onsetF1: z.number().min(-1).max(1),
    durationF1: z.number().min(-1).max(1),
    jointF1: z.number().min(-1).max(1),
    validMeasureRate: z.number().min(-1).max(1),
  })
  .strict();

const assessmentSchema = z.enum(["improved", "regressed", "mixed", "unchanged"]);

export const repairCandidateEvaluationReportSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    command: z.literal("evaluate-repair-candidates"),
    identity: z
      .object({
        corpusId: z.string().min(1),
        protocolVersion: z.string().min(1),
        manifestSha256: sha256Schema,
        mode: z.literal("development"),
      })
      .strict(),
    comparisonSha256: sha256Schema,
    primaryReportSha256: sha256Schema,
    items: z
      .object({
        total: z.number().int().nonnegative(),
        appliedCandidates: z.number().int().nonnegative(),
        improved: z.number().int().nonnegative(),
        regressed: z.number().int().nonnegative(),
        mixed: z.number().int().nonnegative(),
        unchanged: z.number().int().nonnegative(),
      })
      .strict(),
    overall: z
      .object({
        before: metricSummarySchema,
        after: metricSummarySchema,
        delta: metricDeltaSchema,
        assessment: assessmentSchema,
        nonRegressive: z.boolean(),
      })
      .strict(),
    evaluations: z.array(
      z
        .object({
          itemId: z.string().min(1),
          appliedCandidates: z.number().int().nonnegative(),
          before: metricSummarySchema,
          after: metricSummarySchema,
          delta: metricDeltaSchema,
          assessment: assessmentSchema,
          nonRegressive: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();

export async function evaluateRepairCandidatesCommand(input: {
  comparisonDirectory: string;
  primaryDirectory: string;
  output: string;
  cwd?: string;
}): Promise<{
  schemaVersion: "1.0.0";
  command: "evaluate-repair-candidates";
  status: "succeeded";
  outputSha256: string;
}> {
  const cwd = input.cwd ?? process.cwd();
  const comparisonDirectory = resolve(cwd, input.comparisonDirectory);
  const primaryDirectory = resolve(cwd, input.primaryDirectory);
  const [comparisonBytes, primaryReportBytes] = await Promise.all([
    readRequired(join(comparisonDirectory, "comparison.json"), "comparison-report-unreadable"),
    readRequired(join(primaryDirectory, "report.json"), "primary-report-unreadable"),
  ]);
  const comparison = parseComparison(comparisonBytes);
  const primaryReportSha256 = sha256Bytes(primaryReportBytes);
  if (primaryReportSha256 !== comparison.primary.reportSha256) throw incompatibleEvaluation();
  const evaluations = await Promise.all(
    comparison.comparisons.map(async ({ itemId, ...draftComparison }) => {
      const [primary, expected] = await Promise.all([
        readDraft(join(primaryDirectory, "items", itemId, "predicted-draft.json"), "predicted-draft-invalid"),
        readDraft(join(primaryDirectory, "items", itemId, "ground-truth-draft.json"), "ground-truth-draft-invalid"),
      ]);
      const result = evaluateRepairCandidates(primary, expected, engineDraftComparisonSchema.parse(draftComparison));
      const before = summarize(result.before);
      const after = summarize(result.after);
      return {
        itemId,
        appliedCandidates: result.appliedCandidateCount,
        before,
        after,
        ...assess(before, after),
        beforeMetrics: result.before,
        afterMetrics: result.after,
      };
    }),
  );
  const before = summarize(aggregateSymbolicMetrics(evaluations.map((evaluation) => evaluation.beforeMetrics)));
  const after = summarize(aggregateSymbolicMetrics(evaluations.map((evaluation) => evaluation.afterMetrics)));
  const overallAssessment = assess(before, after);
  const report = repairCandidateEvaluationReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "evaluate-repair-candidates",
    identity: comparison.identity,
    comparisonSha256: sha256Bytes(comparisonBytes),
    primaryReportSha256,
    items: {
      total: evaluations.length,
      appliedCandidates: evaluations.reduce((sum, evaluation) => sum + evaluation.appliedCandidates, 0),
      improved: evaluations.filter((evaluation) => evaluation.assessment === "improved").length,
      regressed: evaluations.filter((evaluation) => evaluation.assessment === "regressed").length,
      mixed: evaluations.filter((evaluation) => evaluation.assessment === "mixed").length,
      unchanged: evaluations.filter((evaluation) => evaluation.assessment === "unchanged").length,
    },
    overall: { before, after, ...overallAssessment },
    evaluations: evaluations.map(
      ({ beforeMetrics: _beforeMetrics, afterMetrics: _afterMetrics, ...evaluation }) => evaluation,
    ),
  });
  const outputSha256 = await writeCanonicalNew(join(input.output, "evaluation.json"), report, cwd);
  return pdfOmrEvaluateRepairCandidatesReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "evaluate-repair-candidates",
    status: "succeeded",
    outputSha256,
  });
}

type MetricSummary = z.infer<typeof metricSummarySchema>;

function summarize(metrics: SymbolicMetrics): MetricSummary {
  return {
    pitchF1: metrics.pitch.f1,
    onsetF1: metrics.onset.f1,
    durationF1: metrics.duration.f1,
    jointF1: metrics.joint.f1,
    validMeasureRate: metrics.validMeasure.rate,
  };
}

function delta(before: MetricSummary, after: MetricSummary): z.infer<typeof metricDeltaSchema> {
  return {
    pitchF1: after.pitchF1 - before.pitchF1,
    onsetF1: after.onsetF1 - before.onsetF1,
    durationF1: after.durationF1 - before.durationF1,
    jointF1: after.jointF1 - before.jointF1,
    validMeasureRate: after.validMeasureRate - before.validMeasureRate,
  };
}

function assess(
  before: MetricSummary,
  after: MetricSummary,
): { delta: z.infer<typeof metricDeltaSchema>; assessment: z.infer<typeof assessmentSchema>; nonRegressive: boolean } {
  const changes = delta(before, after);
  const values = Object.values(changes);
  const positive = values.some((value) => value > 1e-12);
  const negative = values.some((value) => value < -1e-12);
  return {
    delta: changes,
    assessment: positive && negative ? "mixed" : positive ? "improved" : negative ? "regressed" : "unchanged",
    nonRegressive: !negative,
  };
}

async function readRequired(path: string, reason: string): Promise<Uint8Array> {
  return readFile(path).catch((error: unknown) => {
    throw new PdfOmrError("INVALID_INPUT", "repair candidate evaluation input cannot be read", {
      context: { reason },
      cause: error,
    });
  });
}

function parseComparison(bytes: Uint8Array) {
  try {
    return engineComparisonReportSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "repair candidate comparison report is invalid", {
      context: { reason: "comparison-report-invalid" },
      cause: error,
    });
  }
}

async function readDraft(path: string, reason: string) {
  const bytes = await readRequired(path, reason);
  try {
    return omrScoreDraftSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "repair candidate evaluation Draft is invalid", {
      context: { reason },
      cause: error,
    });
  }
}

function incompatibleEvaluation(): PdfOmrError {
  return new PdfOmrError("BENCHMARK_EVALUATION_LIMITATION", "repair candidate evaluation inputs are incompatible", {
    context: { reason: "repair-candidate-evaluation-input-mismatch" },
  });
}
