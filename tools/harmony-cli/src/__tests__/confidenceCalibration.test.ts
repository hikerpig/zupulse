import { describe, expect, it } from "vitest";
import {
  buildHarmonyCalibrationAsset,
  fitWeightedIsotonicCalibration,
  selectDecisionThreshold,
} from "../confidenceCalibration";

describe("confidence calibration", () => {
  it("pools decreasing weighted bins into a deterministic monotonic model", () => {
    expect(
      fitWeightedIsotonicCalibration([
        { upperBound: 0.2, correctWeight: 8, weight: 10 },
        { upperBound: 0.6, correctWeight: 2, weight: 10 },
        { upperBound: 1, correctWeight: 9, weight: 10 },
      ]),
    ).toEqual([
      { upperBound: 0.6, probability: 0.5 },
      { upperBound: 1, probability: 0.9 },
    ]);
  });

  it("uses the preceding probability for empty bins", () => {
    expect(
      fitWeightedIsotonicCalibration([
        { upperBound: 0.5, correctWeight: 3, weight: 10 },
        { upperBound: 0.7, correctWeight: 0, weight: 0 },
        { upperBound: 1, correctWeight: 8, weight: 10 },
      ]),
    ).toEqual([
      { upperBound: 0.7, probability: 0.3 },
      { upperBound: 1, probability: 0.8 },
    ]);
  });

  it("selects maximum coverage above the precision floor with a deterministic tie break", () => {
    expect(
      selectDecisionThreshold(
        [
          { threshold: 0.4, precision: 0.7, coverage: 0.8 },
          { threshold: 0.5, precision: 0.75, coverage: 0.8 },
          { threshold: 0.6, precision: 0.8, coverage: 0.7 },
        ],
        0.75,
      ),
    ).toBe(0.5);
    expect(selectDecisionThreshold([], 0.75)).toBeUndefined();
    expect(selectDecisionThreshold([{ threshold: 0.8, precision: 0.7, coverage: 0.4 }], 0.75)).toBeUndefined();
  });

  it("refuses calibration inputs outside an unthresholded train report", () => {
    const accuracyCase = {
      id: "mozart",
      kind: "accuracy-corpus" as const,
      reportSplit: "tune" as const,
      decisionThreshold: 0,
      sourceRevision: "2.3",
      reportGroupsSha256: "a".repeat(64),
      metrics: { diagnostics: { confidenceBins: [] } },
    };
    expect(() => buildHarmonyCalibrationAsset(accuracyCase, "b".repeat(64))).toThrow("train report");
    expect(() =>
      buildHarmonyCalibrationAsset({ ...accuracyCase, reportSplit: "train", decisionThreshold: 0.6 }, "b".repeat(64)),
    ).toThrow("decisionThreshold 0");
  });
});
