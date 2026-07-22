import { createHash } from "node:crypto";
import {
  applyHarmonyCalibration,
  createMlpHarmonyPrimarySelector,
  mlpHarmonyCalibrationAssetSchema,
  mlpHarmonyRerankerModelSchema,
  type MlpHarmonyCalibrationAsset,
  type MlpHarmonyRerankerModel,
} from "../packages/web-core/src";
import { fitWeightedIsotonicCalibration } from "../tools/harmony-cli/src/confidenceCalibration";
import { harmonyRankingRecordsReportSchema, type HarmonyRankingRecordsReport } from "../tools/harmony-cli/src/schemas";

type RankingRecord = HarmonyRankingRecordsReport["records"][number];
type Observation = { corpus: string; groupId: string; weight: number; rawConfidence: number; correct: boolean };
type CalibrationMetrics = {
  records: number;
  weight: number;
  top1: number;
  rawEce: number;
  calibratedEce: number;
  curve: Array<{ threshold: number; precision: number; coverage: number }>;
};

export type MlpHarmonyCalibrationEvaluation = {
  aggregate: CalibrationMetrics;
  corpora: Record<string, CalibrationMetrics>;
};

export function fitMlpHarmonyCalibration(
  modelInput: MlpHarmonyRerankerModel,
  reportInputs: readonly HarmonyRankingRecordsReport[],
): MlpHarmonyCalibrationAsset {
  const model = mlpHarmonyRerankerModelSchema.parse(modelInput);
  const reports = parseReports(reportInputs, "train", "calibration requires train reports");
  const observations = createObservations(model, reports);
  const balanced = balanceObservations(observations);
  const bins = Array.from({ length: 100 }, (_, index) => ({
    upperBound: (index + 1) / 100,
    correctWeight: 0,
    weight: 0,
  }));
  for (const observation of balanced) {
    const bin = bins[Math.min(99, Math.floor(observation.rawConfidence * 100))]!;
    bin.weight += observation.balancedWeight;
    if (observation.correct) bin.correctWeight += observation.balancedWeight;
  }
  return mlpHarmonyCalibrationAssetSchema.parse({
    schemaVersion: "1.0.0",
    featureVersion: "mlp-softmax-top-v1",
    algorithmVersion: "weighted-pava-v2",
    modelSha256: hashJson(model),
    trainingSourcesSha256: sourceHashes(reports),
    trainingGroupsSha256: hashLines(reports.map((report) => report.groupsSha256).sort()),
    steps: fitWeightedIsotonicCalibration(bins).map((step) => ({
      upperBound: Number(step.upperBound.toFixed(2)),
      probability: Number(step.probability.toFixed(2)),
    })),
  });
}

export function evaluateMlpHarmonyCalibration(
  modelInput: MlpHarmonyRerankerModel,
  assetInput: MlpHarmonyCalibrationAsset,
  reportInputs: readonly HarmonyRankingRecordsReport[],
): MlpHarmonyCalibrationEvaluation {
  const model = mlpHarmonyRerankerModelSchema.parse(modelInput);
  const asset = mlpHarmonyCalibrationAssetSchema.parse(assetInput);
  if (asset.modelSha256 !== hashJson(model)) throw new Error("calibration asset model hash mismatch");
  const reports = parseReports(reportInputs, "tune", "calibration evaluation requires tune reports");
  const observations = createObservations(model, reports);
  const corpusNames = [...new Set(observations.map((observation) => observation.corpus))].sort();
  return {
    aggregate: metrics(observations, asset),
    corpora: Object.fromEntries(
      corpusNames.map((corpus) => [
        corpus,
        metrics(
          observations.filter((observation) => observation.corpus === corpus),
          asset,
        ),
      ]),
    ),
  };
}

export function selectMlpHarmonyDecisionThreshold(
  evaluation: MlpHarmonyCalibrationEvaluation,
  precisionFloor: number,
): number | undefined {
  return evaluation.aggregate.curve
    .filter((point) => point.precision >= precisionFloor && point.coverage > 0)
    .sort((a, b) => b.coverage - a.coverage || a.threshold - b.threshold)[0]?.threshold;
}

