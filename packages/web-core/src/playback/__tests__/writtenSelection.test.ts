import { describe, expect, it } from "vitest";
import { playbackPositionForWrittenSelection } from "../writtenSelection";

const measures = [
  { id: "measure-0", index: 0, startTick: 0, durationTicks: 1920, beatTicks: [0, 480, 960, 1440] },
  {
    id: "measure-1",
    index: 1,
    startTick: 1920,
    durationTicks: 1920,
    beatTicks: [1920, 2400, 2880, 3360],
  },
];

describe("playbackPositionForWrittenSelection", () => {
  it("maps a written beat without carrying the current within-measure offset", () => {
    expect(
      playbackPositionForWrittenSelection(
        { measureIndex: 0, offsetTicks: 480 },
        { measureId: "measure-1", measureIndex: 1, beatIndex: 1, tick: 2400, cachedTimeMs: 2500 },
        { durationTicks: 3840, durationMs: 4000, measures },
      ),
    ).toEqual({
      measureId: "measure-0",
      measureIndex: 0,
      beatIndex: 1,
      tick: 480,
      cachedTimeMs: 500,
    });
  });

  it("keeps the current playback occurrence while mapping a repeated written beat", () => {
    expect(
      playbackPositionForWrittenSelection(
        { measureIndex: 0, offsetTicks: 480 },
        { measureId: "measure-1", measureIndex: 1, beatIndex: 1, tick: 6240, cachedTimeMs: 6500 },
        { durationTicks: 7680, durationMs: 8000, measures },
      ),
    ).toEqual({
      measureId: "measure-0",
      measureIndex: 0,
      beatIndex: 1,
      tick: 4320,
      cachedTimeMs: 4500,
    });
  });
});
