import { z } from "zod";
import { chordSymbolSchema, type ChordSymbolInput } from "./schemas";
import type { HarmonyFeatureVector } from "./features";

const FEATURE_VERSION = "relative-pc-v1";
const FEATURE_LENGTH = 37;

const prototypeSchema = z
  .object({
    chordShape: z.string().min(1),
    features: z.array(z.number().finite()).length(FEATURE_LENGTH),
  })
  .strict();

export const harmonyRankerModelSchema = z
  .object({
    version: z.literal(1),
    featureVersion: z.literal(FEATURE_VERSION),
    algorithmVersion: z.literal("prototype-ranker-v1"),
    trainingCorpusSha256: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1),
    trainingGroupsSha256: z.string().regex(/^[a-f0-9]{64}$/),
    prototypes: z.array(prototypeSchema).min(1),
  })
  .strict();

export type HarmonyRankerModel = z.infer<typeof harmonyRankerModelSchema>;

export function createHarmonyRankerFeatures(
  featureVector: HarmonyFeatureVector,
  chordInput: ChordSymbolInput,
): number[] {
  const chord = chordSymbolSchema.parse(chordInput);
  const root = pitchClass(chord.root);
  const maximumDuration = Math.max(1, ...featureVector.durationByPitchClass);
  const maximumOnsets = Math.max(1, ...featureVector.onsetCountByPitchClass);
  const relative = (values: readonly number[], scale: number) =>
    Array.from({ length: 12 }, (_, interval) => values[(root + interval) % 12]! / scale);
  const bass = Array.from({ length: 13 }, (_, interval) =>
    Number(
      (featureVector.bassPitchClass === undefined ? 12 : (featureVector.bassPitchClass - root + 12) % 12) === interval,
    ),
  );
  return [
    ...relative(featureVector.durationByPitchClass, maximumDuration),
    ...relative(featureVector.onsetCountByPitchClass, maximumOnsets),
    ...bass,
  ];
}

export function harmonyChordShape(chordInput: ChordSymbolInput): string {
  const chord = chordSymbolSchema.parse(chordInput);
  return `${chord.kind}|${chord.extension ?? ""}|${JSON.stringify(chord.degrees)}`;
}

export function scoreHarmonyCandidate(
  model: HarmonyRankerModel,
  featureVector: HarmonyFeatureVector,
  chordInput: ChordSymbolInput,
): number {
  const shape = harmonyChordShape(chordInput);
  const features = createHarmonyRankerFeatures(featureVector, chordInput);
  let nearest = Number.POSITIVE_INFINITY;
  for (const prototype of model.prototypes) {
    if (prototype.chordShape !== shape) continue;
    const distance = features.reduce((sum, value, index) => sum + (value - prototype.features[index]!) ** 2, 0);
    nearest = Math.min(nearest, distance);
  }
  return Number.isFinite(nearest) ? Math.exp(-nearest) : 0;
}

function pitchClass(pitch: ChordSymbolInput["root"]): number {
  const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const;
  return (natural[pitch.step] + pitch.alter + 12) % 12;
}
