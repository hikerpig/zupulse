import { describe, expect, it } from "vitest";
import { applyHarmonyConfidence } from "../postprocess";

describe("harmony confidence", () => {
  it("rejects low confidence without turning it into N.C.", () => {
    const result = applyHarmonyConfidence(
      [
        {
          status: "resolved",
          range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 1 } },
          chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] },
          confidence: 0.2,
          alternatives: [],
        },
      ],
      0.6,
    );
    expect(result[0]).toMatchObject({ status: "unresolved", reason: "low-confidence" });
  });
});
