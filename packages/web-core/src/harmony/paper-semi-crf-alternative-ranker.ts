import { z } from "zod";
import { chordSymbolSchema, type ChordSymbolInput } from "./schemas";
import type { PaperSemiCrfAlternativeFeatures } from "./paper-semi-crf-alternative-features";

const FEATURE_VERSION = "relative-pc-presence-v1";
const FEATURE_LENGTH = 37;

const prototypeSchema = z
  .object({
    chordShape: z.string().min(1),
    features: z.array(z.number().finite()).length(FEATURE_LENGTH),
    frequency: z.number().int().positive(),
  })
  .strict();

export const harmonyRankerModelSchema = z
  .object({
    version: z.literal(1),
    featureVersion: z.literal(FEATURE_VERSION),
    algorithmVersion: z.literal("paper-semi-crf-alternatives-v1"),
    trainingCorpusSha256: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1),
    trainingGroupsSha256: z.string().regex(/^[a-f0-9]{64}$/),
    prototypes: z.array(prototypeSchema).min(1),
  })
  .strict();

export type HarmonyRankerModel = z.infer<typeof harmonyRankerModelSchema>;
type IndexedPrototype = { features: readonly number[]; frequency: number };
const modelIndexes = new WeakMap<HarmonyRankerModel, ReadonlyMap<string, readonly IndexedPrototype[]>>();
const bassCatalogs = new WeakMap<HarmonyRankerModel, ReadonlyMap<string, readonly (number | null)[]>>();

export function createHarmonyRankerFeatures(
  featureVector: PaperSemiCrfAlternativeFeatures,
  chordInput: ChordSymbolInput,
): number[] {
  const chord = chordSymbolSchema.parse(chordInput);
  const root = pitchClass(chord.root);
  const relativePresence = (values: readonly number[]) =>
    Array.from({ length: 12 }, (_, interval) => Number(values[(root + interval) % 12]! > 0));
  const bass = Array.from({ length: 13 }, (_, interval) =>
    Number(
      (featureVector.bassPitchClass === undefined ? 12 : (featureVector.bassPitchClass - root + 12) % 12) === interval,
    ),
  );
  return [
    ...relativePresence(featureVector.durationByPitchClass),
    ...relativePresence(featureVector.onsetCountByPitchClass),
    ...bass,
  ];
}

export function harmonyChordShape(chordInput: ChordSymbolInput): string {
  const chord = chordSymbolSchema.parse(chordInput);
  const root = pitchClass(chord.root);
  const bassInterval = chord.bass === undefined ? "" : (pitchClass(chord.bass) - root + 12) % 12;
  return `${chord.kind}|${chord.extension ?? ""}|${JSON.stringify(chord.degrees)}|${bassInterval}`;
}

export function learnedBassIntervals(model: HarmonyRankerModel, chordInput: ChordSymbolInput): Array<number | null> {
  const chord = chordSymbolSchema.parse(chordInput);
  const prefix = `${chord.kind}|${chord.extension ?? ""}|${JSON.stringify(chord.degrees)}|`;
  const existing = bassCatalogs.get(model);
  if (existing) return [...(existing.get(prefix) ?? [])];
  const catalog = new Map<string, Set<number | null>>();
  for (const prototype of model.prototypes) {
    const separator = prototype.chordShape.lastIndexOf("|");
    const shapePrefix = prototype.chordShape.slice(0, separator + 1);
    const encoded = prototype.chordShape.slice(separator + 1);
    const intervals = catalog.get(shapePrefix) ?? new Set<number | null>();
    intervals.add(encoded === "" ? null : Number(encoded));
    catalog.set(shapePrefix, intervals);
  }
  const indexed = new Map([...catalog].map(([shapePrefix, intervals]) => [shapePrefix, [...intervals]]));
  bassCatalogs.set(model, indexed);
  return [...(indexed.get(prefix) ?? [])];
}

export function scoreHarmonyCandidate(
  model: HarmonyRankerModel,
  featureVector: PaperSemiCrfAlternativeFeatures,
  chordInput: ChordSymbolInput,
): number {
  const shape = harmonyChordShape(chordInput);
  const features = createHarmonyRankerFeatures(featureVector, chordInput);
  let nearest = Number.POSITIVE_INFINITY;
  let score = 0;
  for (const prototype of indexModel(model).get(shape) ?? []) {
    const distance = features.reduce((sum, value, index) => sum + (value - prototype.features[index]!) ** 2, 0);
    if (distance < nearest) {
      nearest = distance;
      score = Math.log1p(prototype.frequency) - distance * 4;
    } else if (distance === nearest) {
      score = Math.max(score, Math.log1p(prototype.frequency) - distance * 4);
    }
  }
  return Number.isFinite(nearest) ? score : -10;
}

function indexModel(model: HarmonyRankerModel): ReadonlyMap<string, readonly IndexedPrototype[]> {
  const existing = modelIndexes.get(model);
  if (existing) return existing;
  const index = new Map<string, IndexedPrototype[]>();
  for (const prototype of model.prototypes)
    index.set(prototype.chordShape, [
      ...(index.get(prototype.chordShape) ?? []),
      { features: prototype.features, frequency: prototype.frequency },
    ]);
  modelIndexes.set(model, index);
  return index;
}

function pitchClass(pitch: ChordSymbolInput["root"]): number {
  const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const;
  return (natural[pitch.step] + pitch.alter + 12) % 12;
}
