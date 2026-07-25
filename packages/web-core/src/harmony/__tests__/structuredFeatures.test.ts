import { describe, expect, it } from "vitest";
import { createHarmonyAnalysisInput } from "../analysisInput";
import {
  createStructuredFeatureCache,
  createStructuredTransitionFeatures,
  flattenStructuredSegmentFeatures,
  flattenStructuredTransitionFeatures,
  structuredSegmentFeaturesSchema,
  structuredTransitionFeaturesSchema,
} from "../structuredFeatures";

const chord = (step: "C" | "G", bass?: { step: "B"; alter: 0 }) => ({
  root: { step, alter: 0 as const },
  kind: "major" as const,
  ...(bass ? { bass } : {}),
  degrees: [],
});

describe("semi-crf structured features", () => {
  it("keeps duration, attack, held, staff, and voice evidence separate across a pickup boundary", () => {
    const input = createHarmonyAnalysisInput({
      ticksPerQuarter: 480,
      measures: [
        { index: 0, durationTicks: 240, timeSignature: { numerator: 1, denominator: 4 }, key: "C" },
        { index: 1, durationTicks: 480, timeSignature: { numerator: 4, denominator: 4 }, key: "C" },
      ],
      tracks: [
        {
          id: "piano",
          name: "Piano",
          isPercussion: false,
          staves: [
            {
              index: 0,
              notes: [
                {
                  id: "held-c",
                  moment: { measureIndex: 0, offsetTicks: 120 },
                  durationTicks: 240,
                  soundingPitchClass: 0,
                  soundingMidi: 60,
                  spelling: { step: "C", alter: 0 },
                  voice: 1,
                },
                {
                  id: "e",
                  moment: { measureIndex: 1, offsetTicks: 0 },
                  durationTicks: 240,
                  soundingPitchClass: 4,
                  soundingMidi: 64,
                  voice: 1,
                },
                {
                  id: "passing-d",
                  moment: { measureIndex: 1, offsetTicks: 120 },
                  durationTicks: 60,
                  soundingPitchClass: 2,
                  soundingMidi: 62,
                  voice: 2,
                },
              ],
            },
            {
              index: 1,
              notes: [
                {
                  id: "bass-g",
                  moment: { measureIndex: 1, offsetTicks: 0 },
                  durationTicks: 240,
                  soundingPitchClass: 7,
                  soundingMidi: 43,
                  voice: 1,
                },
              ],
            },
          ],
        },
      ],
    });
    const cache = createStructuredFeatureCache(input, ["piano"]);
    const range = {
      start: { measureIndex: 1, offsetTicks: 0 },
      end: { measureIndex: 1, offsetTicks: 240 },
    };
    const first = cache.forCandidate(range, chord("C"));
    const second = cache.forCandidate(range, chord("C"));

    expect(first).toEqual(second);
    expect(first.durationChroma[0]).toBeGreaterThan(0);
    expect(first.attackChroma[0]).toBe(0);
    expect(first.heldChroma[0]).toBeGreaterThan(0);
    expect(first.upperStaffAttackChroma[4]).toBeGreaterThan(0);
    expect(first.lowerStaffAttackChroma[7]).toBeGreaterThan(0);
    expect(first.scalars.nonChordDurationRatio).toBeGreaterThan(0);
    expect(first.scalars.staffSynchronization).toBeGreaterThan(0);
    expect(first.scalars.voiceSynchronization).toBeGreaterThan(0);
    expect(first.scalars.keyCompatibility).toBe(1);
    expect(structuredSegmentFeaturesSchema.parse(first)).toEqual(first);
    expect(flattenStructuredSegmentFeatures(first).every(hasAtMostTwoDecimals)).toBe(true);
  });

  it("creates deterministic chord-pair transition features including slash bass", () => {
    const from = createStructuredTransitionFeatures({
      from: chord("C"),
      to: chord("G", { step: "B", alter: 0 }),
      fromDurationQuarterNotes: 2,
      toDurationQuarterNotes: 1,
    });

    expect(from.scalars.sameChord).toBe(0);
    expect(from.rootMotion[7]).toBe(1);
    expect(from.bassMotion[11]).toBe(1);
    expect(from.scalars.commonToneRatio).toBeGreaterThan(0);
    expect(structuredTransitionFeaturesSchema.parse(from)).toEqual(from);
    expect(flattenStructuredTransitionFeatures(from).every(hasAtMostTwoDecimals)).toBe(true);
  });
});

function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < Number.EPSILON * 100;
}