function parseReports(
  inputs: readonly HarmonyRankingRecordsReport[],
  split: "train" | "tune",
  error: string,
): HarmonyRankingRecordsReport[] {
  const reports = inputs.map((report) => harmonyRankingRecordsReportSchema.parse(report));
  if (reports.length === 0) throw new Error("calibration reports are empty");
  if (reports.some((report) => report.split !== split)) throw new Error(error);
  return reports;
}

function createObservations(
  model: MlpHarmonyRerankerModel,
  reports: readonly HarmonyRankingRecordsReport[],
): Observation[] {
  const select = createMlpHarmonyPrimarySelector(model);
  return reports.flatMap((report) =>
    report.records.map((record) => {
      const selected = select(record.candidates, record.primaryIndex)!;
      return {
        corpus: record.corpus,
        groupId: record.groupId,
        weight: record.weight,
        rawConfidence: selected.rawConfidence,
        correct: record.outcome === "oracle-hit" && selected.index === record.targetIndex,
      };
    }),
  );
}

function balanceObservations(observations: readonly Observation[]) {
  const groupWeights = new Map<string, number>();
  const corpusGroups = new Map<string, Set<string>>();
  for (const observation of observations) {
    const key = `${observation.corpus}:${observation.groupId}`;
    groupWeights.set(key, (groupWeights.get(key) ?? 0) + observation.weight);
    const groups = corpusGroups.get(observation.corpus) ?? new Set<string>();
    groups.add(observation.groupId);
    corpusGroups.set(observation.corpus, groups);
  }
  return observations.map((observation) => ({
    ...observation,
    balancedWeight:
      observation.weight /
      groupWeights.get(`${observation.corpus}:${observation.groupId}`)! /
      corpusGroups.get(observation.corpus)!.size /
      corpusGroups.size,
  }));
}

function metrics(observations: readonly Observation[], asset: MlpHarmonyCalibrationAsset): CalibrationMetrics {
  const weight = observations.reduce((sum, observation) => sum + observation.weight, 0);
  const correctWeight = observations.reduce(
    (sum, observation) => sum + (observation.correct ? observation.weight : 0),
    0,
  );
  return {
    records: observations.length,
    weight,
    top1: roundMetric(weight === 0 ? 0 : correctWeight / weight),
    rawEce: ece(observations, (observation) => observation.rawConfidence),
    calibratedEce: ece(observations, (observation) => applyHarmonyCalibration(observation.rawConfidence, asset)),
    curve: Array.from({ length: 101 }, (_, index) => {
      const threshold = index / 100;
      const resolved = observations.filter(
        (observation) => applyHarmonyCalibration(observation.rawConfidence, asset) >= threshold,
      );
      const resolvedWeight = resolved.reduce((sum, observation) => sum + observation.weight, 0);
      const resolvedCorrect = resolved.reduce(
        (sum, observation) => sum + (observation.correct ? observation.weight : 0),
        0,
      );
      return {
        threshold,
        precision: roundMetric(resolvedWeight === 0 ? 0 : resolvedCorrect / resolvedWeight),
        coverage: roundMetric(weight === 0 ? 0 : resolvedWeight / weight),
      };
    }),
  };
}

function ece(observations: readonly Observation[], confidence: (observation: Observation) => number): number {
  const bins = Array.from({ length: 10 }, () => ({ weight: 0, correct: 0, confidence: 0 }));
  for (const observation of observations) {
    const value = confidence(observation);
    const bin = bins[Math.min(9, Math.floor(value * 10))]!;
    bin.weight += observation.weight;
    bin.correct += observation.correct ? observation.weight : 0;
    bin.confidence += value * observation.weight;
  }
  const total = bins.reduce((sum, bin) => sum + bin.weight, 0);
  return roundMetric(
    total === 0
      ? 0
      : bins.reduce(
          (sum, bin) =>
            sum +
            (bin.weight === 0 ? 0 : Math.abs(bin.correct / bin.weight - bin.confidence / bin.weight) * bin.weight),
          0,
        ) / total,
  );
}

function sourceHashes(reports: readonly HarmonyRankingRecordsReport[]): string[] {
  return [
    ...new Set(
      reports.flatMap((report) =>
        report.sources.map((source) => hashLines([source.caseId, source.revision, source.groupsSha256])),
      ),
    ),
  ].sort();
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hashLines(lines: readonly string[]): string {
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

function roundMetric(value: number): number {
  return Number(value.toFixed(4));
}
