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
