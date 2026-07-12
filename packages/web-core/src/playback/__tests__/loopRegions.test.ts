import { describe, expect, it } from "vitest";
import {
  createLoopRegion,
  getEffectivePlaybackSpeed,
  musicalPositionFromTick,
  normalizePlaybackSpeed,
  snapMusicalPosition,
} from "../loopRegions";
import type { PlaybackTimelineMap } from "../types";

const timeline: PlaybackTimelineMap = {
  durationTicks: 3840,
  durationMs: 8000,
  measures: [
    {
      id: "measure-0",
      index: 0,
      startTick: 0,
      durationTicks: 1920,
      beatTicks: [0, 480, 960, 1440],
    },
    {
      id: "measure-1",
      index: 1,
      startTick: 1920,
      durationTicks: 1920,
      beatTicks: [1920, 2400, 2880, 3360],
    },
  ],
};

describe("normalizePlaybackSpeed", () => {
  it("clamps to 25%-200% and snaps to 5%", () => {
    expect(normalizePlaybackSpeed(0.1)).toBe(0.25);
    expect(normalizePlaybackSpeed(0.773)).toBe(0.75);
    expect(normalizePlaybackSpeed(2.4)).toBe(2);
  });
});

describe("musical positions", () => {
  const position = {
    measureId: "measure-0",
    measureIndex: 0,
    beatIndex: 1,
    tick: 731,
    cachedTimeMs: 1500,
  };

  it("supports off, beat, and measure snapping", () => {
    expect(snapMusicalPosition(position, "off", timeline).tick).toBe(731);
    expect(snapMusicalPosition(position, "beat", timeline).tick).toBe(960);
    expect(snapMusicalPosition(position, "measure", timeline).tick).toBe(0);
  });

  it("maps an engine tick back to its measure and beat", () => {
    expect(musicalPositionFromTick(2500, 5200, timeline)).toEqual({
      measureId: "measure-1",
      measureIndex: 1,
      beatIndex: 1,
      tick: 2500,
      cachedTimeMs: 5200,
    });
  });
});

describe("createLoopRegion", () => {
  it("rejects reversed boundaries and generates a one-based label", () => {
    const start = {
      measureId: "measure-0",
      measureIndex: 0,
      beatIndex: 0,
      tick: 0,
      cachedTimeMs: 0,
    };
    const end = {
      measureId: "measure-1",
      measureIndex: 1,
      beatIndex: 3,
      tick: 3360,
      cachedTimeMs: 7000,
    };

    expect(() => createLoopRegion({ id: "bad", start: end, end: start, now: "2026-07-10T00:00:00Z" })).toThrow(
      "Loop start must be before loop end",
    );
    expect(createLoopRegion({ id: "loop-1", start, end, now: "2026-07-10T00:00:00Z" }).label).toBe("小节 1–2");
  });

  it("uses a loop speed override before the score speed", () => {
    expect(getEffectivePlaybackSpeed(0.8, { speedOverride: 0.55 })).toBe(0.55);
    expect(getEffectivePlaybackSpeed(0.8, {})).toBe(0.8);
  });
});
