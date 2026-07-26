import type { MusicalPosition, PlaybackTimelineMap } from "./types";
import { PositionMap, type PlaybackOccurrence } from "../score/positions";

export type WrittenPlaybackSelection = {
  measureIndex: number;
  offsetTicks: number;
};

export function playbackPositionForWrittenSelection(
  selection: WrittenPlaybackSelection,
  current: MusicalPosition,
  timeline: PlaybackTimelineMap,
  occurrences: readonly PlaybackOccurrence[] = [],
): MusicalPosition | undefined {
  const measure = timeline.measures.find((candidate) => candidate.index === selection.measureIndex);
  if (!measure || selection.offsetTicks < 0 || selection.offsetTicks >= measure.durationTicks) return undefined;

  const writtenTick = measure.startTick + selection.offsetTicks;
  const reversedIndex = [...measure.beatTicks].reverse().findIndex((beatTick) => beatTick <= writtenTick);
  const beatIndex = reversedIndex < 0 ? 0 : measure.beatTicks.length - 1 - reversedIndex;
  const exactOccurrence = new PositionMap(occurrences).resolve(
    {
      schemaVersion: 1,
      trackId: occurrences[0]?.written.trackId ?? "track-0",
      measureIndex: measure.index,
      beatIndex,
      tick: measure.beatTicks[beatIndex] ?? writtenTick,
    },
    current.tick,
  );
  const tick = exactOccurrence
    ? exactOccurrence.timelineTick + writtenTick - (measure.beatTicks[beatIndex] ?? writtenTick)
    : heuristicOccurrenceTick(writtenTick, current.tick, timeline);
  const cachedTimeMs = timeline.durationTicks > 0 ? (timeline.durationMs * tick) / timeline.durationTicks : 0;
  return {
    measureId: measure.id,
    measureIndex: measure.index,
    beatIndex,
    tick,
    cachedTimeMs,
  };
}

function heuristicOccurrenceTick(writtenTick: number, currentTick: number, timeline: PlaybackTimelineMap): number {
  const writtenDurationTicks = timeline.measures.reduce(
    (duration, candidate) => Math.max(duration, candidate.startTick + candidate.durationTicks),
    0,
  );
  const occurrenceBase =
    writtenDurationTicks > 0 ? Math.floor(Math.max(0, currentTick) / writtenDurationTicks) * writtenDurationTicks : 0;
  const occurrenceTick = occurrenceBase + writtenTick;
  return occurrenceTick < timeline.durationTicks ? occurrenceTick : writtenTick;
}
