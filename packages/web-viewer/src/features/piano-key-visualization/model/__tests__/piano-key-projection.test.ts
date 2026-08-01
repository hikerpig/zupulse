import { describe, expect, it } from "vitest";
import type { PianoKeyHintEvent } from "@zupulse/web-core";
import { createPianoKeyFrameProjector, PIANO_KEY_LOOKAHEAD_TICKS, projectPianoKeyFrame } from "../piano-key-projection";

describe("projectPianoKeyFrame", () => {
  it("uses a four-quarter-note lookahead and half-open active intervals", () => {
    const events: PianoKeyHintEvent[] = [
      { pitch: 60, startTick: 100, endTick: 580, hand: "right" },
      { pitch: 64, startTick: PIANO_KEY_LOOKAHEAD_TICKS, endTick: 4320, hand: "right" },
      { pitch: 67, startTick: PIANO_KEY_LOOKAHEAD_TICKS + 1, endTick: 4321, hand: "right" },
    ];

    expect(projectPianoKeyFrame(events, 99, "both-hands").activePitches).toEqual([]);
    expect(projectPianoKeyFrame(events, 100, "both-hands").activePitches).toEqual([60]);
    expect(projectPianoKeyFrame(events, 580, "both-hands").activePitches).not.toContain(60);
    expect(projectPianoKeyFrame(events, 0, "both-hands").hints.map((hint) => hint.pitch)).toEqual([60, 64]);
  });

  it("preserves duration ratios and keeps overlapping occurrences active until the last end", () => {
    const events: PianoKeyHintEvent[] = [
      { pitch: 60, startTick: 0, endTick: 960, hand: "right" },
      { pitch: 60, startTick: 480, endTick: 1440, hand: "right" },
      { pitch: 64, startTick: 480, endTick: 1440, hand: "right" },
    ];

    const frame = projectPianoKeyFrame(events, 480, "both-hands");
    expect(frame.activePitches).toEqual([60, 64]);
    expect(frame.hints.find((hint) => hint.pitch === 64)).toMatchObject({
      startRatio: 0,
      endRatio: 0.25,
    });
    expect(projectPianoKeyFrame(events, 960, "both-hands").activePitches).toEqual([60, 64]);
    expect(projectPianoKeyFrame(events, 1440, "both-hands").activePitches).toEqual([]);
  });

  it("shows both hands or only the selected practice target", () => {
    const events: PianoKeyHintEvent[] = [
      { pitch: 60, startTick: 0, endTick: 960, hand: "left" },
      { pitch: 72, startTick: 0, endTick: 960, hand: "right" },
    ];

    expect(projectPianoKeyFrame(events, 0, "both-hands").hints.map((hint) => hint.hand)).toEqual(["left", "right"]);
    expect(projectPianoKeyFrame(events, 0, "right-hand").hints.map((hint) => hint.hand)).toEqual(["right"]);
    expect(projectPianoKeyFrame(events, 0, "left-hand").hints.map((hint) => hint.hand)).toEqual(["left"]);
  });

  it("indexes once and projects a local time window without rescanning distant events", () => {
    let startReads = 0;
    let endReads = 0;
    const events = Array.from({ length: 10_000 }, (_, index) => ({
      pitch: 21 + (index % 88),
      get startTick() {
        startReads += 1;
        return index * 120;
      },
      get endTick() {
        endReads += 1;
        return index * 120 + 240;
      },
      hand: index % 2 === 0 ? ("right" as const) : ("left" as const),
    }));
    const projector = createPianoKeyFrameProjector(events);
    startReads = 0;
    endReads = 0;

    const frame = projector.project(1_000_000, "both-hands");

    expect(frame.hints.length).toBeGreaterThan(0);
    expect(startReads).toBeLessThan(500);
    expect(endReads).toBeLessThan(500);
  });
});
