import { z } from "zod";
import type { HarmonyAnalysisInput } from "./analysisInput";
import type { ChordSymbolInput, ScoreWrittenRange } from "./schemas";

export const STRUCTURED_FEATURE_VERSION = "semi-crf-linear-v1" as const;

const twoDecimalNumberSchema = z
  .number()
  .finite()
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, "expected at most two decimals");
const chromaSchema = z.array(twoDecimalNumberSchema).length(12);
const segmentScalarsSchema = z
  .object({
    durationNormalized: twoDecimalNumberSchema,
    startMetricStrength: twoDecimalNumberSchema,
    endMetricStrength: twoDecimalNumberSchema,
    nonChordDurationRatio: twoDecimalNumberSchema,
    bassRootMatch: twoDecimalNumberSchema,
    bassChordTone: twoDecimalNumberSchema,
    bassChange: twoDecimalNumberSchema,
    staffSynchronization: twoDecimalNumberSchema,
    voiceSynchronization: twoDecimalNumberSchema,
    keyKnown: twoDecimalNumberSchema,
    keyCompatibility: twoDecimalNumberSchema,
    spellingKnown: twoDecimalNumberSchema,
    spellingCompatibility: twoDecimalNumberSchema,
  })
  .strict();
export const structuredSegmentFeaturesSchema = z
  .object({
    version: z.literal(STRUCTURED_FEATURE_VERSION),
    durationChroma: chromaSchema,
    attackChroma: chromaSchema,
    heldChroma: chromaSchema,
    upperStaffAttackChroma: chromaSchema,
    lowerStaffAttackChroma: chromaSchema,
    scalars: segmentScalarsSchema,
  })
  .strict();
export type StructuredSegmentFeatures = z.infer<typeof structuredSegmentFeaturesSchema>;

const transitionScalarsSchema = z
  .object({
    sameChord: twoDecimalNumberSchema,
    commonToneRatio: twoDecimalNumberSchema,
    fromComplexity: twoDecimalNumberSchema,
    toComplexity: twoDecimalNumberSchema,
    durationChange: twoDecimalNumberSchema,
  })
  .strict();
export const structuredTransitionFeaturesSchema = z
  .object({
    version: z.literal(STRUCTURED_FEATURE_VERSION),
    rootMotion: chromaSchema,
    bassMotion: chromaSchema,
    scalars: transitionScalarsSchema,
  })
  .strict();
export type StructuredTransitionFeatures = z.infer<typeof structuredTransitionFeaturesSchema>;

export const STRUCTURED_SEGMENT_FEATURE_LENGTH = 73;
export const STRUCTURED_TRANSITION_FEATURE_LENGTH = 29;

type PreparedNote = {
  start: number;
  end: number;
  pitchClass: number;
  soundingMidi?: number;
  spelling?: ChordSymbolInput["root"];
  staffIndex: number;
  voice: number;
};

export function createStructuredFeatureCache(
  input: HarmonyAnalysisInput,
  includedTrackIds: readonly string[],
): {
  forCandidate(range: ScoreWrittenRange, chord: ChordSymbolInput): StructuredSegmentFeatures;
} {
  const absoluteTick = createAbsoluteTick(input);
  const included = new Set(includedTrackIds);
  const notes: PreparedNote[] = input.tracks
    .filter((track) => included.has(track.id) && !track.isPercussion)
    .flatMap((track) =>
      track.staves.flatMap((staff) =>
        staff.notes.flatMap((note) =>
          note.soundingPitchClass === undefined
            ? []
            : [
                {
                  start: absoluteTick(note.moment),
                  end: absoluteTick(note.moment) + note.durationTicks,
                  pitchClass: note.soundingPitchClass,
                  ...(note.soundingMidi === undefined ? {} : { soundingMidi: note.soundingMidi }),
                  ...(note.spelling === undefined ? {} : { spelling: note.spelling }),
                  staffIndex: staff.index,
                  voice: note.voice,
                },
              ],
        ),
      ),
    );
  const upperStaffIndex = Math.min(Infinity, ...notes.map((note) => note.staffIndex));
  const rangeCache = new Map<string, ReturnType<typeof buildRangeEvidence>>();
  const candidateCache = new Map<string, StructuredSegmentFeatures>();
  return {
    forCandidate(range, chord) {
      const rangeId = rangeKey(range);
      const candidateId = `${rangeId}|${JSON.stringify(chord)}`;
      const cached = candidateCache.get(candidateId);
      if (cached) return cached;
      const evidence =
        rangeCache.get(rangeId) ?? buildRangeEvidence(input, notes, upperStaffIndex, range, absoluteTick);
      rangeCache.set(rangeId, evidence);
      const features = structuredSegmentFeaturesSchema.parse(createSegmentFeatures(input, range, chord, evidence));
      candidateCache.set(candidateId, features);
      return features;
    },
  };
}

