import { describe, expect, it } from "vitest";
import { generateHarmonyCandidates } from "../candidates";

describe("harmony candidates", () => {
  it("ranks a major triad and keeps a deterministic top-k", () => {
    const candidates = generateHarmonyCandidates(
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 960 } },
      {
        durationByPitchClass: [960, 0, 0, 0, 960, 0, 0, 960, 0, 0, 0, 0],
        onsetCountByPitchClass: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
        bassPitchClass: 0,
      },
      { topK: 4 },
    );
    expect(candidates).toHaveLength(4);
    expect(candidates[0]?.chord).toMatchObject({ root: { step: "C" }, kind: "major" });
  });

  it("uses bass evidence for slash chords", () => {
    const candidates = generateHarmonyCandidates(
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 960 } },
      {
        durationByPitchClass: [960, 0, 0, 0, 960, 0, 0, 960, 0, 0, 0, 0],
        onsetCountByPitchClass: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
        bassPitchClass: 4,
      },
      { topK: 8 },
    );
    expect(candidates.some((candidate) => candidate.chord.bass?.step === "E")).toBe(true);
  });
});
