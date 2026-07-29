import { describe, expect, it } from "vitest";
import { resolvePianoHandMapping } from "../pianoHandMapping";
import type { PlaybackTrack } from "../types";

describe("resolvePianoHandMapping", () => {
  it("maps an unambiguous two-staff track by stable structural IDs", () => {
    expect(
      resolvePianoHandMapping([
        track(0, [
          { id: "track-0:staff-0", sourceIndex: 0, isPercussion: false },
          { id: "track-0:staff-1", sourceIndex: 1, isPercussion: false },
        ]),
      ]),
    ).toEqual({
      availability: "available",
      mapping: {
        trackId: "track-0",
        rightStaffId: "track-0:staff-0",
        leftStaffId: "track-0:staff-1",
      },
    });
  });

  it("rejects two independent single-staff tracks as ambiguous", () => {
    expect(
      resolvePianoHandMapping([
        track(0, [{ id: "track-0:staff-0", sourceIndex: 0, isPercussion: false }]),
        track(1, [{ id: "track-1:staff-0", sourceIndex: 0, isPercussion: false }]),
      ]),
    ).toEqual({
      availability: "ambiguous",
      code: "piano-hand-practice-ambiguous",
    });
  });

  it("rejects percussion and non-two-staff structures as not applicable", () => {
    expect(
      resolvePianoHandMapping([
        track(0, [
          { id: "track-0:staff-0", sourceIndex: 0, isPercussion: false },
          { id: "track-0:staff-1", sourceIndex: 1, isPercussion: true },
        ]),
      ]),
    ).toEqual({
      availability: "not-applicable",
      code: "piano-hand-practice-not-applicable",
    });
  });
});

function track(sourceIndex: number, staves: NonNullable<PlaybackTrack["staves"]>): PlaybackTrack {
  return {
    id: `track-${sourceIndex}`,
    sourceIndex,
    staves,
  };
}
