import { z } from "zod";

export type HarmonyCalibrationModel = {
  schemaVersion: "1.0.0";
  featureVersion: string;
  steps: readonly { upperBound: number; probability: number }[];
};

const twoDecimalCalibrationScoreSchema = z
  .number()
  .min(0)
  .max(1)
  .refine((value) => Number(value.toFixed(2)) === value, "calibration scores must have at most two decimals");

export const mlpHarmonyCalibrationAssetSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    featureVersion: z.literal("mlp-softmax-top-v1"),
    algorithmVersion: z.literal("weighted-pava-v2"),
    modelSha256: z.string().regex(/^[a-f0-9]{64}$/),
    trainingSourcesSha256: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1),
    trainingGroupsSha256: z.string().regex(/^[a-f0-9]{64}$/),
    steps: z
      .array(
        z
          .object({ upperBound: twoDecimalCalibrationScoreSchema, probability: twoDecimalCalibrationScoreSchema })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((asset, context) => {
    for (let index = 1; index < asset.steps.length; index += 1) {
      if (asset.steps[index]!.upperBound < asset.steps[index - 1]!.upperBound)
        context.addIssue({ code: "custom", path: ["steps", index], message: "calibration bounds must be monotonic" });
      if (asset.steps[index]!.probability < asset.steps[index - 1]!.probability)
        context.addIssue({
          code: "custom",
          path: ["steps", index],
          message: "calibration probabilities must be monotonic",
        });
    }
  });

export type MlpHarmonyCalibrationAsset = z.infer<typeof mlpHarmonyCalibrationAssetSchema>;

export function applyHarmonyCalibration(rawConfidence: number, model: HarmonyCalibrationModel): number {
  let previousBound = 0;
  let previousProbability = 0;
  for (const step of model.steps) {
    if (step.upperBound < previousBound) throw new Error("calibration bounds must be monotonic");
    if (step.probability < previousProbability) throw new Error("calibration probabilities must be monotonic");
    previousBound = step.upperBound;
    previousProbability = step.probability;
  }
  const confidence = Math.max(0, Math.min(1, rawConfidence));
  return model.steps.find((step) => confidence <= step.upperBound)?.probability ?? model.steps.at(-1)?.probability ?? 0;
}
