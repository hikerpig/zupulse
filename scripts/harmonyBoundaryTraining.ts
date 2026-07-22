import {
  harmonyBoundaryClassifierModelSchema,
  scoreHarmonyBoundary,
  type HarmonyBoundaryClassifierModel,
} from "../packages/web-core/src";
import type { HarmonyBoundaryRecordsReport } from "../tools/harmony-cli/src/schemas";

type BoundaryMetrics = {
  records: number;
  positives: number;
  precision: number;
  recall: number;
  f1: number;
  retainedRate: number;
};

export function trainHarmonyBoundaryClassifier(
  reports: readonly HarmonyBoundaryRecordsReport[],
): HarmonyBoundaryClassifierModel {
  if (reports.some((report) => report.split !== "train"))
    throw new Error("boundary classifier training requires train reports");
  const records = reports.flatMap((report) => report.records).sort((a, b) => a.id.localeCompare(b.id));
  const positives = records.filter((record) => record.target === 1).length;
  const negatives = records.length - positives;
  if (positives === 0 || negatives === 0) throw new Error("boundary classifier training requires both classes");
  const weights = Array.from({ length: 5 }, () => 0);
  let bias = 0;
  for (let epoch = 0; epoch < 4000; epoch += 1) {
    const gradient = Array.from({ length: 5 }, () => 0);
    let biasGradient = 0;
    for (const record of records) {
      const classWeight = record.target === 1 ? 0.5 / positives : 0.5 / negatives;
      const logit = bias + weights.reduce((sum, weight, index) => sum + weight * record.features[index]!, 0);
      const error = (1 / (1 + Math.exp(-logit)) - record.target) * classWeight;
      biasGradient += error;
      for (let index = 0; index < weights.length; index += 1)
        gradient[index] = gradient[index]! + error * record.features[index]!;
    }
    const learningRate = 0.2 / (1 + epoch / 1000);
    bias -= learningRate * biasGradient;
    for (let index = 0; index < weights.length; index += 1)
      weights[index] = weights[index]! - learningRate * (gradient[index]! + 0.001 * weights[index]!);
  }
  return harmonyBoundaryClassifierModelSchema.parse({
    schemaVersion: "1.0.0",
    featureVersion: "boundary-evidence-v1",
    weights: weights.map(roundScore),
    bias: roundScore(bias),
    threshold: 0.5,
  });
}

export function selectHarmonyBoundaryThreshold(
  model: HarmonyBoundaryClassifierModel,
  reports: readonly HarmonyBoundaryRecordsReport[],
): HarmonyBoundaryClassifierModel {
  if (reports.some((report) => report.split !== "tune"))
    throw new Error("boundary threshold selection requires tune reports");
  const candidates = Array.from({ length: 101 }, (_, index) => index / 100)
    .map((threshold) => ({
      threshold,
      metrics: evaluateHarmonyBoundaryClassifier({ ...model, threshold }, reports),
    }))
    .filter(({ metrics }) => metrics.recall >= 0.99)
    .sort(
      (a, b) =>
        a.metrics.retainedRate - b.metrics.retainedRate || b.metrics.f1 - a.metrics.f1 || b.threshold - a.threshold,
    );
  const selected = candidates[0];
  if (!selected) throw new Error("no boundary threshold preserves required recall");
  return harmonyBoundaryClassifierModelSchema.parse({ ...model, threshold: roundScore(selected.threshold) });
}

export function evaluateHarmonyBoundaryClassifier(
  model: HarmonyBoundaryClassifierModel,
  reports: readonly HarmonyBoundaryRecordsReport[],
): BoundaryMetrics {
  const records = reports.flatMap((report) => report.records);
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  for (const record of records) {
    const predicted = scoreHarmonyBoundary(model, record.features) >= model.threshold;
    if (predicted && record.target === 1) truePositive += 1;
    else if (predicted) falsePositive += 1;
    else if (record.target === 1) falseNegative += 1;
  }
  const precision = divide(truePositive, truePositive + falsePositive);
  const recall = divide(truePositive, truePositive + falseNegative);
  return {
    records: records.length,
    positives: truePositive + falseNegative,
    precision,
    recall,
    f1: divide(2 * precision * recall, precision + recall),
    retainedRate: divide(truePositive + falsePositive, records.length),
  };
}

function divide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function roundScore(value: number): number {
  return Number(value.toFixed(2));
}
