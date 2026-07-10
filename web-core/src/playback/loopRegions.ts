import type {
  LoopRegion,
  LoopSnapMode,
  MusicalPosition,
  PlaybackTimelineMap,
} from "./types";

export function normalizePlaybackSpeed(value: number): number {
  const clamped = Math.min(2, Math.max(0.25, value));
  return Number((Math.round(clamped / 0.05) * 0.05).toFixed(2));
}

export function snapMusicalPosition(
  position: MusicalPosition,
  mode: LoopSnapMode,
  timeline: PlaybackTimelineMap,
): MusicalPosition {
  if (mode === "off") return position;

  const measure = timeline.measures.find(item => item.id === position.measureId)
    ?? timeline.measures.find(item => item.index === position.measureIndex);
  if (!measure) return position;

  const candidates = mode === "measure" ? [measure.startTick] : measure.beatTicks;
  const tick = candidates.reduce(
    (best, candidate) => Math.abs(candidate - position.tick) < Math.abs(best - position.tick)
      ? candidate
      : best,
    candidates[0] ?? measure.startTick,
  );

  return {
    ...position,
    measureId: measure.id,
    measureIndex: measure.index,
    beatIndex: Math.max(0, measure.beatTicks.indexOf(tick)),
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

  const region: LoopRegion = {
    id: input.id,
    label: input.label ?? `小节 ${input.start.measureIndex + 1}–${input.end.measureIndex + 1}`,
    labelSource: input.label === undefined ? "generated" : "user",
    start: input.start,
    end: input.end,
    snapMode: input.snapMode ?? "beat",
    createdAt: input.now,
    updatedAt: input.now,
  };

  if (input.speedOverride !== undefined) {
    region.speedOverride = normalizePlaybackSpeed(input.speedOverride);
  }

  return region;
}

export function getEffectivePlaybackSpeed(
  scoreSpeed: number,
  loop: { speedOverride?: number },
): number {
  return normalizePlaybackSpeed(loop.speedOverride ?? scoreSpeed);
}

export function musicalPositionFromTick(
  tick: number,
  timeMs: number,
  timeline: PlaybackTimelineMap,
): MusicalPosition {
  const measure = [...timeline.measures].reverse()
    .find(item => item.startTick <= tick) ?? timeline.measures[0];

  if (!measure) {
    return {
      measureId: "measure-0",
      measureIndex: 0,
      beatIndex: 0,
      tick,
      cachedTimeMs: timeMs,
    };
  }

  const reversedIndex = [...measure.beatTicks].reverse()
    .findIndex(beatTick => beatTick <= tick);
  const beatIndex = reversedIndex < 0 ? 0 : measure.beatTicks.length - 1 - reversedIndex;

  return {
    measureId: measure.id,
    measureIndex: measure.index,
    beatIndex,
    tick,
    cachedTimeMs: timeMs,
  };
}
