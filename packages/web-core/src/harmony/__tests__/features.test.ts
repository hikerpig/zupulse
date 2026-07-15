import { describe, expect, it } from "vitest";
import { buildHarmonyFeatureCache } from "../features";

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
});
