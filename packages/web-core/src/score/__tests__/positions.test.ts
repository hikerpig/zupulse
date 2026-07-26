import { describe, expect, it } from "vitest";
import { PositionMap, type PlaybackOccurrence, type WrittenPosition } from "../positions";

const written: WrittenPosition = { schemaVersion: 1, trackId: "track-1", measureIndex: 2, beatIndex: 0, tick: 0 };
const occurrence = (timelineTick: number, occurrenceIndex: number, path: number[]): PlaybackOccurrence => ({
  schemaVersion: 1,
  written,
  timelineTick,
  occurrenceIndex,
  path,
});
describe("position mapping", () => {
  it("distinguishes repeat occurrences and falls back to written position", () => {
    const map = new PositionMap([occurrence(960, 0, [0]), occurrence(2880, 1, [1])]);
    expect(map.occurrencesFor(written)).toHaveLength(2);
    expect(map.restore(occurrence(9999, 2, [9]))?.timelineTick).toBe(960);
  });

  it("keeps backward selections in the current repeat occurrence", () => {
    const map = new PositionMap([occurrence(960, 0, [0]), occurrence(2880, 1, [1]), occurrence(4800, 2, [2])]);

    expect(map.resolve(written, 960)?.timelineTick).toBe(960);
    expect(map.resolve(written, 1000)?.timelineTick).toBe(960);
    expect(map.resolve(written, 3000)?.timelineTick).toBe(2880);
    expect(map.resolve(written, 5000)?.timelineTick).toBe(4800);
  });

  it("uses the next occurrence when playback has not reached the selected position in the current path", () => {
    const earlier: WrittenPosition = { ...written, beatIndex: 1, tick: 480 };
    const map = new PositionMap([
      { ...occurrence(960, 0, [0]), written: earlier },
      occurrence(1440, 0, [0]),
      { ...occurrence(2880, 1, [1]), written: earlier },
      occurrence(3360, 1, [1]),
    ]);

    expect(map.resolve(written, 1000)?.timelineTick).toBe(1440);
  });
});
