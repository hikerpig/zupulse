import { describe, expect, it } from "vitest";
import { generateOracleCandidates } from "../harmonyOracleCandidates";

describe("harmony candidate oracle evaluation", () => {
  it("generates candidates from the annotated range instead of a decoded spanning segment", () => {
    const candidates = generateOracleCandidates({
      ticksPerQuarter: 480,
      range: { start: { measureIndex: 1, offsetTicks: 0 }, end: { measureIndex: 1, offsetTicks: 480 } },
      notes: [
        { moment: { measureIndex: 0, offsetTicks: 0 }, durationTicks: 480, soundingPitchClass: 1, voice: 1 },
        { moment: { measureIndex: 1, offsetTicks: 0 }, durationTicks: 480, soundingPitchClass: 0, voice: 1 },
        { moment: { measureIndex: 1, offsetTicks: 0 }, durationTicks: 480, soundingPitchClass: 4, voice: 2 },
        { moment: { measureIndex: 1, offsetTicks: 0 }, durationTicks: 480, soundingPitchClass: 7, voice: 3 },
      ],
    });

    expect(candidates.some((candidate) => candidate.chord.root.step === "C" && candidate.chord.kind === "major")).toBe(
      true,
    );
  });
});
