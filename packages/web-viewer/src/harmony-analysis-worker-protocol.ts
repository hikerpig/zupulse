import { analyzeHarmony, harmonyAnalysisInputSchema, harmonySegmentSchema } from "@zupulse/web-core";
import { z } from "zod";

export const harmonyAnalysisWorkerRequestSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    type: z.literal("analyze"),
    input: harmonyAnalysisInputSchema,
    options: z
      .object({
        includedTrackIds: z.array(z.string().min(1)).min(1),
        topK: z.number().int().min(1).max(8),
        decisionThreshold: z.number().min(0).max(1),
      })
      .strict(),
  })
  .strict();

export const harmonyAnalysisWorkerResponseSchema = z.discriminatedUnion("type", [
  z
    .object({
      schemaVersion: z.literal("1.0.0"),
      type: z.literal("completed"),
      segments: z.array(harmonySegmentSchema),
    })
    .strict(),
  z
    .object({
      schemaVersion: z.literal("1.0.0"),
      type: z.literal("failed"),
      code: z.literal("analysis-failed"),
    })
    .strict(),
]);

export type HarmonyAnalysisWorkerRequest = z.infer<typeof harmonyAnalysisWorkerRequestSchema>;
export type HarmonyAnalysisWorkerResponse = z.infer<typeof harmonyAnalysisWorkerResponseSchema>;
export type HarmonyAnalysisWorkerOptions = HarmonyAnalysisWorkerRequest["options"];

export function executeHarmonyAnalysisWorkerRequest(
  value: unknown,
): Extract<HarmonyAnalysisWorkerResponse, { type: "completed" }> {
  const request = harmonyAnalysisWorkerRequestSchema.parse(value);
  return {
    schemaVersion: "1.0.0",
    type: "completed",
    segments: analyzeHarmony(request.input, request.options),
  };
}
