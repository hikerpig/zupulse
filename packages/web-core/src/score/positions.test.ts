import { describe, expect, it } from "vitest";
import { PositionMap, type PlaybackOccurrence, type WrittenPosition } from "./positions";

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
});
