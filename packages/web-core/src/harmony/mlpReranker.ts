import { z } from "zod";
import {
  createLinearHarmonyFeatures,
  LINEAR_HARMONY_FEATURE_LENGTH,
  type LinearHarmonyCandidateInput,
} from "./linearReranker";

const twoDecimalWeightSchema = z
  .number()
  .finite()
  .refine((value) => Number(value.toFixed(2)) === value, "weights must have at most two decimals");

export const mlpHarmonyRerankerModelSchema = z
  .object({
    version: z.literal(1),
    featureVersion: z.literal("candidate-linear-v2"),
    algorithmVersion: z.literal("mlp-relu-v1"),
    trainingSourcesSha256: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1),
    trainingGroupsSha256: z.string().regex(/^[a-f0-9]{64}$/),
    hiddenSize: z.number().int().min(1).max(32),
    hiddenWeights: z.array(twoDecimalWeightSchema),
    hiddenBias: z.array(twoDecimalWeightSchema),
    outputWeights: z.array(twoDecimalWeightSchema),
    outputBias: twoDecimalWeightSchema,
  })
  .strict()
  .superRefine((model, context) => {
    const lengths = [
      ["hiddenWeights", model.hiddenWeights.length, model.hiddenSize * LINEAR_HARMONY_FEATURE_LENGTH],
      ["hiddenBias", model.hiddenBias.length, model.hiddenSize],
      ["outputWeights", model.outputWeights.length, model.hiddenSize],
    ] as const;
    for (const [field, actual, expected] of lengths)
      if (actual !== expected)
        context.addIssue({ code: "custom", path: [field], message: `${field} length must be ${expected}` });
  });

export type MlpHarmonyRerankerModel = z.infer<typeof mlpHarmonyRerankerModelSchema>;

export function rankHarmonyCandidatesMlp(
  modelInput: MlpHarmonyRerankerModel,
  candidates: readonly LinearHarmonyCandidateInput[],
  rulePrimaryIndex = -1,
): Array<{ index: number; logit: number }> {
  const model = mlpHarmonyRerankerModelSchema.parse(modelInput);
  return candidates
    .map((_, index) => ({
      index,
      logit: scoreMlp(model, createLinearHarmonyFeatures(candidates, index, rulePrimaryIndex)),
    }))
    .sort((a, b) => b.logit - a.logit || a.index - b.index)
    .map(({ index, logit }) => ({ index, logit: Number(logit.toFixed(2)) }));
}

function scoreMlp(model: MlpHarmonyRerankerModel, features: readonly number[]): number {
  let output = model.outputBias;
  for (let hiddenIndex = 0; hiddenIndex < model.hiddenSize; hiddenIndex += 1) {
    let hidden = model.hiddenBias[hiddenIndex]!;
    const row = hiddenIndex * LINEAR_HARMONY_FEATURE_LENGTH;
    for (let featureIndex = 0; featureIndex < features.length; featureIndex += 1)
      hidden += model.hiddenWeights[row + featureIndex]! * features[featureIndex]!;
    output += Math.max(0, hidden) * model.outputWeights[hiddenIndex]!;
  }
  return output;
}
