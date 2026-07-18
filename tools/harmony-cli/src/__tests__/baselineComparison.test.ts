import { describe, expect, it } from "vitest";
import { compareAccuracyBaseline } from "../baselineComparison";

const metrics = {
  splits: { train: 10, tune: 2, eval: 8 },
  gold: { total: 8, mapped: 7, unsupported: 1 },
  mappingCoverage: 0.875,
  top1Accuracy: 0.5,
  top8OracleRecall: 0.75,
  resolvedPrecision: 0.6,
  resolvedCoverage: 0.8,
  boundaryF1: 0.9,
  expectedCalibrationError: 0.2,
};

describe("accuracy baseline comparison", () => {
  it("allows bounded metric drift while locking corpus counts", () => {
    const result = compareAccuracyBaseline(
      { ...metrics, top1Accuracy: 0.496, expectedCalibrationError: 0.204 },
      metrics,
      0.005,
    );

    expect(result.status).toBe("passed");
    expect(result.checks).toContainEqual(
      expect.objectContaining({ field: "top1Accuracy", direction: "higher", status: "passed" }),
    );
  });

  it("reports regressions in either metric direction", () => {
    const result = compareAccuracyBaseline(
      { ...metrics, top8OracleRecall: 0.74, expectedCalibrationError: 0.21 },
      metrics,
      0.005,
    );

    expect(result.status).toBe("failed");
    expect(result.checks.filter((check) => check.status === "failed").map((check) => check.field)).toEqual([
      "top8OracleRecall",
      "expectedCalibrationError",
    ]);
  });

  it("does not hide changed holdout membership behind tolerance", () => {
    const result = compareAccuracyBaseline({ ...metrics, splits: { ...metrics.splits, eval: 9 } }, metrics, 1);

    expect(result.status).toBe("failed");
    expect(result.checks).toContainEqual(expect.objectContaining({ field: "splits.eval", status: "failed" }));
  });
});
