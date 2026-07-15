import { describe, expect, it } from "vitest";
import { applyHarmonyConfidence } from "../postprocess";
import { generateHarmonyCandidates } from "../candidates";

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

  it("keeps candidate confidence invariant when all note durations scale", () => {
    const candidates = (duration: number) =>
      generateHarmonyCandidates(
        { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: duration } },
        {
          durationByPitchClass: [duration, 0, 0, 0, duration, 0, 0, duration, 0, 0, 0, 0],
          onsetCountByPitchClass: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
          bassPitchClass: 0,
        },
        { topK: 8 },
      );

    const short = candidates(10);
    const long = candidates(20);
    expect(short[0]?.confidence).toBeCloseTo(long[0]!.confidence, 10);
    expect(short.every((candidate) => candidate.confidence <= short[0]!.confidence)).toBe(true);
  });
});