export function createStructuredTransitionFeatures(input: {
  from: ChordSymbolInput;
  to: ChordSymbolInput;
  fromDurationQuarterNotes: number;
  toDurationQuarterNotes: number;
}): StructuredTransitionFeatures {
  const fromTones = chordPitchClasses(input.from);
  const toTones = chordPitchClasses(input.to);
  const intersection = [...fromTones].filter((pitchClass) => toTones.has(pitchClass)).length;
  const union = new Set([...fromTones, ...toTones]).size;
  return structuredTransitionFeaturesSchema.parse({
    version: STRUCTURED_FEATURE_VERSION,
    rootMotion: oneHot12(mod12(pitchClass(input.to.root) - pitchClass(input.from.root))),
    bassMotion: oneHot12(
      mod12(pitchClass(input.to.bass ?? input.to.root) - pitchClass(input.from.bass ?? input.from.root)),
    ),
    scalars: {
      sameChord: Number(JSON.stringify(input.from) === JSON.stringify(input.to)),
      commonToneRatio: q2(union === 0 ? 0 : intersection / union),
      fromComplexity: q2(chordComplexity(input.from)),
      toComplexity: q2(chordComplexity(input.to)),
      durationChange: q2(
        clamp(
          (input.toDurationQuarterNotes - input.fromDurationQuarterNotes) /
            Math.max(1, input.fromDurationQuarterNotes, input.toDurationQuarterNotes),
          -1,
          1,
        ),
      ),
    },
  });
}

export function flattenStructuredSegmentFeatures(features: StructuredSegmentFeatures): number[] {
  const parsed = structuredSegmentFeaturesSchema.parse(features);
  const values = [
    ...parsed.durationChroma,
    ...parsed.attackChroma,
    ...parsed.heldChroma,
    ...parsed.upperStaffAttackChroma,
    ...parsed.lowerStaffAttackChroma,
    parsed.scalars.durationNormalized,
    parsed.scalars.startMetricStrength,
    parsed.scalars.endMetricStrength,
    parsed.scalars.nonChordDurationRatio,
    parsed.scalars.bassRootMatch,
    parsed.scalars.bassChordTone,
    parsed.scalars.bassChange,
    parsed.scalars.staffSynchronization,
    parsed.scalars.voiceSynchronization,
    parsed.scalars.keyKnown,
    parsed.scalars.keyCompatibility,
    parsed.scalars.spellingKnown,
    parsed.scalars.spellingCompatibility,
  ];
  if (values.length !== STRUCTURED_SEGMENT_FEATURE_LENGTH)
    throw new Error("structured segment feature length mismatch");
  return values;
}

export function flattenStructuredTransitionFeatures(features: StructuredTransitionFeatures): number[] {
  const parsed = structuredTransitionFeaturesSchema.parse(features);
  const values = [
    ...parsed.rootMotion,
    ...parsed.bassMotion,
    parsed.scalars.sameChord,
    parsed.scalars.commonToneRatio,
    parsed.scalars.fromComplexity,
    parsed.scalars.toComplexity,
    parsed.scalars.durationChange,
  ];
  if (values.length !== STRUCTURED_TRANSITION_FEATURE_LENGTH)
    throw new Error("structured transition feature length mismatch");
  return values;
}

