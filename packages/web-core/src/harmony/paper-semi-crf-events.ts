import type { HarmonyAnalysisInput } from "./analysisInput";
import type { ChordSymbolInput, ScoreWrittenRange } from "./schemas";
import type { ScoreWrittenMoment } from "./writtenTime";

type SpelledPitch = ChordSymbolInput["root"];

export type PaperSemiCrfEventNote = {
  id: string;
  trackId: string;
  staffIndex: number;
  voice: number;
  onset: ScoreWrittenMoment;
  onsetTick: number;
  soundingPitchClass: number;
  durationTicks: number;
  sourceDurationTicks: number;
  heldFromPrevious: boolean;
  metricAccent: number;
  isBass: boolean;
  soundingMidi?: number;
  spelling?: SpelledPitch;
};

export type PaperSemiCrfEvent = {
  index: number;
  range: ScoreWrittenRange;
  startTick: number;
  endTick: number;
  durationTicks: number;
  metricAccent: number;
  notes: PaperSemiCrfEventNote[];
  bassPitchClass?: number;
};

export type PaperSemiCrfEventProjectionErrorCode = "invalid-written-moment" | "note-outside-score";

export class PaperSemiCrfEventProjectionError extends Error {
  constructor(readonly code: PaperSemiCrfEventProjectionErrorCode) {
    super(code);
    this.name = "PaperSemiCrfEventProjectionError";
  }
}

type PreparedNote = {
  id: string;
  trackId: string;
  staffIndex: number;
  voice: number;
  onset: ScoreWrittenMoment;
  start: number;
  end: number;
  durationTicks: number;
  soundingPitchClass: number;
  soundingMidi?: number;
  spelling?: SpelledPitch;
};

export function buildPaperSemiCrfEvents(
  input: HarmonyAnalysisInput,
  options: { includedTrackIds: readonly string[] },
): PaperSemiCrfEvent[] {
  const timeline = createWrittenTimeline(input);
  const includedTrackIds = new Set(options.includedTrackIds);
  const notes = input.tracks
    .filter((track) => includedTrackIds.has(track.id) && !track.isPercussion)
    .flatMap((track) =>
      track.staves.flatMap((staff) =>
        staff.notes.flatMap((note): PreparedNote[] => {
          if (note.soundingPitchClass === undefined) return [];
          const start = timeline.toAbsolute(note.moment);
          const end = start + note.durationTicks;
          if (!Number.isSafeInteger(end) || end > timeline.scoreEnd) {
            throw new PaperSemiCrfEventProjectionError("note-outside-score");
          }
          return [
            {
              id: note.id,
              trackId: track.id,
              staffIndex: staff.index,
              voice: note.voice,
              onset: timeline.toMoment(start),
              start,
              end,
              durationTicks: note.durationTicks,
              soundingPitchClass: note.soundingPitchClass,
              ...(note.soundingMidi === undefined ? {} : { soundingMidi: note.soundingMidi }),
              ...(note.spelling === undefined ? {} : { spelling: note.spelling }),
            },
          ];
        }),
      ),
    );
  const partitionPoints = [...new Set(notes.flatMap((note) => [note.start, note.end]))].sort((a, b) => a - b);

  return partitionPoints.slice(0, -1).map((start, index) => {
    const end = partitionPoints[index + 1]!;
    const sounding = notes.filter((note) => note.start < end && note.end > start);
    const bassNotes = findBassNotes(sounding);
    const metricAccent = metricAccentAt(input, timeline.toMoment(start));
    const eventNotes = sounding.map((note): PaperSemiCrfEventNote => ({
      id: note.id,
      trackId: note.trackId,
      staffIndex: note.staffIndex,
      voice: note.voice,
      onset: note.onset,
      onsetTick: note.start,
      soundingPitchClass: note.soundingPitchClass,
      durationTicks: Math.min(note.end, end) - Math.max(note.start, start),
      sourceDurationTicks: note.durationTicks,
      heldFromPrevious: note.start < start,
      metricAccent,
      isBass: bassNotes.has(note),
      ...(note.soundingMidi === undefined ? {} : { soundingMidi: note.soundingMidi }),
      ...(note.spelling === undefined ? {} : { spelling: note.spelling }),
    }));
    const bass = sounding.find((note) => bassNotes.has(note));
    return {
      index,
      range: { start: timeline.toMoment(start), end: timeline.toMoment(end) },
      startTick: start,
      endTick: end,
      durationTicks: end - start,
      metricAccent,
      notes: eventNotes,
      ...(bass === undefined ? {} : { bassPitchClass: bass.soundingPitchClass }),
    };
  });
}

