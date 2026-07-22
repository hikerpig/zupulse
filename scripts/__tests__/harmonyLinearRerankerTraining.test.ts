import { describe, expect, it } from "vitest";
import {
  harmonyRankingRecordsReportSchema,
  type HarmonyRankingRecordsReport,
} from "../../tools/harmony-cli/src/schemas";
import { evaluateLinearHarmonyReranker, trainLinearHarmonyReranker } from "../harmonyLinearRerankerTraining";

const cMajor = { root: { step: "C" as const, alter: 0 as const }, kind: "major" as const, degrees: [] };
const gMajor = { root: { step: "G" as const, alter: 0 as const }, kind: "major" as const, degrees: [] };

function report(split: "train" | "tune", targetIndex = 1): HarmonyRankingRecordsReport {
  return harmonyRankingRecordsReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "ranking-records",
    split,
    featureVersion: "relative-pc-presence-v1",
    groupsSha256: split === "train" ? "a".repeat(64) : "b".repeat(64),
    sources: [{ caseId: "fixture", revision: "v1", groupsSha256: "c".repeat(64) }],
    records: [
      {
        id: `fixture:work-${split}:0:0`,
        corpus: "fixture",
        groupId: `work-${split}`,
        range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 480 } },
        weight: 480,
        outcome: "oracle-hit",
        primaryIndex: 0,
        targetIndex,
        candidates: [
          { chord: cMajor, features: Array(37).fill(0), ruleLocalScore: 2, ruleSequenceScore: 2 },
          { chord: gMajor, features: [1, ...Array(36).fill(0)], ruleLocalScore: 1, ruleSequenceScore: 1 },
        ],
      },
    ],
  });
}

describe("linear harmony reranker training", () => {
  it("learns a deterministic listwise model from train-only oracle hits", () => {
    const first = trainLinearHarmonyReranker([report("train")]);
    const second = trainLinearHarmonyReranker([report("train")]);

    expect(first).toEqual(second);
    expect(first.weights[0]).toBeGreaterThan(0);
    expect(first.weights.every((weight) => Number(weight.toFixed(2)) === weight)).toBe(true);
  });

  it("rejects tune reports during training", () => {
    expect(() => trainLinearHarmonyReranker([report("tune")])).toThrow("training requires train reports");
  });

  it("evaluates baseline and model Top-1 on tune-only records", () => {
    const model = trainLinearHarmonyReranker([report("train")]);
    const result = evaluateLinearHarmonyReranker(model, [report("tune")]);

    expect(result.aggregate).toEqual({ records: 1, weight: 480, baselineTop1: 0, modelTop1: 1, delta: 1 });
    expect(result.corpora.fixture).toEqual(result.aggregate);
    expect(() => evaluateLinearHarmonyReranker(model, [report("train")])).toThrow("evaluation requires tune reports");
  });
});
