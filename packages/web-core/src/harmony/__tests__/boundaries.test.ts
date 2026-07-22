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

  it("represents a barline once using the following measure start", () => {
    const result = buildLegalBoundaryLattice({
      ticksPerQuarter: 480,
      measures: [
        { index: 0, durationTicks: 1920, timeSignature: { numerator: 4, denominator: 4 } },
        { index: 1, durationTicks: 1920, timeSignature: { numerator: 4, denominator: 4 } },
      ],
      tracks: [],
      maxOptionalPerMeasure: 0,
    });

    expect(result.moments).toEqual([
      { measureIndex: 0, offsetTicks: 0 },
      { measureIndex: 1, offsetTicks: 0 },
      { measureIndex: 1, offsetTicks: 1920 },
    ]);
  });

  it("keeps only musical beats and mandatory boundaries in metric policy", () => {
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
                  id: "offbeat",
                  moment: { measureIndex: 0, offsetTicks: 240 },
                  durationTicks: 240,
                  soundingPitchClass: 0,
                  voice: 1,
                },
              ],
            },
          ],
        },
      ],
      mandatory: [{ measureIndex: 0, offsetTicks: 2400 }],
      policy: "metric-beats",
    });

    expect(result.moments).toEqual([
      { measureIndex: 0, offsetTicks: 0 },
      { measureIndex: 0, offsetTicks: 960 },
      { measureIndex: 0, offsetTicks: 1920 },
      { measureIndex: 0, offsetTicks: 2400 },
      { measureIndex: 0, offsetTicks: 2880 },
      { measureIndex: 0, offsetTicks: 3840 },
    ]);
  });

  it("uses dotted-quarter pulses for compound meter and respects a short pickup", () => {
    const compound = buildLegalBoundaryLattice({
      ticksPerQuarter: 960,
      measures: [{ index: 0, durationTicks: 2880, timeSignature: { numerator: 6, denominator: 8 } }],
      tracks: [],
      policy: "metric-beats",
    });
    const pickup = buildLegalBoundaryLattice({
      ticksPerQuarter: 960,
      measures: [{ index: 0, durationTicks: 480, timeSignature: { numerator: 4, denominator: 4 } }],
      tracks: [],
      policy: "metric-beats",
    });

    expect(compound.moments).toEqual([
      { measureIndex: 0, offsetTicks: 0 },
      { measureIndex: 0, offsetTicks: 1440 },
      { measureIndex: 0, offsetTicks: 2880 },
    ]);
    expect(pickup.moments).toEqual([
      { measureIndex: 0, offsetTicks: 0 },
      { measureIndex: 0, offsetTicks: 480 },
    ]);
  });
});
