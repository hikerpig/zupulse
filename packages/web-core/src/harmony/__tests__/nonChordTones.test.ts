import { describe, expect, it } from "vitest";
import { mergeHarmonySegments } from "../postprocess";

describe("non-chord tone postprocessing", () => {
  it("merges a short identical middle segment", () => {
    const chord = { root: { step: "C" as const, alter: 0 as const }, kind: "major" as const, degrees: [] };
    const result = mergeHarmonySegments([
      {
        status: "resolved" as const,
        range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 1 } },
        chord,
        confidence: 0.9,
        alternatives: [],
      },
      {
        status: "resolved" as const,
        range: { start: { measureIndex: 0, offsetTicks: 1 }, end: { measureIndex: 0, offsetTicks: 2 } },
        chord,
        confidence: 0.8,
        alternatives: [],
      },
    ]);
    expect(result).toHaveLength(1);
  });
});
