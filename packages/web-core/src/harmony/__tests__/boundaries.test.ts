import { describe, expect, it } from "vitest";
import { buildLegalBoundaryLattice } from "../boundaries";

describe("harmony legal boundaries", () => {
  it("keeps mandatory measure/note boundaries and applies a deterministic cap", () => {
    const result = buildLegalBoundaryLattice({
      ticksPerQuarter: 960,
      measures: [{ index: 0, durationTicks: 3840, timeSignature: { numerator: 4, denominator: 4 } }],
      tracks: [
        {
          id: "piano",
          isPercussion: false,
          staves: [
            {
              index: 0,
              notes: [
                {
                  id: "n",
                  moment: { measureIndex: 0, offsetTicks: 960 },
                  durationTicks: 960,
                  soundingPitchClass: 0,
                  voice: 1,
                },
              ],
            },
          ],
        },
      ],
      mandatory: [{ measureIndex: 0, offsetTicks: 2400 }],
      maxOptionalPerMeasure: 2,
    });
    expect(result.moments).toEqual([
      { measureIndex: 0, offsetTicks: 0 },
      { measureIndex: 0, offsetTicks: 960 },
      { measureIndex: 0, offsetTicks: 1920 },
      { measureIndex: 0, offsetTicks: 2400 },
      { measureIndex: 0, offsetTicks: 3840 },
    ]);
  });
});
