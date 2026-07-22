import { describe, expect, it } from "vitest";
import { createHarmonyAnalysisInput } from "../analysisInput";
import { createBoundaryEvidenceFeatures } from "../boundaryEvidence";

describe("harmony boundary evidence", () => {
  it("separates a single melodic onset from a bass and pitch-set change", () => {
    const input = createHarmonyAnalysisInput({
      ticksPerQuarter: 480,
      measures: [{ index: 0, durationTicks: 1920, timeSignature: { numerator: 4, denominator: 4 } }],
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
                  moment: { measureIndex: 0, offsetTicks: 0 },
                  durationTicks: 960,
                  soundingPitchClass: 0,
                  soundingMidi: 60,
                  voice: 1,
                },
                {
                  id: "held-e",
                  moment: { measureIndex: 0, offsetTicks: 0 },
                  durationTicks: 960,
                  soundingPitchClass: 4,
                  soundingMidi: 64,
                  voice: 2,
                },
                {
                  id: "melody",
                  moment: { measureIndex: 0, offsetTicks: 240 },
                  durationTicks: 120,
                  soundingPitchClass: 7,
                  soundingMidi: 67,
                  voice: 3,
                },
                {
                  id: "new-d",
                  moment: { measureIndex: 0, offsetTicks: 960 },
                  durationTicks: 480,
                  soundingPitchClass: 2,
                  soundingMidi: 50,
                  voice: 1,
                },
                {
                  id: "new-f",
                  moment: { measureIndex: 0, offsetTicks: 960 },
                  durationTicks: 480,
                  soundingPitchClass: 5,
                  soundingMidi: 65,
                  voice: 2,
                },
              ],
            },
          ],
        },
      ],
    });

    expect(createBoundaryEvidenceFeatures(input, { measureIndex: 0, offsetTicks: 240 })).toEqual([0, 0, 1, 0.08, 0.33]);
    expect(createBoundaryEvidenceFeatures(input, { measureIndex: 0, offsetTicks: 960 })).toEqual([1, 1, 0, 0.17, 1]);
  });

  it("uses dotted-quarter metric strength in compound meter", () => {
    const input = createHarmonyAnalysisInput({
      ticksPerQuarter: 480,
      measures: [{ index: 0, durationTicks: 1440, timeSignature: { numerator: 6, denominator: 8 } }],
      tracks: [],
    });

    expect(createBoundaryEvidenceFeatures(input, { measureIndex: 0, offsetTicks: 720 })[0]).toBe(1);
    expect(createBoundaryEvidenceFeatures(input, { measureIndex: 0, offsetTicks: 240 })[0]).toBe(0.33);
  });
});
