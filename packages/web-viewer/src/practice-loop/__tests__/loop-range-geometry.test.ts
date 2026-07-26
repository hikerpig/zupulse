import { describe, expect, it } from "vitest";
import type { PlaybackTimelineMap } from "@zupulse/web-core";
import {
  moveLoopBoundaryByBeat,
  positionFromLoopPoint,
  projectLoopRange,
  type ScoreMeasureBounds,
} from "../loop-range-geometry";

const measures: ScoreMeasureBounds[] = [
  {
    systemIndex: 0,
    measureIndex: 0,
    x: 20,
    y: 40,
    width: 160,
    height: 140,
    systemX: 20,
    systemY: 40,
    systemWidth: 320,
    systemHeight: 140,
  },
  {
    systemIndex: 0,
    measureIndex: 1,
    x: 180,
    y: 40,
    width: 160,
    height: 140,
    systemX: 20,
    systemY: 40,
    systemWidth: 320,
    systemHeight: 140,
  },
  {
    systemIndex: 1,
    measureIndex: 2,
    x: 20,
    y: 220,
    width: 320,
    height: 140,
    systemX: 20,
    systemY: 220,
    systemWidth: 320,
    systemHeight: 140,
  },
];

const timeline: PlaybackTimelineMap = {
  durationTicks: 5760,
  durationMs: 12_000,
  measures: [
    { id: "measure-0", index: 0, startTick: 0, durationTicks: 1920, beatTicks: [0, 480, 960, 1440] },
    { id: "measure-1", index: 1, startTick: 1920, durationTicks: 1920, beatTicks: [1920, 2400, 2880, 3360] },
    { id: "measure-2", index: 2, startTick: 3840, durationTicks: 1920, beatTicks: [3840, 4320, 4800, 5280] },
  ],
};

describe("loop range score geometry", () => {
  it("projects A/B handles and a multi-system selected passage", () => {
    expect(projectLoopRange(position(480), position(4800), measures, timeline)).toEqual({
      start: { x: 60, y: 40, height: 140, systemIndex: 0 },
      end: { x: 180, y: 220, height: 140, systemIndex: 1 },
      segments: [
        { systemIndex: 0, x: 60, y: 40, width: 280, height: 140 },
        { systemIndex: 1, x: 20, y: 220, width: 160, height: 140 },
      ],
    });
  });

  it("maps a pointer back to the nearest rendered measure and timeline position", () => {
    expect(positionFromLoopPoint(260, 290, measures, timeline)).toMatchObject({
      measureId: "measure-2",
      measureIndex: 2,
      tick: 5280,
      beatIndex: 3,
    });
  });

  it("moves keyboard adjustments through musical beats instead of arbitrary pixels", () => {
    expect(moveLoopBoundaryByBeat(position(960), 1, timeline).tick).toBe(1440);
    expect(moveLoopBoundaryByBeat(position(960), -1, timeline).tick).toBe(480);
    expect(moveLoopBoundaryByBeat(position(0), -1, timeline).tick).toBe(0);
    expect(moveLoopBoundaryByBeat(position(5280), 1, timeline).tick).toBe(5760);
  });
});

function position(tick: number) {
  const measure = [...timeline.measures].reverse().find((item) => item.startTick <= tick) ?? timeline.measures[0]!;
  return {
    measureId: measure.id,
    measureIndex: measure.index,
    beatIndex: Math.max(
      0,
      [...measure.beatTicks].reverse().findIndex((beatTick) => beatTick <= tick) < 0
        ? 0
        : measure.beatTicks.length - 1 - [...measure.beatTicks].reverse().findIndex((beatTick) => beatTick <= tick),
    ),
    tick,
    cachedTimeMs: (tick / timeline.durationTicks) * timeline.durationMs,
  };
}
