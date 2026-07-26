import type { LoopRegion, LoopSnapMode, MusicalPosition, PlaybackTimelineMap } from "./types";

export function normalizePlaybackSpeed(value: number): number {
  const clamped = Math.min(2, Math.max(0.25, value));
  return Number((Math.round(clamped / 0.05) * 0.05).toFixed(2));
}

export function normalizeScorePlaybackSpeed(value: number): number {
  return Number(Math.min(2, Math.max(0.25, value)).toFixed(4));
}

export function snapMusicalPosition(
  position: MusicalPosition,
  mode: LoopSnapMode,
  timeline: PlaybackTimelineMap,
): MusicalPosition {
  if (mode === "off") return position;

  const measure =
    timeline.measures.find((item) => item.id === position.measureId) ??
    timeline.measures.find((item) => item.index === position.measureIndex);
  if (!measure) return position;

  const isFinalMeasure = measure.startTick + measure.durationTicks === timeline.durationTicks;
  const candidates =
    mode === "measure"
      ? [measure.startTick]
      : isFinalMeasure
        ? [...measure.beatTicks, timeline.durationTicks]
        : measure.beatTicks;
  const tick = candidates.reduce(
    (best, candidate) => (Math.abs(candidate - position.tick) < Math.abs(best - position.tick) ? candidate : best),
    candidates[0] ?? measure.startTick,
  );
  const beatIndex =
    tick === timeline.durationTicks
      ? Math.max(0, measure.beatTicks.length - 1)
      : Math.max(0, measure.beatTicks.indexOf(tick));

  return {
    ...position,
    measureId: measure.id,
    measureIndex: measure.index,
    beatIndex,
    tick,
  };
}

export function createLoopRegion(input: {
  id: string;
  start: MusicalPosition;
  end: MusicalPosition;
  now: string;
  label?: string;
  snapMode?: LoopSnapMode;
  speedOverride?: number;
}): LoopRegion {
  if (input.start.tick >= input.end.tick) {
    throw new Error("Loop start must be before loop end");
  }

  const normalizedLabel = input.label?.trim();
  if (normalizedLabel !== undefined && normalizedLabel.length === 0) {
    throw new Error("Loop label cannot be empty");
  }
  const common = {
    id: input.id,
    start: input.start,
    end: input.end,
    snapMode: input.snapMode ?? "beat",
    createdAt: input.now,
    updatedAt: input.now,
  };
  const region: LoopRegion =
    normalizedLabel === undefined
      ? { ...common, labelSource: "generated" }
      : { ...common, label: normalizedLabel, labelSource: "user" };

  if (input.speedOverride !== undefined) {
    region.speedOverride = normalizePlaybackSpeed(input.speedOverride);
  }

  return region;
}

export function getEffectivePlaybackSpeed(scoreSpeed: number, loop: { speedOverride?: number | undefined }): number {
  return loop.speedOverride === undefined
    ? normalizeScorePlaybackSpeed(scoreSpeed)
    : normalizePlaybackSpeed(loop.speedOverride);
}

export function musicalPositionFromTick(tick: number, timeMs: number, timeline: PlaybackTimelineMap): MusicalPosition {
  const measure = [...timeline.measures].reverse().find((item) => item.startTick <= tick) ?? timeline.measures[0];

  if (!measure) {
    return {
      measureId: "measure-0",
      measureIndex: 0,
      beatIndex: 0,
      tick,
      cachedTimeMs: timeMs,
    };
  }

  const reversedIndex = [...measure.beatTicks].reverse().findIndex((beatTick) => beatTick <= tick);
  const beatIndex = reversedIndex < 0 ? 0 : measure.beatTicks.length - 1 - reversedIndex;

  return {
    measureId: measure.id,
    measureIndex: measure.index,
    beatIndex,
    tick,
    cachedTimeMs: timeMs,
  };
}
