import { describe, expect, it } from "vitest";
import {
  evaluateHarmonyBoundaryClassifier,
  selectHarmonyBoundaryThreshold,
  trainHarmonyBoundaryClassifier,
} from "../harmonyBoundaryTraining";

function report(split: "train" | "tune") {
  return {
    schemaVersion: "1.0.0" as const,
    command: "boundary-records" as const,
    split,
    featureVersion: "boundary-evidence-v1" as const,
    groupsSha256: "a".repeat(64),
    sources: [{ caseId: "fixture", revision: "v1", groupsSha256: "b".repeat(64) }],
    records: [
      {
        id: "negative-1",
        corpus: "fixture",
        groupId: "work",
        moment: { measureIndex: 0, offsetTicks: 1 },
        target: 0 as const,
        features: [0, 0, 1, 0.08, 0.2],
      },
      {
        id: "negative-2",
        corpus: "fixture",
        groupId: "work",
        moment: { measureIndex: 0, offsetTicks: 2 },
        target: 0 as const,
        features: [0, 0, 1, 0, 0.1],
      },
      {
        id: "positive",
        corpus: "fixture",
        groupId: "work",
        moment: { measureIndex: 0, offsetTicks: 3 },
        target: 1 as const,
        features: [0, 1, 0, 0.17, 1],
      },
    ],
  };
}

describe("harmony boundary classifier training", () => {
  it("trains a deterministic quantized classifier on imbalanced train records", () => {
    const first = trainHarmonyBoundaryClassifier([report("train")]);
    const second = trainHarmonyBoundaryClassifier([report("train")]);

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toMatch(/\d+\.\d{3,}/);
    expect(evaluateHarmonyBoundaryClassifier(first, [report("train")]).f1).toBe(1);
    expect(() => trainHarmonyBoundaryClassifier([report("tune")])).toThrow("training requires train reports");
  });

  it("selects the sparsest tune threshold while preserving 0.99 recall", () => {
    const model = trainHarmonyBoundaryClassifier([report("train")]);
    const selected = selectHarmonyBoundaryThreshold(model, [report("tune")]);
    const metrics = evaluateHarmonyBoundaryClassifier(selected, [report("tune")]);

    expect(selected.threshold).toBeGreaterThan(0.5);
    expect(metrics).toMatchObject({ precision: 1, recall: 1, f1: 1, retainedRate: 1 / 3 });
    expect(() => evaluateHarmonyBoundaryClassifier(model, [report("train")])).not.toThrow();
    expect(() => selectHarmonyBoundaryThreshold(model, [report("train")])).toThrow(
      "threshold selection requires tune reports",
    );
  });
});
