import { describe, expect, it } from "vitest";
import { applyHarmonyCalibration } from "../confidenceCalibration";

describe("harmony confidence calibration", () => {
  it("uses a monotonic step model and clamps scores", () => {
    const model = {
      schemaVersion: "1.0.0" as const,
      featureVersion: "primary-local-margin-v1",
      steps: [
        { upperBound: 0.5, probability: 0.3 },
        { upperBound: 1, probability: 0.8 },
      ],
    };
    expect(applyHarmonyCalibration(-1, model)).toBe(0.3);
    expect(applyHarmonyCalibration(0.5, model)).toBe(0.3);
    expect(applyHarmonyCalibration(0.51, model)).toBe(0.8);
    expect(applyHarmonyCalibration(2, model)).toBe(0.8);
  });

  it("rejects a decreasing model", () => {
    expect(() =>
      applyHarmonyCalibration(0.5, {
        schemaVersion: "1.0.0",
        featureVersion: "primary-local-margin-v1",
        steps: [
          { upperBound: 0.5, probability: 0.8 },
          { upperBound: 1, probability: 0.3 },
        ],
      }),
    ).toThrow("calibration probabilities must be monotonic");
  });
});
