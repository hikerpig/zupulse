import type { HarmonyAnalysisInput } from "./analysisInput";
import type { ScoreWrittenMoment } from "./writtenTime";

export const HARMONY_BOUNDARY_FEATURE_VERSION = "boundary-evidence-v1" as const;
export const HARMONY_BOUNDARY_FEATURE_LENGTH = 5;

export function createBoundaryEvidenceFeatures(
  input: Pick<HarmonyAnalysisInput, "ticksPerQuarter" | "measures" | "tracks">,
  moment: ScoreWrittenMoment,
): number[] {
  const starts = measureStarts(input);
  const boundaryTick = (starts[moment.measureIndex] ?? 0) + moment.offsetTicks;
  const notes = input.tracks
    .filter((track) => !track.isPercussion)
    .flatMap((track) => track.staves.flatMap((staff) => staff.notes))
    .filter((note) => note.soundingPitchClass !== undefined)
    .map((note) => ({
      pitchClass: note.soundingPitchClass!,
      ...(note.soundingMidi === undefined ? {} : { midi: note.soundingMidi }),
      start: (starts[note.moment.measureIndex] ?? 0) + note.moment.offsetTicks,
      end: (starts[note.moment.measureIndex] ?? 0) + note.moment.offsetTicks + note.durationTicks,
    }));
  const before = notes.filter((note) => note.start < boundaryTick && note.end >= boundaryTick);
  const after = notes.filter((note) => note.start <= boundaryTick && note.end > boundaryTick);
  const beforePitches = new Set(before.map((note) => note.pitchClass));
  const afterPitches = new Set(after.map((note) => note.pitchClass));
  const held = new Set([...beforePitches].filter((pitchClass) => afterPitches.has(pitchClass)));
  const union = new Set([...beforePitches, ...afterPitches]);
  const onsetPitches = new Set(notes.filter((note) => note.start === boundaryTick).map((note) => note.pitchClass));
  const beforeBass = lowestMidi(before);
  const afterBass = lowestMidi(after);
  return [
    metricStrength(input, moment),
    beforeBass === undefined || afterBass === undefined || beforeBass === afterBass ? 0 : 1,
    beforePitches.size === 0 ? 0 : held.size / beforePitches.size,
    onsetPitches.size / 12,
    union.size === 0 ? 0 : 1 - held.size / union.size,
  ].map(roundScore);
}

function metricStrength(
  input: Pick<HarmonyAnalysisInput, "ticksPerQuarter" | "measures">,
  moment: ScoreWrittenMoment,
): number {
  const measure = input.measures.find((candidate) => candidate.index === moment.measureIndex);
  if (!measure || moment.offsetTicks === 0 || moment.offsetTicks === measure.durationTicks) return 1;
  const denominatorBeat = (input.ticksPerQuarter * 4) / measure.timeSignature.denominator;
  const compound = measure.timeSignature.numerator > 3 && measure.timeSignature.numerator % 3 === 0;
  const musicalBeat = compound ? denominatorBeat * 3 : denominatorBeat;
  if (moment.offsetTicks % musicalBeat === 0) return 1;
  return compound && moment.offsetTicks % denominatorBeat === 0 ? 1 / 3 : 0;
}

function measureStarts(input: Pick<HarmonyAnalysisInput, "measures">): number[] {
  const starts = [0];
  for (const measure of input.measures) starts.push(starts.at(-1)! + measure.durationTicks);
  return starts;
}

function lowestMidi(notes: readonly { pitchClass: number; midi?: number }[]): number | undefined {
  return notes.map((note) => note.midi ?? note.pitchClass).sort((a, b) => a - b)[0];
}

function roundScore(value: number): number {
  return Number(value.toFixed(2));
}