function findBassNotes(notes: readonly PreparedNote[]): Set<PreparedNote> {
  const notesWithMidi = notes.filter(
    (note): note is PreparedNote & { soundingMidi: number } => note.soundingMidi !== undefined,
  );
  if (notesWithMidi.length > 0) {
    const bassMidi = Math.min(...notesWithMidi.map((note) => note.soundingMidi));
    return new Set(notesWithMidi.filter((note) => note.soundingMidi === bassMidi));
  }
  const bassPitchClass = Math.min(...notes.map((note) => note.soundingPitchClass));
  return new Set(notes.filter((note) => note.soundingPitchClass === bassPitchClass));
}

function metricAccentAt(input: HarmonyAnalysisInput, moment: ScoreWrittenMoment): number {
  const measure = input.measures.find((candidate) => candidate.index === moment.measureIndex);
  if (!measure) throw new PaperSemiCrfEventProjectionError("invalid-written-moment");
  if (moment.offsetTicks === 0) return 1;
  const denominatorBeat = (input.ticksPerQuarter * 4) / measure.timeSignature.denominator;
  if (!Number.isSafeInteger(denominatorBeat)) {
    throw new PaperSemiCrfEventProjectionError("invalid-written-moment");
  }
  const compound = measure.timeSignature.numerator > 3 && measure.timeSignature.numerator % 3 === 0;
  const groupTicks = denominatorBeat * (compound ? 3 : 1);
  const groupCount = measure.durationTicks / groupTicks;
  if (Number.isInteger(groupCount) && groupCount % 2 === 0 && moment.offsetTicks % (measure.durationTicks / 2) === 0) {
    return 0.5;
  }
  if (moment.offsetTicks % groupTicks === 0) return 0.25;
  let subdivision = groupTicks / 2;
  let accent = 0.125;
  while (Number.isSafeInteger(subdivision) && subdivision >= 1) {
    if (moment.offsetTicks % subdivision === 0) return accent;
    subdivision /= 2;
    accent /= 2;
  }
  return 0;
}

function createWrittenTimeline(input: Pick<HarmonyAnalysisInput, "measures">): {
  scoreEnd: number;
  toAbsolute(moment: ScoreWrittenMoment): number;
  toMoment(tick: number): ScoreWrittenMoment;
} {
  let scoreEnd = 0;
  const measures = input.measures.map((measure) => {
    const prepared = { index: measure.index, durationTicks: measure.durationTicks, start: scoreEnd };
    scoreEnd += measure.durationTicks;
    return prepared;
  });
  const byIndex = new Map(measures.map((measure) => [measure.index, measure]));
  if (byIndex.size !== measures.length) throw new PaperSemiCrfEventProjectionError("invalid-written-moment");

  return {
    scoreEnd,
    toAbsolute(moment) {
      const measure = byIndex.get(moment.measureIndex);
      if (
        !measure ||
        !Number.isSafeInteger(moment.offsetTicks) ||
        moment.offsetTicks < 0 ||
        moment.offsetTicks > measure.durationTicks
      ) {
        throw new PaperSemiCrfEventProjectionError("invalid-written-moment");
      }
      return measure.start + moment.offsetTicks;
    },
    toMoment(tick) {
      if (!Number.isSafeInteger(tick) || tick < 0 || tick > scoreEnd) {
        throw new PaperSemiCrfEventProjectionError("invalid-written-moment");
      }
      const containing = measures.find(
        (measure) => tick >= measure.start && tick < measure.start + measure.durationTicks,
      );
      if (containing) return { measureIndex: containing.index, offsetTicks: tick - containing.start };
      const last = measures.at(-1);
      if (!last) throw new PaperSemiCrfEventProjectionError("invalid-written-moment");
      return { measureIndex: last.index, offsetTicks: last.durationTicks };
    },
  };
}
