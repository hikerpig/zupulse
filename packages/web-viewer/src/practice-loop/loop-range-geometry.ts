import { musicalPositionFromTick } from "@zupulse/web-core";
import type { MusicalPosition, PlaybackTimelineMap } from "@zupulse/web-core";

export type ScoreMeasureBounds = {
  systemIndex: number;
  measureIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  systemX: number;
  systemY: number;
  systemWidth: number;
  systemHeight: number;
};

export type LoopBoundaryPoint = {
  x: number;
  y: number;
  height: number;
  systemIndex: number;
};

export type LoopRangeSegment = {
  systemIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LoopRangeProjection = {
  start: LoopBoundaryPoint;
  end: LoopBoundaryPoint;
  segments: LoopRangeSegment[];
};

export function projectLoopRange(
  start: MusicalPosition,
  end: MusicalPosition,
  measures: readonly ScoreMeasureBounds[],
  timeline: PlaybackTimelineMap,
): LoopRangeProjection | undefined {
  const startPoint = pointForPosition(start, measures, timeline);
  const endPoint = pointForPosition(end, measures, timeline);
  if (!startPoint || !endPoint) return undefined;

  const rangeStart = comparePoints(startPoint, endPoint) <= 0 ? startPoint : endPoint;
  const rangeEnd = rangeStart === startPoint ? endPoint : startPoint;
  const systems = uniqueSystems(measures).filter(
    (system) => system.systemIndex >= rangeStart.systemIndex && system.systemIndex <= rangeEnd.systemIndex,
  );
  const segments = systems.flatMap((system): LoopRangeSegment[] => {
    const left = system.systemIndex === rangeStart.systemIndex ? rangeStart.x : system.x;
    const right = system.systemIndex === rangeEnd.systemIndex ? rangeEnd.x : system.x + system.width;
    if (right <= left) return [];
    return [
      {
        systemIndex: system.systemIndex,
        x: left,
        y: system.y,
        width: right - left,
        height: system.height,
      },
    ];
  });

  return {
    start: boundaryPoint(startPoint),
    end: boundaryPoint(endPoint),
    segments,
  };
}

export function positionFromLoopPoint(
  x: number,
  y: number,
  measures: readonly ScoreMeasureBounds[],
  timeline: PlaybackTimelineMap,
): MusicalPosition | undefined {
  const nearestSystem = uniqueSystems(measures).reduce<ReturnType<typeof uniqueSystems>[number] | undefined>(
    (nearest, system) =>
      !nearest ||
      distanceToRange(y, system.y, system.y + system.height) < distanceToRange(y, nearest.y, nearest.y + nearest.height)
        ? system
        : nearest,
    undefined,
  );
  if (!nearestSystem) return undefined;
  const systemMeasures = measures.filter((measure) => measure.systemIndex === nearestSystem.systemIndex);
  const measure = systemMeasures.reduce<ScoreMeasureBounds | undefined>(
    (nearest, candidate) =>
      !nearest ||
      distanceToRange(x, candidate.x, candidate.x + candidate.width) <
        distanceToRange(x, nearest.x, nearest.x + nearest.width)
        ? candidate
        : nearest,
    undefined,
  );
  if (!measure) return undefined;
  const timelineMeasure = timeline.measures.find((item) => item.index === measure.measureIndex);
  if (!timelineMeasure) return undefined;
  const ratio = clamp((x - measure.x) / measure.width, 0, 1);
  const tick = Math.round(timelineMeasure.startTick + timelineMeasure.durationTicks * ratio);
  return musicalPositionFromTick(tick, (tick / Math.max(1, timeline.durationTicks)) * timeline.durationMs, timeline);
}

export function moveLoopBoundaryByBeat(
  position: MusicalPosition,
  direction: -1 | 1,
  timeline: PlaybackTimelineMap,
): MusicalPosition {
  const candidates = [
    ...new Set([...timeline.measures.flatMap((measure) => measure.beatTicks), timeline.durationTicks]),
  ].sort((a, b) => a - b);
  const tick =
    direction > 0
      ? (candidates.find((candidate) => candidate > position.tick) ?? timeline.durationTicks)
      : ([...candidates].reverse().find((candidate) => candidate < position.tick) ?? 0);
  return musicalPositionFromTick(tick, (tick / Math.max(1, timeline.durationTicks)) * timeline.durationMs, timeline);
}

type ProjectedPoint = LoopBoundaryPoint;

function pointForPosition(
  position: MusicalPosition,
  measures: readonly ScoreMeasureBounds[],
  timeline: PlaybackTimelineMap,
): ProjectedPoint | undefined {
  const bounds = measures.find((measure) => measure.measureIndex === position.measureIndex);
  const timelineMeasure = timeline.measures.find((measure) => measure.index === position.measureIndex);
  if (!bounds || !timelineMeasure) return undefined;
  const ratio = clamp((position.tick - timelineMeasure.startTick) / Math.max(1, timelineMeasure.durationTicks), 0, 1);
  return {
    x: bounds.x + bounds.width * ratio,
    y: bounds.systemY,
    height: bounds.systemHeight,
    systemIndex: bounds.systemIndex,
  };
}

function uniqueSystems(measures: readonly ScoreMeasureBounds[]) {
  return [
    ...new Map(
      measures.map((measure) => [
        measure.systemIndex,
        {
          systemIndex: measure.systemIndex,
          x: measure.systemX,
          y: measure.systemY,
          width: measure.systemWidth,
          height: measure.systemHeight,
        },
      ]),
    ).values(),
  ].sort((a, b) => a.systemIndex - b.systemIndex);
}

function boundaryPoint(point: ProjectedPoint): LoopBoundaryPoint {
  return { x: point.x, y: point.y, height: point.height, systemIndex: point.systemIndex };
}

function comparePoints(a: LoopBoundaryPoint, b: LoopBoundaryPoint): number {
  return a.systemIndex - b.systemIndex || a.x - b.x;
}

function distanceToRange(value: number, start: number, end: number): number {
  return value < start ? start - value : value > end ? value - end : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
