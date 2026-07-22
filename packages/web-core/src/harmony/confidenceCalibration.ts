export type HarmonyCalibrationModel = {
  schemaVersion: "1.0.0";
  featureVersion: string;
  steps: readonly { upperBound: number; probability: number }[];
};

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
