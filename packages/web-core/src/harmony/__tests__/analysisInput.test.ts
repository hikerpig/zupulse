import { describe, expect, it } from "vitest";
import { createDefaultHarmonyScope, createHarmonyAnalysisInput } from "../analysisInput";

describe("harmony analysis input", () => {
  it("keeps written note evidence and excludes percussion by default", () => {
    const input = createHarmonyAnalysisInput({
      ticksPerQuarter: 960,
      measures: [{ index: 0, durationTicks: 3840, timeSignature: { numerator: 4, denominator: 4 }, key: "C" }],
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
                  id: "n1",
                  moment: { measureIndex: 0, offsetTicks: 0 },
                  durationTicks: 960,
                  soundingPitchClass: 0,
                  spelling: { step: "C", alter: 0 },
                  voice: 1,
                  tie: "start",
                },
              ],
            },
          ],
        },
        {
          id: "drums",
          name: "Drums",
          isPercussion: true,
          staves: [
            {
              index: 0,
              notes: [{ id: "n2", moment: { measureIndex: 0, offsetTicks: 0 }, durationTicks: 480, voice: 1 }],
            },
          ],
        },
      ],
    });
    expect(input.tracks[0]?.staves[0]?.notes[0]?.soundingPitchClass).toBe(0);
    expect(input.tracks[1]?.isPercussion).toBe(true);
    expect(createDefaultHarmonyScope(input)).toEqual({ includedTrackIds: ["piano"] });
  });
});
