import { describe, expect, it } from "vitest";
import { buildHarmonyFeatureCache } from "../paper-semi-crf-alternative-features";

describe("harmony feature cache", () => {
  it("matches direct interval evidence and caps doubling", () => {
    const cache = buildHarmonyFeatureCache({
      ticksPerQuarter: 960,
      notes: [
        { moment: { measureIndex: 0, offsetTicks: 0 }, durationTicks: 960, soundingPitchClass: 0, voice: 1 },
        { moment: { measureIndex: 0, offsetTicks: 0 }, durationTicks: 960, soundingPitchClass: 0, voice: 2 },
        { moment: { measureIndex: 0, offsetTicks: 0 }, durationTicks: 480, soundingPitchClass: 4, voice: 1 },
      ],
    });
    expect(
      cache.forRange({ start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 960 } })
        .durationByPitchClass,
    ).toEqual([960, 0, 0, 0, 480, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("uses sounding MIDI to identify the actual bass in an inversion", () => {
    const cache = buildHarmonyFeatureCache({
      ticksPerQuarter: 960,
      notes: [
        {
          moment: { measureIndex: 0, offsetTicks: 0 },
          durationTicks: 960,
          soundingPitchClass: 0,
          soundingMidi: 60,
          voice: 1,
        },
        {
          moment: { measureIndex: 0, offsetTicks: 0 },
          durationTicks: 960,
          soundingPitchClass: 4,
          soundingMidi: 52,
          voice: 1,
        },
      ],
    });
    expect(
      cache.forRange({ start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 960 } })
        .bassPitchClass,
    ).toBe(4);
  });

  it("keeps the duration-dominant source spelling for each pitch class", () => {
    const cache = buildHarmonyFeatureCache({
      ticksPerQuarter: 960,
      notes: [
        {
          moment: { measureIndex: 0, offsetTicks: 0 },
          durationTicks: 960,
          soundingPitchClass: 10,
          spelling: { step: "B", alter: -1 },
          voice: 1,
        },
        {
          moment: { measureIndex: 0, offsetTicks: 0 },
          durationTicks: 240,
          soundingPitchClass: 10,
          spelling: { step: "A", alter: 1 },
          voice: 2,
        },
      ],
    });

    expect(
      cache.forRange({ start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 960 } })
        .spellingByPitchClass[10],
    ).toEqual({ step: "B", alter: -1 });
  });

  it("counts onsets by complete written moment across measures", () => {
    const cache = buildHarmonyFeatureCache({
      ticksPerQuarter: 480,
      notes: [
        {
          moment: { measureIndex: 0, offsetTicks: 0 },
          durationTicks: 480,
          soundingPitchClass: 0,
          voice: 1,
        },
        {
          moment: { measureIndex: 1, offsetTicks: 0 },
          durationTicks: 480,
          soundingPitchClass: 4,
          voice: 1,
        },
      ],
    });

    expect(
      cache.forRange({ start: { measureIndex: 0, offsetTicks: 240 }, end: { measureIndex: 1, offsetTicks: 480 } })
        .onsetCountByPitchClass,
    ).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
  });
});
