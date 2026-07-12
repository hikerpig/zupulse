import { describe, expect, it } from "vitest";
import { getDefaultVisibleTrackIds, projectAlphaTabScore } from "./alphaTabProjection";

describe("alphaTab MusicXML projection", () => {
  it("keeps multiple staves inside one part track", () => {
    const output = projectAlphaTabScore({ title: "Piano", tracks: [{ name: "Piano", staves: [{}, {}] }], masterBars: [{ start: 0, duration: 960 }] });
    expect(output.document.tracks).toHaveLength(1);
    expect(output.document.tracks[0]?.staves).toHaveLength(2);
    expect(output.capabilities.playback).toBe(true);
  });
  it("shows all small scores and the first non-percussion part in large scores", () => {
    expect(getDefaultVisibleTrackIds({ tracks: [{}, {}, {}, {}] })).toHaveLength(4);
    expect(getDefaultVisibleTrackIds({ tracks: [{ playbackInfo: { isPercussion: true } }, {}, {}, {}, {}] })).toEqual(["track-2"]);
  });
});
