import { describe, expect, it } from "vitest";
import { generateHarmonyCandidates } from "../candidates";

describe("extended harmony candidates", () => {
  it("includes evidence-backed dominant 13 and altered degrees", () => {
    const candidates = generateHarmonyCandidates(
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 960 } },
      {
        durationByPitchClass: [960, 0, 960, 0, 960, 960, 0, 960, 0, 960, 960, 0],
        onsetCountByPitchClass: [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0],
        bassPitchClass: 0,
      },
      { topK: 8 },
    );
    expect(
      candidates.some((candidate) => candidate.chord.kind === "dominant" && candidate.chord.extension === 13),
    ).toBe(true);
  });

  it("does not propose unsupported upper extensions for a dominant seventh", () => {
    const candidates = generateHarmonyCandidates(
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 960 } },
      {
        durationByPitchClass: [960, 0, 0, 0, 960, 0, 0, 960, 0, 0, 960, 0],
        onsetCountByPitchClass: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
        bassPitchClass: 0,
      },
      { topK: 8 },
    );

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chord: expect.objectContaining({ kind: "dominant", extension: 7 }) }),
      ]),
    );
    expect(
      candidates.some((candidate) => candidate.chord.kind === "dominant" && (candidate.chord.extension ?? 7) > 7),
    ).toBe(false);
  });

  it("includes a major add4 candidate when the fourth is sounding", () => {
    const candidates = generateHarmonyCandidates(
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 960 } },
      {
        durationByPitchClass: [960, 0, 0, 0, 0, 960, 0, 960, 0, 0, 0, 0],
        onsetCountByPitchClass: [1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0],
        bassPitchClass: 0,
      },
      { topK: 8 },
    );

    expect(
      candidates.some(
        (candidate) =>
          candidate.chord.root.step === "C" &&
          candidate.chord.kind === "major" &&
          candidate.chord.degrees.some((degree) => degree.operation === "add" && degree.value === 4),
      ),
    ).toBe(true);
  });

  it("includes quality-specific sixth and seventh chords", () => {
    const candidates = generateHarmonyCandidates(
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 960 } },
      {
        durationByPitchClass: [960, 0, 0, 0, 960, 0, 0, 960, 0, 960, 0, 0],
        onsetCountByPitchClass: [1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0],
        bassPitchClass: 0,
      },
      { topK: 8 },
    );
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chord: expect.objectContaining({ kind: "major", extension: 6 }) }),
      ]),
    );
  });
});
