import { describe, expect, it } from "vitest";
import { generateHarmonyCandidates, selectHybridCandidates, type HarmonyCandidate } from "../candidates";
import { createHarmonyRankerFeatures, harmonyChordShape, harmonyRankerModelSchema } from "../learnedRanker";

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
    expect(candidates.some((candidate) => candidate.chord.root.step === "C" && candidate.chord.kind === "minor")).toBe(
      false,
    );
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

  it("uses source spellings for enharmonic roots and bass notes", () => {
    const candidates = generateHarmonyCandidates(
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 960 } },
      {
        durationByPitchClass: [0, 0, 0, 960, 0, 0, 0, 960, 0, 0, 960, 0],
        onsetCountByPitchClass: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],
        spellingByPitchClass: [
          undefined,
          undefined,
          undefined,
          { step: "E", alter: -1 },
          undefined,
          undefined,
          undefined,
          { step: "G", alter: 0 },
          undefined,
          undefined,
          { step: "B", alter: -1 },
          undefined,
        ],
        bassPitchClass: 10,
      },
      { topK: 8 },
    );

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chord: expect.objectContaining({
            root: { step: "E", alter: -1 },
            kind: "major",
            bass: { step: "B", alter: -1 },
          }),
        }),
      ]),
    );
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

  it("uses learned evidence before applying the Top-K limit", () => {
    const features = {
      durationByPitchClass: [480, 0, 0, 480, 480, 0, 0, 480, 0, 0, 0, 0],
      onsetCountByPitchClass: [1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0],
      bassPitchClass: 0,
    };
    const minor = { root: { step: "C", alter: 0 }, kind: "minor", degrees: [] } as const;
    const model = harmonyRankerModelSchema.parse({
      version: 1,
      featureVersion: "relative-pc-presence-v1",
      algorithmVersion: "frequency-ranker-v2",
      trainingCorpusSha256: ["1".repeat(64)],
      trainingGroupsSha256: "0".repeat(64),
      prototypes: [{ chordShape: "minor||[]|", features: createHarmonyRankerFeatures(features, minor), frequency: 1 }],
    });
    const candidates = generateHarmonyCandidates(
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 480 } },
      features,
      { topK: 1, rankerModel: model },
    );

    expect(candidates[0]!.chord).toMatchObject({ root: { step: "C", alter: 0 }, kind: "minor" });
  });

  it("keeps the observed chord-tone bass when the learned catalog omits that inversion", () => {
    const features = {
      durationByPitchClass: [960, 0, 0, 0, 960, 0, 0, 960, 0, 0, 0, 0],
      onsetCountByPitchClass: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
      bassPitchClass: 4,
    };
    const rootPosition = { root: { step: "C", alter: 0 }, kind: "major", degrees: [] } as const;
    const model = harmonyRankerModelSchema.parse({
      version: 1,
      featureVersion: "relative-pc-presence-v1",
      algorithmVersion: "frequency-ranker-v2",
      trainingCorpusSha256: ["1".repeat(64)],
      trainingGroupsSha256: "0".repeat(64),
      prototypes: [
        {
          chordShape: harmonyChordShape(rootPosition),
          features: createHarmonyRankerFeatures(features, rootPosition),
          frequency: 1,
        },
      ],
    });

    const candidates = generateHarmonyCandidates(
      { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 960 } },
      features,
      { topK: 8, rankerModel: model },
    );

    expect(candidates.some(({ chord }) => chord.root.step === "C" && chord.bass?.step === "E")).toBe(true);
  });

  it("reserves a hybrid slot for the observed bass variant of a selected base chord", () => {
    const candidate = (
      step: HarmonyCandidate["chord"]["root"]["step"],
      kind: HarmonyCandidate["chord"]["kind"],
      localScore: number,
      sequenceScore: number,
      bass?: HarmonyCandidate["chord"]["bass"],
    ): HarmonyCandidate => ({
      chord: { root: { step, alter: 0 }, kind, degrees: [], ...(bass ? { bass } : {}) },
      localScore,
      sequenceScore,
      confidence: 0,
    });
    const observed = candidate("C", "major", 0, 0, { step: "E", alter: 0 });
    const selected = selectHybridCandidates(
      [
        candidate("C", "major", 100, 1),
        candidate("D", "major", 90, 2),
        candidate("E", "major", 80, 3),
        candidate("F", "major", 70, 4),
        candidate("G", "major", 60, 5),
        candidate("A", "major", 50, 6),
        candidate("B", "major", 40, 100),
        candidate("D", "minor", 30, 90),
        observed,
      ],
      8,
      4,
    );

    expect(selected).toHaveLength(8);
    expect(selected).toContain(observed);
  });
});
