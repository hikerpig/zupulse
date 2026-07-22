import { describe, expect, it } from "vitest";
import {
  createLinearHarmonyFeatures,
  LINEAR_HARMONY_FEATURE_LENGTH,
  linearHarmonyRerankerModelSchema,
  rankHarmonyCandidatesLinear,
} from "../linearReranker";

const cMajor = { root: { step: "C" as const, alter: 0 as const }, kind: "major" as const, degrees: [] };
const gMajor = { root: { step: "G" as const, alter: 0 as const }, kind: "major" as const, degrees: [] };
const candidates = [
  { chord: cMajor, features: [1, ...Array(36).fill(0)], ruleLocalScore: 10, ruleSequenceScore: 8 },
  { chord: gMajor, features: Array(37).fill(0), ruleLocalScore: 8, ruleSequenceScore: 7 },
];

describe("linear harmony reranker", () => {
  it("builds fixed-length deterministic candidate features", () => {
    expect(createLinearHarmonyFeatures(candidates, 0)).toHaveLength(LINEAR_HARMONY_FEATURE_LENGTH);
    expect(createLinearHarmonyFeatures(candidates, 0)).toEqual(createLinearHarmonyFeatures(candidates, 0));
    expect(createLinearHarmonyFeatures(candidates, 1, 1).at(-1)).toBe(1);
    expect(createLinearHarmonyFeatures(candidates, 0, 1).at(-1)).toBe(0);
  });

  it("ranks by linear logits and keeps stable ties", () => {
    const model = linearHarmonyRerankerModelSchema.parse({
      version: 1,
      featureVersion: "candidate-linear-v2",
      algorithmVersion: "listwise-sgd-v1",
      trainingSourcesSha256: ["a".repeat(64)],
      trainingGroupsSha256: "b".repeat(64),
      weights: [2, ...Array(LINEAR_HARMONY_FEATURE_LENGTH - 1).fill(0)],
    });
    expect(rankHarmonyCandidatesLinear(model, candidates).map((item) => item.index)).toEqual([0, 1]);
    expect(
      rankHarmonyCandidatesLinear({ ...model, weights: model.weights.map(() => 0) }, candidates).map(
        (item) => item.index,
      ),
    ).toEqual([0, 1]);
  });

  it("exposes logits with at most two decimals", () => {
    const model = linearHarmonyRerankerModelSchema.parse({
      version: 1,
      featureVersion: "candidate-linear-v2",
      algorithmVersion: "listwise-sgd-v1",
      trainingSourcesSha256: ["a".repeat(64)],
      trainingGroupsSha256: "b".repeat(64),
      weights: [...Array(LINEAR_HARMONY_FEATURE_LENGTH - 3).fill(0), 0.33, 0, 0],
    });

    expect(rankHarmonyCandidatesLinear(model, candidates)[1]!.logit).toBe(0.29);
  });

  it("can preserve the rule primary as an explicit baseline feature", () => {
    const model = linearHarmonyRerankerModelSchema.parse({
      version: 1,
      featureVersion: "candidate-linear-v2",
      algorithmVersion: "listwise-sgd-v1",
      trainingSourcesSha256: ["a".repeat(64)],
      trainingGroupsSha256: "b".repeat(64),
      weights: [...Array(LINEAR_HARMONY_FEATURE_LENGTH - 1).fill(0), 1],
    });

    expect(rankHarmonyCandidatesLinear(model, candidates, 1)[0]!.index).toBe(1);
  });

  it("rejects model weights with more than two decimals", () => {
    expect(() =>
      linearHarmonyRerankerModelSchema.parse({
        version: 1,
        featureVersion: "candidate-linear-v2",
        algorithmVersion: "listwise-sgd-v1",
        trainingSourcesSha256: ["a".repeat(64)],
        trainingGroupsSha256: "b".repeat(64),
        weights: [0.123, ...Array(LINEAR_HARMONY_FEATURE_LENGTH - 1).fill(0)],
      }),
    ).toThrow("weights must have at most two decimals");
  });
});
