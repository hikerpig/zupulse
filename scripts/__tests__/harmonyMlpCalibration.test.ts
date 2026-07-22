import { describe, expect, it } from "vitest";
import { LINEAR_HARMONY_FEATURE_LENGTH, mlpHarmonyRerankerModelSchema } from "../../packages/web-core/src";
import {
  harmonyRankingRecordsReportSchema,
  type HarmonyRankingRecordsReport,
} from "../../tools/harmony-cli/src/schemas";
import {
  evaluateMlpHarmonyCalibration,
  fitMlpHarmonyCalibration,
  selectMlpHarmonyDecisionThreshold,
} from "../harmonyMlpCalibration";

const chord = { root: { step: "C" as const, alter: 0 as const }, kind: "major" as const, degrees: [] };
const model = mlpHarmonyRerankerModelSchema.parse({
  version: 1,
  featureVersion: "candidate-linear-v2",
  algorithmVersion: "mlp-relu-v1",
  trainingSourcesSha256: ["a".repeat(64)],
  trainingGroupsSha256: "b".repeat(64),
  hiddenSize: 1,
  hiddenWeights: [1, ...Array(LINEAR_HARMONY_FEATURE_LENGTH - 1).fill(0)],
  hiddenBias: [0],
  outputWeights: [1],
  outputBias: 0,
});

function report(split: "train" | "tune"): HarmonyRankingRecordsReport {
  return harmonyRankingRecordsReportSchema.parse({
    schemaVersion: "1.1.0",
    command: "ranking-records",
    split,
    featureVersion: "relative-pc-presence-v1",
    groupsSha256: split === "train" ? "c".repeat(64) : "d".repeat(64),
    sources: [{ caseId: "fixture", revision: "v1", groupsSha256: "e".repeat(64) }],
    records: [
      {
        id: `${split}:correct`,
        corpus: "fixture",
        groupId: `group-${split}`,
        range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 480 } },
        weight: 480,
        outcome: "oracle-hit",
        primaryIndex: 0,
        targetIndex: 1,
        candidates: [
          { chord, features: Array(37).fill(0), ruleLocalScore: 2, ruleSequenceScore: 2 },
          { chord, features: [1, ...Array(36).fill(0)], ruleLocalScore: 1, ruleSequenceScore: 1 },
        ],
      },
      {
        id: `${split}:miss`,
        corpus: "fixture",
        groupId: `group-${split}`,
        range: { start: { measureIndex: 0, offsetTicks: 480 }, end: { measureIndex: 0, offsetTicks: 960 } },
        weight: 120,
        outcome: "oracle-miss",
        primaryIndex: 0,
        candidates: [{ chord, features: Array(37).fill(0), ruleLocalScore: 1, ruleSequenceScore: 1 }],
      },
    ],
  });
}

describe("MLP harmony confidence calibration", () => {
  it("fits deterministic train-only PAVA and evaluates tune ECE", () => {
    const first = fitMlpHarmonyCalibration(model, [report("train")]);
    const second = fitMlpHarmonyCalibration(model, [report("train")]);

    expect(first).toEqual(second);
    expect(first.steps.every((step) => Number(step.probability.toFixed(2)) === step.probability)).toBe(true);
    const evaluation = evaluateMlpHarmonyCalibration(model, first, [report("tune")]);
    expect(evaluation.aggregate.records).toBe(2);
    expect(evaluation.aggregate.calibratedEce).toBeLessThanOrEqual(evaluation.aggregate.rawEce);
    expect(selectMlpHarmonyDecisionThreshold(evaluation, 0.7)).toBeDefined();
  });

  it("keeps train and tune roles isolated", () => {
    expect(() => fitMlpHarmonyCalibration(model, [report("tune")])).toThrow("calibration requires train reports");
    const asset = fitMlpHarmonyCalibration(model, [report("train")]);
    expect(() => evaluateMlpHarmonyCalibration(model, asset, [report("train")])).toThrow(
      "calibration evaluation requires tune reports",
    );
  });
});
