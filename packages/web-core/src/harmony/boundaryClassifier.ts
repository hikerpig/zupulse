import { z } from "zod";
import { HARMONY_BOUNDARY_FEATURE_LENGTH, HARMONY_BOUNDARY_FEATURE_VERSION } from "./boundaryEvidence";

const twoDecimalScoreSchema = z
  .number()
  .finite()
  .refine((value) => Number(value.toFixed(2)) === value, "scores must have at most two decimals");

export const harmonyBoundaryClassifierModelSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    featureVersion: z.literal(HARMONY_BOUNDARY_FEATURE_VERSION),
    weights: z.array(twoDecimalScoreSchema).length(HARMONY_BOUNDARY_FEATURE_LENGTH),
    bias: twoDecimalScoreSchema,
    threshold: z.number().min(0).max(1),
  })
  .strict();

export type HarmonyBoundaryClassifierModel = z.infer<typeof harmonyBoundaryClassifierModelSchema>;

export function scoreHarmonyBoundary(modelInput: HarmonyBoundaryClassifierModel, features: readonly number[]): number {
  const model = harmonyBoundaryClassifierModelSchema.parse(modelInput);
  if (features.length !== HARMONY_BOUNDARY_FEATURE_LENGTH)
    throw new Error(`boundary classifier requires ${HARMONY_BOUNDARY_FEATURE_LENGTH} features`);
  const logit = model.bias + model.weights.reduce((sum, weight, index) => sum + weight * features[index]!, 0);
  return 1 / (1 + Math.exp(-logit));
}

export function acceptsHarmonyBoundary(model: HarmonyBoundaryClassifierModel, features: readonly number[]): boolean {
  return scoreHarmonyBoundary(model, features) >= model.threshold;
}