function buildRangeEvidence(
  input: HarmonyAnalysisInput,
  notes: readonly PreparedNote[],
  upperStaffIndex: number,
  range: ScoreWrittenRange,
  absoluteTick: (moment: { measureIndex: number; offsetTicks: number }) => number,
) {
  const start = absoluteTick(range.start);
  const end = absoluteTick(range.end);
  const overlapping = notes.filter((note) => note.start < end && note.end > start);
  const duration = zeros();
  const held = zeros();
  const attacks = zeros();
  const upperAttacks = zeros();
  const lowerAttacks = zeros();
  const spellingKeys = new Set<string>();
  const onsetStaff = new Map<number, Set<number>>();
  const voices = new Set<number>();
  const bassByOnset = new Map<number, number>();
  for (const note of overlapping) {
    const overlap = Math.max(0, Math.min(note.end, end) - Math.max(note.start, start));
    duration[note.pitchClass] += overlap;
    if (note.start < start) held[note.pitchClass] += overlap;
    if (note.spelling) spellingKeys.add(`${note.spelling.step}:${note.spelling.alter}`);
    if (note.start < start || note.start >= end) continue;
    attacks[note.pitchClass] += 1;
    (note.staffIndex === upperStaffIndex ? upperAttacks : lowerAttacks)[note.pitchClass] += 1;
    const staffs = onsetStaff.get(note.start) ?? new Set<number>();
    staffs.add(note.staffIndex);
    onsetStaff.set(note.start, staffs);
    voices.add(note.voice);
    if (note.soundingMidi !== undefined)
      bassByOnset.set(note.start, Math.min(bassByOnset.get(note.start) ?? Infinity, note.soundingMidi));
  }
  const onsetGroups = [...onsetStaff.values()];
  const bassSequence = [...bassByOnset.entries()].sort(([a], [b]) => a - b).map(([, midi]) => midi);
  const bassNote = overlapping
    .filter((note): note is PreparedNote & { soundingMidi: number } => note.soundingMidi !== undefined)
    .sort((a, b) => a.soundingMidi - b.soundingMidi)[0];
  return {
    duration,
    held,
    attacks,
    upperAttacks,
    lowerAttacks,
    spellingKeys,
    bassPitchClass: bassNote?.pitchClass,
    bassChange: Number(bassSequence.length > 1 && bassSequence[0] !== bassSequence.at(-1)),
    staffSynchronization:
      onsetGroups.length === 0 ? 0 : onsetGroups.filter((staffs) => staffs.size > 1).length / onsetGroups.length,
    voiceSynchronization: overlapping.length === 0 ? 0 : Math.max(0, voices.size - 1) / overlapping.length,
  };
}

function createSegmentFeatures(
  input: HarmonyAnalysisInput,
  range: ScoreWrittenRange,
  chord: ChordSymbolInput,
  evidence: ReturnType<typeof buildRangeEvidence>,
): StructuredSegmentFeatures {
  const chordTones = chordPitchClasses(chord);
  const totalDuration = sum(evidence.duration);
  const nonChordDuration = evidence.duration.reduce(
    (total, duration, pitchClass) => total + (chordTones.has(pitchClass) ? 0 : duration),
    0,
  );
  const measure = input.measures.find((candidate) => candidate.index === range.start.measureIndex);
  const keyRoot = parseKeyRoot(measure?.key);
  const rootPitchClass = pitchClass(chord.root);
  const spellingKey = `${chord.root.step}:${chord.root.alter}`;
  return {
    version: STRUCTURED_FEATURE_VERSION,
    durationChroma: normalize(evidence.duration),
    attackChroma: normalize(evidence.attacks),
    heldChroma: normalize(evidence.held),
    upperStaffAttackChroma: normalize(evidence.upperAttacks),
    lowerStaffAttackChroma: normalize(evidence.lowerAttacks),
    scalars: {
      durationNormalized: q2(clamp(durationQuarterNotes(input, range) / 8, 0, 1)),
      startMetricStrength: metricStrength(input, range.start),
      endMetricStrength: metricStrength(input, range.end),
      nonChordDurationRatio: q2(totalDuration === 0 ? 0 : nonChordDuration / totalDuration),
      bassRootMatch: Number(evidence.bassPitchClass === rootPitchClass),
      bassChordTone: Number(evidence.bassPitchClass !== undefined && chordTones.has(evidence.bassPitchClass)),
      bassChange: evidence.bassChange,
      staffSynchronization: q2(evidence.staffSynchronization),
      voiceSynchronization: q2(evidence.voiceSynchronization),
      keyKnown: Number(keyRoot !== undefined),
      keyCompatibility: Number(keyRoot !== undefined && majorScale(keyRoot).has(rootPitchClass)),
      spellingKnown: Number(evidence.spellingKeys.size > 0),
      spellingCompatibility: Number(evidence.spellingKeys.has(spellingKey)),
    },
  };
}

