import { describe, expect, it } from "vitest";
import { getDefaultVisibleTrackIds, projectAlphaTabHarmonyInput, projectAlphaTabScore } from "../alphaTabProjection";

describe("alphaTab MusicXML projection", () => {
  it("keeps multiple staves inside one part track", () => {
    const output = projectAlphaTabScore({
      title: "Piano",
      tracks: [{ name: "Piano", staves: [{}, {}] }],
      masterBars: [{ start: 0, duration: 960 }],
    });
    expect(output.document.tracks).toHaveLength(1);
    expect(output.document.tracks[0]?.staves).toHaveLength(2);
    expect(output.capabilities.playback).toBe(true);
  });
  it("shows all small scores and the first non-percussion part in large scores", () => {
    expect(getDefaultVisibleTrackIds({ tracks: [{}, {}, {}, {}] })).toHaveLength(4);
    expect(getDefaultVisibleTrackIds({ tracks: [{ playbackInfo: { isPercussion: true } }, {}, {}, {}, {}] })).toEqual([
      "track-2",
    ]);
  });

  it("projects runtime beats into written harmony notes", () => {
    const input = projectAlphaTabHarmonyInput({
      masterBars: [{ duration: 960 }],
      tracks: [
        {
          name: "Piano",
          staves: [
            {
              bars: [
                {
                  voices: [
                    {
                      beats: [{ displayStart: 0, displayDuration: 960, notes: [{ realValue: 60 }, { realValue: 64 }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(input.tracks[0]?.staves[0]?.notes).toMatchObject([
      { moment: { measureIndex: 0, offsetTicks: 0 }, soundingPitchClass: 0 },
      { soundingPitchClass: 4 },
    ]);
  });

  it("uses alphaTab calculated master-bar durations when no duration field exists", () => {
    const input = projectAlphaTabHarmonyInput({
      masterBars: [
        {
          timeSignatureNumerator: 2,
          timeSignatureDenominator: 4,
          calculateDuration: () => 960,
        },
      ],
      tracks: [],
    });

    expect(input.measures[0]?.durationTicks).toBe(960);
  });

  it("projects key-aware source spellings for harmony candidates", () => {
    const input = projectAlphaTabHarmonyInput({
      masterBars: [{ duration: 960 }],
      tracks: [
        {
          name: "Piano",
          staves: [
            {
              bars: [
                {
                  keySignature: -3,
                  voices: [
                    {
                      beats: [
                        {
                          displayStart: 0,
                          displayDuration: 960,
                          notes: [
                            { realValue: 63, accidentalMode: 0 },
                            { realValue: 70, accidentalMode: 5 },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(input.measures[0]).toMatchObject({ key: "fifths:-3" });
    expect(input.tracks[0]?.staves[0]?.notes).toMatchObject([
      { spelling: { step: "E", alter: -1 } },
      { spelling: { step: "B", alter: -1 } },
    ]);
  });
});
