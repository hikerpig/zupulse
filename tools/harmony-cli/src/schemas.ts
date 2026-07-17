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
