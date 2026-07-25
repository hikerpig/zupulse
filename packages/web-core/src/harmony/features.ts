import { compareMoments, type ChordSymbolInput, type ScoreWrittenRange } from "./schemas";

type SpelledPitch = ChordSymbolInput["root"];

export type HarmonyFeatureVector = {
  durationByPitchClass: number[];
  onsetCountByPitchClass: number[];
  spellingByPitchClass?: Array<SpelledPitch | undefined>;
  bassPitchClass?: number;
};
export type HarmonyFeatureCache = { forRange(range: ScoreWrittenRange): HarmonyFeatureVector };
type FeatureNote = {
  moment: { measureIndex: number; offsetTicks: number };
  durationTicks: number;
  soundingPitchClass?: number;
  soundingMidi?: number;
  spelling?: SpelledPitch;
  voice: number;
};

export function buildHarmonyFeatureCache(input: {
  ticksPerQuarter: number;
  notes: readonly FeatureNote[];
}): HarmonyFeatureCache {
  const notes = input.notes
    .map((note) => ({
      note,
      start: momentOrder(note.moment),
      end: momentOrder({
        measureIndex: note.moment.measureIndex,
        offsetTicks: note.moment.offsetTicks + note.durationTicks,
      }),
    }))
    .sort((a, b) => a.start - b.start);
  const maximumEndThroughIndex: number[] = [];
  for (const [index, prepared] of notes.entries())
    maximumEndThroughIndex[index] = Math.max(maximumEndThroughIndex[index - 1] ?? -Infinity, prepared.end);
  return {
    forRange(range) {
      const durationByPitchClass = Array.from({ length: 12 }, () => 0);
      const onsetCountByPitchClass = Array.from({ length: 12 }, () => 0);
      const spellingWeightsByPitchClass = Array.from(
        { length: 12 },
        () => new Map<string, { pitch: SpelledPitch; weight: number }>(),
      );
      const overlappingNotes: FeatureNote[] = [];
      const rangeStart = momentOrder(range.start);
      let index = lowerBound(notes, momentOrder(range.end)) - 1;
      while (index >= 0 && maximumEndThroughIndex[index]! > rangeStart) {
        const prepared = notes[index]!;
        if (prepared.note.soundingPitchClass !== undefined && prepared.end > rangeStart)
          overlappingNotes.push(prepared.note);
        index -= 1;
      }
      let bass: FeatureNote | undefined;
      const maxDurationByPitchClass = Array.from({ length: 12 }, () => 0);
      for (const note of overlappingNotes) {
        const start =
          note.moment.measureIndex === range.start.measureIndex
            ? Math.max(note.moment.offsetTicks, range.start.offsetTicks)
            : note.moment.offsetTicks;
        const end =
          note.moment.measureIndex === range.end.measureIndex
            ? Math.min(note.moment.offsetTicks + note.durationTicks, range.end.offsetTicks)
            : note.moment.offsetTicks + note.durationTicks;
        maxDurationByPitchClass[note.soundingPitchClass!] = Math.max(
          maxDurationByPitchClass[note.soundingPitchClass!]!,
          end - start,
        );
      }
      for (const note of overlappingNotes) {
        const start =
          note.moment.measureIndex === range.start.measureIndex
            ? Math.max(note.moment.offsetTicks, range.start.offsetTicks)
            : note.moment.offsetTicks;
        const end =
          note.moment.measureIndex === range.end.measureIndex
            ? Math.min(note.moment.offsetTicks + note.durationTicks, range.end.offsetTicks)
            : note.moment.offsetTicks + note.durationTicks;
        const pitchClass = note.soundingPitchClass!;
        durationByPitchClass[pitchClass] = Math.min(
          durationByPitchClass[pitchClass]! + end - start,
          maxDurationByPitchClass[pitchClass]!,
        );
        if (note.spelling) {
          const key = `${note.spelling.step}:${note.spelling.alter}`;
          const weights = spellingWeightsByPitchClass[pitchClass]!;
          const previous = weights.get(key);
          weights.set(key, { pitch: note.spelling, weight: (previous?.weight ?? 0) + end - start });
        }
        if (compareMoments(note.moment, range.start) >= 0 && compareMoments(note.moment, range.end) < 0)
          onsetCountByPitchClass[pitchClass] = Math.min(onsetCountByPitchClass[pitchClass]! + 1, 8);
        if (
          !bass ||
          (note.soundingMidi !== undefined &&
            (bass.soundingMidi === undefined || note.soundingMidi < bass.soundingMidi)) ||
          (note.soundingMidi === undefined &&
            bass.soundingMidi === undefined &&
            note.soundingPitchClass! < bass.soundingPitchClass!)
        )
          bass = note;
      }
      return {
        durationByPitchClass,
        onsetCountByPitchClass,
        spellingByPitchClass: spellingWeightsByPitchClass.map(
          (weights) =>
            [...weights.entries()].sort(
              ([keyA, a], [keyB, b]) => b.weight - a.weight || keyA.localeCompare(keyB),
            )[0]?.[1].pitch,
        ),
        ...(bass?.soundingPitchClass === undefined ? {} : { bassPitchClass: bass.soundingPitchClass }),
      };
    },
  };
}

function momentOrder(moment: { measureIndex: number; offsetTicks: number }): number {
  return moment.measureIndex * 1_000_000_000 + moment.offsetTicks;
}

function lowerBound(notes: readonly { start: number }[], target: number): number {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (notes[middle]!.start < target) low = middle + 1;
    else high = middle;
  }
  return low;
}
