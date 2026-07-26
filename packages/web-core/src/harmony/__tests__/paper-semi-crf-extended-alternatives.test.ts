import { describe, expect, it } from "vitest";
import { generateHarmonyCandidates } from "../paper-semi-crf-alternatives";

describe("extended harmony candidates", () => {
  it("includes an evidence-backed dominant 13", () => {
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

  it("distinguishes add9 from a full ninth extension", () => {
    const candidates = generateHarmonyCandidates(
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 960 } },
      {
        durationByPitchClass: [960, 0, 960, 0, 960, 0, 0, 960, 0, 0, 0, 0],
        onsetCountByPitchClass: [1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0],
        bassPitchClass: 0,
      },
      { topK: 8 },
    );

    expect(
      candidates.some(
        (candidate) =>
          candidate.chord.root.step === "C" &&
          candidate.chord.extension === undefined &&
          candidate.chord.degrees.some((degree) => degree.operation === "add" && degree.value === 9),
      ),
    ).toBe(true);
    expect(candidates.some((candidate) => candidate.chord.root.step === "C" && candidate.chord.extension === 9)).toBe(
      false,
    );
  });

  it("aggregates evidence-backed dominant alterations without a cartesian product", () => {
    const candidates = generateHarmonyCandidates(
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 960 } },
      {
        durationByPitchClass: [960, 960, 0, 0, 960, 0, 960, 960, 0, 0, 960, 0],
        onsetCountByPitchClass: [1, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0],
        bassPitchClass: 0,
      },
      { topK: 8 },
    );

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chord: expect.objectContaining({
            root: { step: "C", alter: 0 },
            kind: "dominant",
            extension: 7,
            degrees: [
              { operation: "alter", value: 9, alter: -1 },
              { operation: "alter", value: 11, alter: 1 },
            ],
          }),
        }),
      ]),
    );
  });

  it("keeps simultaneous flat and sharp ninth evidence in separate schema-valid candidates", () => {
    const durationByPitchClass = [960, 960, 0, 960, 960, 0, 0, 960, 0, 0, 960, 0];

    expect(() =>
      generateHarmonyCandidates(
        { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 960 } },
        {
          durationByPitchClass,
          onsetCountByPitchClass: durationByPitchClass.map((duration) => Number(duration > 0)),
          bassPitchClass: 0,
        },
        { topK: 8 },
      ),
    ).not.toThrow();
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

  it.each([
    { kind: "major" as const, extension: 9 as const, pitches: [0, 2, 4, 7, 11] },
    { kind: "major" as const, extension: 11 as const, pitches: [0, 2, 4, 5, 7, 11] },
    { kind: "major" as const, extension: 13 as const, pitches: [0, 2, 4, 5, 7, 9, 11] },
    { kind: "minor" as const, extension: 9 as const, pitches: [0, 2, 3, 7, 10] },
    { kind: "minor" as const, extension: 11 as const, pitches: [0, 2, 3, 5, 7, 10] },
    { kind: "minor" as const, extension: 13 as const, pitches: [0, 2, 3, 5, 7, 9, 10] },
  ])("includes a complete $kind $extension extension", ({ kind, extension, pitches }) => {
    const durationByPitchClass = Array.from({ length: 12 }, (_, pitchClass) =>
      pitches.includes(pitchClass) ? 960 : 0,
    );
    const candidates = generateHarmonyCandidates(
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 960 } },
      {
        durationByPitchClass,
        onsetCountByPitchClass: durationByPitchClass.map((duration) => Number(duration > 0)),
        bassPitchClass: 0,
      },
      { topK: 8 },
    );

    expect(
      candidates.some(
        (candidate) =>
          candidate.chord.root.step === "C" && candidate.chord.kind === kind && candidate.chord.extension === extension,
      ),
    ).toBe(true);
  });
});
