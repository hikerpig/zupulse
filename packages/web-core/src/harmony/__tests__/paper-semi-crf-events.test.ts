import { describe, expect, it } from "vitest";
import { createHarmonyAnalysisInput } from "../analysisInput";
import { buildPaperSemiCrfEvents } from "../paper-semi-crf-events";

describe("paper semi-CRF basic events", () => {
  it("partitions adjacent note onset/offset points and keeps sounding-note evidence", () => {
    const input = createHarmonyAnalysisInput({
      ticksPerQuarter: 960,
      measures: [
        { index: 0, durationTicks: 3840, timeSignature: { numerator: 4, denominator: 4 } },
        { index: 1, durationTicks: 3840, timeSignature: { numerator: 4, denominator: 4 } },
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
                  id: "c4",
                  moment: { measureIndex: 0, offsetTicks: 0 },
                  durationTicks: 1920,
                  soundingPitchClass: 0,
                  soundingMidi: 60,
                  voice: 1,
                },
                {
                  id: "g3",
                  moment: { measureIndex: 0, offsetTicks: 0 },
                  durationTicks: 3840,
                  soundingPitchClass: 7,
                  soundingMidi: 55,
                  voice: 2,
                },
                {
                  id: "e4",
                  moment: { measureIndex: 0, offsetTicks: 960 },
                  durationTicks: 960,
                  soundingPitchClass: 4,
                  soundingMidi: 64,
                  voice: 1,
                },
              ],
            },
          ],
        },
      ],
    });

    const events = buildPaperSemiCrfEvents(input, { includedTrackIds: ["piano"] });

    expect(events.map((event) => event.range)).toEqual([
      {
        start: { measureIndex: 0, offsetTicks: 0 },
        end: { measureIndex: 0, offsetTicks: 960 },
      },
      {
        start: { measureIndex: 0, offsetTicks: 960 },
        end: { measureIndex: 0, offsetTicks: 1920 },
      },
      {
        start: { measureIndex: 0, offsetTicks: 1920 },
        end: { measureIndex: 1, offsetTicks: 0 },
      },
    ]);
    expect(events[1]).toMatchObject({
      index: 1,
      durationTicks: 960,
      metricAccent: 0.25,
      bassPitchClass: 7,
    });
    expect(
      events[1]?.notes.map((note) => ({
        id: note.id,
        durationTicks: note.durationTicks,
        sourceDurationTicks: note.sourceDurationTicks,
        heldFromPrevious: note.heldFromPrevious,
        isBass: note.isBass,
      })),
    ).toEqual([
      {
        id: "c4",
        durationTicks: 960,
        sourceDurationTicks: 1920,
        heldFromPrevious: true,
        isBass: false,
      },
      {
        id: "g3",
        durationTicks: 960,
        sourceDurationTicks: 3840,
        heldFromPrevious: true,
        isBass: true,
      },
      {
        id: "e4",
        durationTicks: 960,
        sourceDurationTicks: 960,
        heldFromPrevious: false,
        isBass: false,
      },
    ]);
  });

  it("uses only scoped pitched non-percussion notes and preserves rest events", () => {
    const input = createHarmonyAnalysisInput({
      ticksPerQuarter: 960,
      measures: [{ index: 3, durationTicks: 3840, timeSignature: { numerator: 4, denominator: 4 } }],
      tracks: [
        {
          id: "included",
          name: "Included",
          isPercussion: false,
          staves: [
            {
              index: 0,
              notes: [
                {
                  id: "first",
                  moment: { measureIndex: 3, offsetTicks: 0 },
                  durationTicks: 480,
                  soundingPitchClass: 0,
                  soundingMidi: 60,
                  voice: 1,
                },
                {
                  id: "second",
                  moment: { measureIndex: 3, offsetTicks: 960 },
                  durationTicks: 480,
                  soundingPitchClass: 7,
                  soundingMidi: 67,
                  voice: 1,
                },
                {
                  id: "pitchless",
                  moment: { measureIndex: 3, offsetTicks: 240 },
                  durationTicks: 240,
                  voice: 1,
                },
              ],
            },
          ],
        },
        {
          id: "excluded",
          name: "Excluded",
          isPercussion: false,
          staves: [
            {
              index: 0,
              notes: [
                {
                  id: "excluded-note",
                  moment: { measureIndex: 3, offsetTicks: 120 },
                  durationTicks: 120,
                  soundingPitchClass: 2,
                  voice: 1,
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
              notes: [
                {
                  id: "drum-note",
                  moment: { measureIndex: 3, offsetTicks: 240 },
                  durationTicks: 240,
                  soundingPitchClass: 9,
                  voice: 1,
                },
              ],
            },
          ],
        },
      ],
    });

    const events = buildPaperSemiCrfEvents(input, { includedTrackIds: ["included", "drums"] });

    expect(events).toHaveLength(3);
    expect(events[1]).toMatchObject({
      range: {
        start: { measureIndex: 3, offsetTicks: 480 },
        end: { measureIndex: 3, offsetTicks: 960 },
      },
      durationTicks: 480,
      notes: [],
    });
  });

  it("canonicalizes note offsets across measures without adding measure or gold boundaries", () => {
    const input = createHarmonyAnalysisInput({
      ticksPerQuarter: 960,
      measures: [
        { index: 4, durationTicks: 3840, timeSignature: { numerator: 4, denominator: 4 } },
        { index: 8, durationTicks: 2880, timeSignature: { numerator: 3, denominator: 4 } },
      ],
      tracks: [
        {
          id: "strings",
          name: "Strings",
          isPercussion: false,
          staves: [
            {
              index: 0,
              notes: [
                {
                  id: "across",
                  moment: { measureIndex: 4, offsetTicks: 3600 },
                  durationTicks: 480,
                  soundingPitchClass: 9,
                  soundingMidi: 57,
                  voice: 1,
                },
                {
                  id: "next",
                  moment: { measureIndex: 8, offsetTicks: 240 },
                  durationTicks: 480,
                  soundingPitchClass: 0,
                  soundingMidi: 60,
                  voice: 1,
                },
              ],
            },
          ],
        },
      ],
    });

    const events = buildPaperSemiCrfEvents(input, { includedTrackIds: ["strings"] });

    expect(events.map((event) => event.range)).toEqual([
      {
        start: { measureIndex: 4, offsetTicks: 3600 },
        end: { measureIndex: 8, offsetTicks: 240 },
      },
      {
        start: { measureIndex: 8, offsetTicks: 240 },
        end: { measureIndex: 8, offsetTicks: 720 },
      },
    ]);
    expect(events[0]?.notes[0]).toMatchObject({
      id: "across",
      durationTicks: 480,
      heldFromPrevious: false,
    });
  });
});
