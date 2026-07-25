import { z } from "zod";

export const writtenPositionSchema = z
  .object({
    schemaVersion: z.literal(1),
    trackId: z.string().min(1),
    measureIndex: z.number().int().nonnegative(),
    beatIndex: z.number().int().nonnegative(),
    tick: z.number().int().nonnegative(),
  })
  .strict();
export const playbackOccurrenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    written: writtenPositionSchema,
    occurrenceIndex: z.number().int().nonnegative(),
    timelineTick: z.number().int().nonnegative(),
    path: z.array(z.number().int().nonnegative()),
  })
  .strict();
export type WrittenPosition = z.infer<typeof writtenPositionSchema>;
export type PlaybackOccurrence = z.infer<typeof playbackOccurrenceSchema>;

export class PositionMap {
  constructor(private readonly occurrences: readonly PlaybackOccurrence[]) {}
  occurrencesFor(position: WrittenPosition): PlaybackOccurrence[] {
    return this.occurrences.filter((item) => sameWritten(item.written, position));
  }
  writtenForTimelineTick(tick: number): WrittenPosition | undefined {
    return [...this.occurrences].reverse().find((item) => item.timelineTick <= tick)?.written;
  }
  restore(occurrence: PlaybackOccurrence): PlaybackOccurrence | undefined {
    return (
      this.occurrences.find(
        (item) => item.timelineTick === occurrence.timelineTick && item.path.join(".") === occurrence.path.join("."),
      ) ?? this.occurrencesFor(occurrence.written)[0]
    );
  }
  resolve(position: WrittenPosition, currentTimelineTick: number): PlaybackOccurrence | undefined {
    const occurrences = this.occurrencesFor(position);
    return (
      occurrences.find((item) => item.timelineTick === currentTimelineTick) ??
      occurrences.find((item) => item.timelineTick > currentTimelineTick) ??
      occurrences[0]
    );
  }
}
function sameWritten(a: WrittenPosition, b: WrittenPosition): boolean {
  return (
    a.trackId === b.trackId && a.measureIndex === b.measureIndex && a.beatIndex === b.beatIndex && a.tick === b.tick
  );
}
