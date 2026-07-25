import { z } from "zod";
import {
  STRUCTURED_FEATURE_VERSION,
  STRUCTURED_SEGMENT_FEATURE_LENGTH,
  STRUCTURED_TRANSITION_FEATURE_LENGTH,
} from "./structuredFeatures";

export { STRUCTURED_SEGMENT_FEATURE_LENGTH, STRUCTURED_TRANSITION_FEATURE_LENGTH };

const twoDecimalNumberSchema = z
  .number()
  .finite()
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, "expected at most two decimals");

export const harmonyStructuredLinearModelSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    featureVersion: z.literal(STRUCTURED_FEATURE_VERSION),
    algorithmVersion: z.literal("averaged-structured-perceptron-v1"),
    trainingRecordsSha256: z.string().regex(/^[a-f0-9]{64}$/),
    trainingGroupsSha256: z.string().regex(/^[a-f0-9]{64}$/),
    epochs: z.number().int().nonnegative(),
    learningRate: twoDecimalNumberSchema.nonnegative(),
    ruleScale: twoDecimalNumberSchema.nonnegative(),
    modelScale: twoDecimalNumberSchema.nonnegative(),
    segmentWeights: z.array(twoDecimalNumberSchema).length(STRUCTURED_SEGMENT_FEATURE_LENGTH),
    transitionWeights: z.array(twoDecimalNumberSchema).length(STRUCTURED_TRANSITION_FEATURE_LENGTH),
  })
  .strict();

export type HarmonyStructuredLinearModel = z.infer<typeof harmonyStructuredLinearModelSchema>;

export function createZeroHarmonyStructuredLinearModel(input: {
  trainingRecordsSha256: string;
  trainingGroupsSha256: string;
}): HarmonyStructuredLinearModel {
  return harmonyStructuredLinearModelSchema.parse({
    schemaVersion: "1.0.0",
    featureVersion: STRUCTURED_FEATURE_VERSION,
    algorithmVersion: "averaged-structured-perceptron-v1",
    trainingRecordsSha256: input.trainingRecordsSha256,
    trainingGroupsSha256: input.trainingGroupsSha256,
    epochs: 0,
    learningRate: 0,
    ruleScale: 1,
    modelScale: 1,
    segmentWeights: Array(STRUCTURED_SEGMENT_FEATURE_LENGTH).fill(0),
    transitionWeights: Array(STRUCTURED_TRANSITION_FEATURE_LENGTH).fill(0),
  });
}

export function scoreStructuredSegment(model: HarmonyStructuredLinearModel, features: readonly number[]): number {
  return dot(model.segmentWeights, features, STRUCTURED_SEGMENT_FEATURE_LENGTH);
}

export function scoreStructuredTransition(model: HarmonyStructuredLinearModel, features: readonly number[]): number {
  return dot(model.transitionWeights, features, STRUCTURED_TRANSITION_FEATURE_LENGTH);
}

function dot(weights: readonly number[], features: readonly number[], expectedLength: number): number {
  if (weights.length !== expectedLength || features.length !== expectedLength)
    throw new Error(`structured feature length mismatch: expected ${expectedLength}`);
  return weights.reduce((total, weight, index) => total + weight * features[index]!, 0);
}
