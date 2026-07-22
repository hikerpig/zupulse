export type CalibrationBin = {
  upperBound: number;
  correctWeight: number;
  weight: number;
};

export type IsotonicCalibrationStep = {
  upperBound: number;
  probability: number;
};

type CalibrationReportCase = {
  id: string;
  kind: "accuracy-corpus";
  reportSplit: "train" | "tune" | "eval";
  decisionThreshold: number;
  sourceRevision: string;
  reportGroupsSha256: string;
  metrics: {
    diagnostics: {
      confidenceBins: readonly {
        index: number;
        weight: number;
        accuracy: number;
      }[];
      calibrationBins?: readonly {
        index: number;
        weight: number;
        accuracy: number;
      }[];
    };
  };
};

export type HarmonyCalibrationAsset = {
  schemaVersion: "1.0.0";
  algorithmVersion: "weighted-pava-v1";
  featureVersion: "primary-local-margin-v1";
  source: {
    caseId: string;
    corpusRevision: string;
    trainingGroupsSha256: string;
    trainingReportSha256: string;
  };
  steps: IsotonicCalibrationStep[];
};

export function buildHarmonyCalibrationAsset(
  reportCase: CalibrationReportCase,
  reportSha256: string,
): HarmonyCalibrationAsset {
  if (reportCase.reportSplit !== "train") throw new Error("calibration requires a train report");
  if (reportCase.decisionThreshold !== 0) throw new Error("calibration requires decisionThreshold 0");
  return {
    schemaVersion: "1.0.0",
    algorithmVersion: "weighted-pava-v1",
    featureVersion: "primary-local-margin-v1",
    source: {
      caseId: reportCase.id,
      corpusRevision: reportCase.sourceRevision,
      trainingGroupsSha256: reportCase.reportGroupsSha256,
      trainingReportSha256: reportSha256,
    },
    steps: fitWeightedIsotonicCalibration(
      (reportCase.metrics.diagnostics.calibrationBins ?? reportCase.metrics.diagnostics.confidenceBins).map((bin) => ({
        upperBound: (bin.index + 1) / (reportCase.metrics.diagnostics.calibrationBins === undefined ? 10 : 100),
        correctWeight: bin.accuracy * bin.weight,
        weight: bin.weight,
      })),
    ),
  };
}

export async function buildHarmonyCalibrationAssetFile(
  reportPath: string,
  caseId?: string,
): Promise<HarmonyCalibrationAsset> {
  const bytes = await readFile(reportPath);
  const report = harmonyDatasetEvalReportSchema.parse(JSON.parse(bytes.toString("utf8")));
  const reportCase = report.cases.find(
    (candidate) => candidate.kind === "accuracy-corpus" && (caseId === undefined || candidate.id === caseId),
  );
  if (!reportCase || reportCase.kind !== "accuracy-corpus")
    throw new Error(`accuracy report case not found: ${caseId ?? "*"}`);
  return buildHarmonyCalibrationAsset(reportCase, createHash("sha256").update(bytes).digest("hex"));
}

export async function selectDecisionThresholdFile(
  reportPath: string,
  precisionFloor: number,
  caseId?: string,
): Promise<{ caseId: string; precisionFloor: number; threshold?: number }> {
  const report = harmonyDatasetEvalReportSchema.parse(JSON.parse(await readFile(reportPath, "utf8")));
  const reportCase = report.cases.find(
    (candidate) => candidate.kind === "accuracy-corpus" && (caseId === undefined || candidate.id === caseId),
  );
  if (!reportCase || reportCase.kind !== "accuracy-corpus")
    throw new Error(`accuracy report case not found: ${caseId ?? "*"}`);
  if (reportCase.reportSplit !== "tune") throw new Error("threshold selection requires a tune report");
  if (reportCase.decisionThreshold !== 0) throw new Error("threshold selection requires decisionThreshold 0");
  const threshold = selectDecisionThreshold(reportCase.metrics.diagnostics.precisionCoverageCurve, precisionFloor);
  return {
    caseId: reportCase.id,
    precisionFloor,
    ...(threshold === undefined ? {} : { threshold }),
  };
}

export function fitWeightedIsotonicCalibration(bins: readonly CalibrationBin[]): IsotonicCalibrationStep[] {
  const blocks: Array<CalibrationBin & { probability: number }> = [];
  for (const bin of bins) {
    if (bin.weight === 0 && blocks.length > 0) {
      blocks[blocks.length - 1]!.upperBound = bin.upperBound;
      continue;
    }
    const block = { ...bin, probability: bin.weight === 0 ? 0 : bin.correctWeight / bin.weight };
    blocks.push(block);
    while (blocks.length > 1 && blocks.at(-2)!.probability > blocks.at(-1)!.probability) {
      const right = blocks.pop()!;
      const left = blocks.pop()!;
      const weight = left.weight + right.weight;
      blocks.push({
        upperBound: right.upperBound,
        correctWeight: left.correctWeight + right.correctWeight,
        weight,
        probability: weight === 0 ? 0 : (left.correctWeight + right.correctWeight) / weight,
      });
    }
  }
  return blocks.map(({ upperBound, probability }) => ({
    upperBound: roundScore(upperBound),
    probability: roundScore(probability),
  }));
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

export function selectDecisionThreshold(
  points: readonly { threshold: number; precision: number; coverage: number }[],
  precisionFloor: number,
): number | undefined {
  return points
    .filter((point) => point.precision >= precisionFloor)
    .sort((a, b) => b.coverage - a.coverage || a.threshold - b.threshold)[0]?.threshold;
}
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { harmonyDatasetEvalReportSchema } from "./schemas";