function createAbsoluteTick(input: Pick<HarmonyAnalysisInput, "measures">) {
  const starts = new Map<number, number>();
  let end = 0;
  for (const measure of input.measures) {
    starts.set(measure.index, end);
    end += measure.durationTicks;
  }
  return (moment: { measureIndex: number; offsetTicks: number }): number =>
    (starts.get(moment.measureIndex) ?? end) + moment.offsetTicks;
}

function durationQuarterNotes(input: HarmonyAnalysisInput, range: ScoreWrittenRange): number {
  const absoluteTick = createAbsoluteTick(input);
  return (absoluteTick(range.end) - absoluteTick(range.start)) / input.ticksPerQuarter;
}

function metricStrength(input: HarmonyAnalysisInput, moment: { measureIndex: number; offsetTicks: number }): number {
  const measure = input.measures.find((candidate) => candidate.index === moment.measureIndex);
  if (!measure || moment.offsetTicks === 0 || moment.offsetTicks === measure.durationTicks) return 1;
  const beat = (input.ticksPerQuarter * 4) / measure.timeSignature.denominator;
  if (moment.offsetTicks % beat === 0) return 0.75;
  if (moment.offsetTicks % (beat / 2) === 0) return 0.5;
  return 0.25;
}

function chordPitchClasses(chord: ChordSymbolInput): Set<number> {
  const root = pitchClass(chord.root);
  const third = chord.kind === "minor" || chord.kind === "diminished" || chord.kind === "half-diminished" ? 3 : 4;
  const fifth =
    chord.kind === "diminished" || chord.kind === "half-diminished" ? 6 : chord.kind === "augmented" ? 8 : 7;
  const tones = new Set([root, mod12(root + third), mod12(root + fifth)]);
  if (chord.kind === "power") tones.delete(mod12(root + third));
  if (chord.kind === "suspended-second" || chord.kind === "suspended-fourth") {
    tones.delete(mod12(root + third));
    tones.add(mod12(root + (chord.kind === "suspended-second" ? 2 : 5)));
  }
  if (chord.extension && chord.extension >= 7)
    tones.add(mod12(root + (chord.kind === "major" ? 11 : chord.kind === "diminished" ? 9 : 10)));
  for (const degree of chord.degrees) {
    const intervals: Record<number, number> = { 2: 2, 4: 5, 6: 9, 7: 10, 9: 2, 11: 5, 13: 9 };
    const tone = mod12(root + (intervals[degree.value] ?? 0) + degree.alter);
    if (degree.operation === "subtract") tones.delete(tone);
    else tones.add(tone);
  }
  return tones;
}

function chordComplexity(chord: ChordSymbolInput): number {
  return clamp(((chord.extension ? 1 : 0) + chord.degrees.length + (chord.bass ? 1 : 0)) / 4, 0, 1);
}

function parseKeyRoot(key: string | undefined): number | undefined {
  const match = key?.match(/^([A-Ga-g])([#b]?)/);
  if (!match) return undefined;
  const step = match[1]!.toUpperCase() as ChordSymbolInput["root"]["step"];
  return pitchClass({ step, alter: match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0 });
}

function majorScale(root: number): Set<number> {
  return new Set([0, 2, 4, 5, 7, 9, 11].map((interval) => mod12(root + interval)));
}

function pitchClass(pitch: ChordSymbolInput["root"]): number {
  const naturals = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const;
  return mod12(naturals[pitch.step] + pitch.alter);
}

function normalize(values: readonly number[]): number[] {
  const total = sum(values);
  return values.map((value) => q2(total === 0 ? 0 : value / total));
}

function oneHot12(index: number): number[] {
  return Array.from({ length: 12 }, (_, candidate) => Number(candidate === index));
}

function zeros(): number[] {
  return Array.from({ length: 12 }, () => 0);
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function rangeKey(range: ScoreWrittenRange): string {
  return `${range.start.measureIndex}:${range.start.offsetTicks}-${range.end.measureIndex}:${range.end.offsetTicks}`;
}

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}

function q2(value: number): number {
  return Number(value.toFixed(2));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
