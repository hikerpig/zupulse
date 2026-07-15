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
    expect(
      candidates.some((candidate) => candidate.chord.root.step === "C" && candidate.chord.extension !== undefined),
    ).toBe(false);
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

  it.each([
    {
      name: "dominant inversion",
      pitches: [2, 5, 7, 11],
      bass: 11,
      expected: { root: { step: "G" }, kind: "dominant", extension: 7, bass: { step: "B" } },
    },
    {
      name: "suspended second",
      pitches: [0, 2, 7],
      bass: 0,
      expected: { root: { step: "C" }, kind: "suspended-second" },
    },
    {
      name: "augmented",
      pitches: [0, 4, 8],
      bass: 0,
      expected: { root: { step: "C" }, kind: "augmented" },
    },
    {
      name: "half-diminished",
      pitches: [0, 3, 6, 10],
      bass: 0,
      expected: { root: { step: "C" }, kind: "half-diminished", extension: 7 },
    },
  ])("includes an evidence-backed $name candidate", ({ pitches, bass, expected }) => {
    const durationByPitchClass = Array.from({ length: 12 }, (_, pitchClass) =>
      pitches.includes(pitchClass) ? 960 : 0,
    );
    const candidates = generateHarmonyCandidates(
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 960 } },
      {
        durationByPitchClass,
        onsetCountByPitchClass: durationByPitchClass.map((duration) => Number(duration > 0)),
        bassPitchClass: bass,
      },
      { topK: 8 },
    );

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chord: expect.objectContaining({
            ...expected,
            root: expect.objectContaining(expected.root),
            ...("bass" in expected && expected.bass ? { bass: expect.objectContaining(expected.bass) } : {}),
          }),
        }),
      ]),
    );
  });
});
