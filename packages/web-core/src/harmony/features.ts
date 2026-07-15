import { compareMoments, type ScoreWrittenRange } from "./schemas";

export type HarmonyFeatureVector = {
  durationByPitchClass: number[];
  onsetCountByPitchClass: number[];
  bassPitchClass?: number;
};
export type HarmonyFeatureCache = { forRange(range: ScoreWrittenRange): HarmonyFeatureVector };
type FeatureNote = {
  moment: { measureIndex: number; offsetTicks: number };
  durationTicks: number;
  soundingPitchClass?: number;
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
        if (note.moment.offsetTicks >= range.start.offsetTicks && note.moment.offsetTicks < range.end.offsetTicks)
          onsetCountByPitchClass[pitchClass] = Math.min(onsetCountByPitchClass[pitchClass]! + 1, 8);
        if (!bass || note.soundingPitchClass! < bass.soundingPitchClass!) bass = note;
      }
      return {
        durationByPitchClass,
        onsetCountByPitchClass,
        ...(bass?.soundingPitchClass === undefined ? {} : { bassPitchClass: bass.soundingPitchClass }),
      };
    },
  };
}
