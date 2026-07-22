import { z } from "zod";
import { chordSymbolSchema, type ChordSymbolInput } from "./schemas";

const CHORD_KINDS = [
  "major",
  "minor",
  "dominant",
  "diminished",
  "half-diminished",
  "augmented",
  "suspended-second",
  "suspended-fourth",
  "power",
] as const;
const EXTENSIONS = [undefined, 6, 7, 9, 11, 13] as const;
const DEGREE_OPERATIONS = ["add", "alter", "subtract"] as const;
export const LINEAR_HARMONY_FEATURE_LENGTH = 37 + CHORD_KINDS.length + EXTENSIONS.length + DEGREE_OPERATIONS.length + 4;

const twoDecimalWeightSchema = z
  .number()
  .finite()
  .refine((value) => Number(value.toFixed(2)) === value, "weights must have at most two decimals");

export const linearHarmonyRerankerModelSchema = z
  .object({
    version: z.literal(1),
    featureVersion: z.literal("candidate-linear-v2"),
    algorithmVersion: z.literal("listwise-sgd-v1"),
    trainingSourcesSha256: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1),
    trainingGroupsSha256: z.string().regex(/^[a-f0-9]{64}$/),
    weights: z.array(twoDecimalWeightSchema).length(LINEAR_HARMONY_FEATURE_LENGTH),
  })
  .strict();

export type LinearHarmonyRerankerModel = z.infer<typeof linearHarmonyRerankerModelSchema>;
export type LinearHarmonyCandidateInput = {
  chord: ChordSymbolInput;
  features: readonly number[];
  ruleLocalScore: number;
  ruleSequenceScore: number;
};

export function createLinearHarmonyFeatures(
  candidates: readonly LinearHarmonyCandidateInput[],
  index: number,
  rulePrimaryIndex = -1,
): number[] {
  const candidate = candidates[index];
  if (!candidate || candidate.features.length !== 37) throw new Error(`invalid linear candidate index: ${index}`);
  const chord = chordSymbolSchema.parse(candidate.chord);
  const maxLocal = Math.max(1, ...candidates.map((item) => Math.abs(item.ruleLocalScore)));
  const maxSequence = Math.max(1, ...candidates.map((item) => Math.abs(item.ruleSequenceScore)));
  return [
    ...candidate.features,
    ...CHORD_KINDS.map((kind) => Number(chord.kind === kind)),
    ...EXTENSIONS.map((extension) => Number(chord.extension === extension)),
    ...DEGREE_OPERATIONS.map((operation) => Number(chord.degrees.some((degree) => degree.operation === operation))),
    candidate.ruleLocalScore / maxLocal,
    candidate.ruleSequenceScore / maxSequence,
    candidates.length === 1 ? 1 : 1 - index / (candidates.length - 1),
    Number(index === rulePrimaryIndex),
  ];
}

export function rankHarmonyCandidatesLinear(
  modelInput: LinearHarmonyRerankerModel,
  candidates: readonly LinearHarmonyCandidateInput[],
  rulePrimaryIndex = -1,
): Array<{ index: number; logit: number }> {
  const model = linearHarmonyRerankerModelSchema.parse(modelInput);
  return candidates
    .map((_, index) => ({
      index,
      logit: createLinearHarmonyFeatures(candidates, index, rulePrimaryIndex).reduce(
        (sum, value, featureIndex) => sum + value * model.weights[featureIndex]!,
        0,
      ),
    }))
    .sort((a, b) => b.logit - a.logit || a.index - b.index)
    .map(({ index, logit }) => ({ index, logit: Number(logit.toFixed(2)) }));
}
