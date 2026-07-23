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

  it("supports a deterministic half-beat compromise without note-event boundaries", () => {
    const simple = buildLegalBoundaryLattice({
      ticksPerQuarter: 960,
      measures: [{ index: 0, durationTicks: 1920, timeSignature: { numerator: 2, denominator: 4 } }],
      tracks: [],
      policy: "metric-half-beats",
    });
    const compound = buildLegalBoundaryLattice({
      ticksPerQuarter: 960,
      measures: [{ index: 0, durationTicks: 2880, timeSignature: { numerator: 6, denominator: 8 } }],
      tracks: [],
      policy: "metric-half-beats",
    });

    expect(simple.moments.map((moment) => moment.offsetTicks)).toEqual([0, 480, 960, 1440, 1920]);
    expect(compound.moments.map((moment) => moment.offsetTicks)).toEqual([0, 720, 1440, 2160, 2880]);
  });

  it("restores only simultaneous multi-pitch onsets in strong-onset policy", () => {
    const result = buildLegalBoundaryLattice({
      ticksPerQuarter: 480,
      measures: [{ index: 0, durationTicks: 960, timeSignature: { numerator: 2, denominator: 4 } }],
      tracks: [
        {
          id: "piano",
          isPercussion: false,
          staves: [
            {
              index: 0,
              notes: [
                {
                  id: "single",
                  moment: { measureIndex: 0, offsetTicks: 120 },
                  durationTicks: 120,
                  soundingPitchClass: 7,
                  voice: 1,
                },
                {
                  id: "octave-a",
                  moment: { measureIndex: 0, offsetTicks: 240 },
                  durationTicks: 120,
                  soundingPitchClass: 0,
                  voice: 1,
                },
                {
                  id: "octave-b",
                  moment: { measureIndex: 0, offsetTicks: 240 },
                  durationTicks: 120,
                  soundingPitchClass: 0,
                  voice: 2,
                },
                {
                  id: "chord-a",
                  moment: { measureIndex: 0, offsetTicks: 360 },
                  durationTicks: 120,
                  soundingPitchClass: 0,
                  voice: 1,
                },
                {
                  id: "chord-b",
                  moment: { measureIndex: 0, offsetTicks: 360 },
                  durationTicks: 120,
                  soundingPitchClass: 4,
                  voice: 2,
                },
              ],
            },
          ],
        },
      ],
      policy: "metric-strong-onsets",
    });

    expect(result.moments.map((moment) => moment.offsetTicks)).toEqual([0, 360, 480, 960]);
  });

  it("keeps metric boundaries and only model-accepted note events in learned policy", () => {
    const result = buildLegalBoundaryLattice({
      ticksPerQuarter: 480,
      measures: [{ index: 0, durationTicks: 960, timeSignature: { numerator: 2, denominator: 4 } }],
      tracks: [
        {
          id: "piano",
          isPercussion: false,
          staves: [
            {
              index: 0,
              notes: [
                {
                  id: "old",
                  moment: { measureIndex: 0, offsetTicks: 0 },
                  durationTicks: 360,
                  soundingPitchClass: 0,
                  soundingMidi: 48,
                  voice: 1,
                },
                {
                  id: "passing",
                  moment: { measureIndex: 0, offsetTicks: 120 },
                  durationTicks: 120,
                  soundingPitchClass: 7,
                  soundingMidi: 67,
                  voice: 2,
                },
                {
                  id: "new",
                  moment: { measureIndex: 0, offsetTicks: 360 },
                  durationTicks: 360,
                  soundingPitchClass: 2,
                  soundingMidi: 50,
                  voice: 1,
                },
              ],
            },
          ],
        },
      ],
      policy: "learned-evidence",
      boundaryClassifierModel: {
        schemaVersion: "1.0.0",
        featureVersion: "boundary-evidence-v1",
        weights: [0, 10, 0, 0, 0],
        bias: -5,
        threshold: 0.5,
      },
    });

    expect(result.moments.map((moment) => moment.offsetTicks)).toEqual([0, 360, 480, 960]);
    expect(() =>
      buildLegalBoundaryLattice({
        ticksPerQuarter: 480,
        measures: [{ index: 0, durationTicks: 960, timeSignature: { numerator: 2, denominator: 4 } }],
        tracks: [],
        policy: "learned-evidence",
      }),
    ).toThrow("learned boundary policy requires a classifier model");
  });
});
