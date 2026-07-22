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
  return {
    forRange(range) {
      const durationByPitchClass = Array.from({ length: 12 }, () => 0);
      const onsetCountByPitchClass = Array.from({ length: 12 }, () => 0);
      const spellingWeightsByPitchClass = Array.from(
        { length: 12 },
        () => new Map<string, { pitch: SpelledPitch; weight: number }>(),
      );
      const notes = input.notes.filter(
        (note) =>
          note.soundingPitchClass !== undefined &&
          compareMoments(note.moment, range.end) < 0 &&
          compareMoments(
            { measureIndex: note.moment.measureIndex, offsetTicks: note.moment.offsetTicks + note.durationTicks },
            range.start,
          ) > 0,
      );
      let bass: FeatureNote | undefined;
      const maxDurationByPitchClass = Array.from({ length: 12 }, () => 0);
      for (const note of notes) {
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
      for (const note of notes) {
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
        if (note.moment.offsetTicks >= range.start.offsetTicks && note.moment.offsetTicks < range.end.offsetTicks)
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
