import type { MusicalPosition, PlaybackTimelineMap } from "./types";

export type WrittenPlaybackSelection = {
  measureIndex: number;
  offsetTicks: number;
};

export function playbackPositionForWrittenSelection(
  selection: WrittenPlaybackSelection,
  current: MusicalPosition,
  timeline: PlaybackTimelineMap,
): MusicalPosition | undefined {
  const measure = timeline.measures.find((candidate) => candidate.index === selection.measureIndex);
  if (!measure || selection.offsetTicks < 0 || selection.offsetTicks >= measure.durationTicks) return undefined;

  const writtenDurationTicks = timeline.measures.reduce(
    (duration, candidate) => Math.max(duration, candidate.startTick + candidate.durationTicks),
    0,
  );
  const occurrenceBase =
    writtenDurationTicks > 0 ? Math.floor(Math.max(0, current.tick) / writtenDurationTicks) * writtenDurationTicks : 0;
  const writtenTick = measure.startTick + selection.offsetTicks;
  const occurrenceTick = occurrenceBase + writtenTick;
  const tick = occurrenceTick < timeline.durationTicks ? occurrenceTick : writtenTick;
  const reversedIndex = [...measure.beatTicks].reverse().findIndex((beatTick) => beatTick <= writtenTick);
  const beatIndex = reversedIndex < 0 ? 0 : measure.beatTicks.length - 1 - reversedIndex;
  const cachedTimeMs = timeline.durationTicks > 0 ? (timeline.durationMs * tick) / timeline.durationTicks : 0;
  return {
    measureId: measure.id,
    measureIndex: measure.index,
    beatIndex,
    tick,
    cachedTimeMs,
  };
}
