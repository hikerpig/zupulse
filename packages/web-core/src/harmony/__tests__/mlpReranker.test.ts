import { describe, expect, it } from "vitest";
import { LINEAR_HARMONY_FEATURE_LENGTH } from "../linearReranker";
import { mlpHarmonyRerankerModelSchema, rankHarmonyCandidatesMlp } from "../mlpReranker";

const candidates = [
  {
    chord: { root: { step: "C" as const, alter: 0 as const }, kind: "major" as const, degrees: [] },
    features: Array(37).fill(0),
    ruleLocalScore: 2,
    ruleSequenceScore: 2,
  },
  {
    chord: { root: { step: "G" as const, alter: 0 as const }, kind: "major" as const, degrees: [] },
    features: [1, ...Array(36).fill(0)],
    ruleLocalScore: 1,
    ruleSequenceScore: 1,
  },
];

function model() {
  return {
    version: 1 as const,
    featureVersion: "candidate-linear-v2" as const,
    algorithmVersion: "mlp-relu-v1" as const,
    trainingSourcesSha256: ["a".repeat(64)],
    trainingGroupsSha256: "b".repeat(64),
    hiddenSize: 1,
    hiddenWeights: [1, ...Array(LINEAR_HARMONY_FEATURE_LENGTH - 1).fill(0)],
    hiddenBias: [0],
    outputWeights: [1],
    outputBias: 0,
  };
}

describe("MLP harmony reranker", () => {
  it("ranks candidates with deterministic TypeScript inference", () => {
    expect(rankHarmonyCandidatesMlp(mlpHarmonyRerankerModelSchema.parse(model()), candidates, 0)).toEqual([
      { index: 1, logit: 1 },
      { index: 0, logit: 0 },
    ]);
  });

  it("rejects malformed or over-precise assets", () => {
    expect(() => mlpHarmonyRerankerModelSchema.parse({ ...model(), hiddenWeights: [1] })).toThrow(
      "hiddenWeights length",
    );
    expect(() => mlpHarmonyRerankerModelSchema.parse({ ...model(), outputWeights: [0.123] })).toThrow(
      "weights must have at most two decimals",
    );
  });

  it("validates the bundled quantized training asset", async () => {
    const bundled = mlpHarmonyRerankerModelSchema.parse(
      JSON.parse(await readFile(new URL("../harmony-primary-mlp-model.json", import.meta.url), "utf8")),
    );

    expect(bundled.hiddenSize).toBe(16);
    expect(bundled.hiddenWeights).toHaveLength(16 * LINEAR_HARMONY_FEATURE_LENGTH);
  });
});
import { readFile } from "node:fs/promises";
