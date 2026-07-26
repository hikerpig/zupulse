import { z } from "zod";
import { createPaperSemiCrfLabelInventory, PAPER_SEMI_CRF_LABEL_MAPPING_VERSION } from "./paper-semi-crf-labels";

export const PAPER_SEMI_CRF_FEATURE_VERSION = "masada-bunescu-enabled-features-v1" as const;

export const paperSemiCrfLinearModelSchema = z
  .object({
    schemaVersion: z.literal("paper-semi-crf-linear-v1"),
    labelMappingVersion: z.literal(PAPER_SEMI_CRF_LABEL_MAPPING_VERSION),
    featureVersion: z.literal(PAPER_SEMI_CRF_FEATURE_VERSION),
    labels: z.array(z.string().min(1)).min(1),
    featureNames: z.array(z.string().min(1)),
    weights: z.array(z.number().refine(Number.isFinite, "weights must be finite")),
    maxSegmentLength: z.number().int().positive(),
  })
  .strict()
  .superRefine((model, context) => {
    if (model.featureNames.length !== model.weights.length) {
      context.addIssue({
        code: "custom",
        path: ["weights"],
        message: "featureNames and weights must have equal length",
      });
    }
    if (new Set(model.featureNames).size !== model.featureNames.length) {
      context.addIssue({
        code: "custom",
        path: ["featureNames"],
        message: "featureNames must be unique",
      });
    }
    if (new Set(model.labels).size !== model.labels.length) {
      context.addIssue({ code: "custom", path: ["labels"], message: "labels must be unique" });
    }
    if (createPaperSemiCrfLabelInventory(model.labels).labels.some((label) => label.status === "unsupported")) {
      context.addIssue({
        code: "custom",
        path: ["labels"],
        message: "labels must map to ChordSymbol",
      });
    }
  });

export type PaperSemiCrfLinearModel = z.infer<typeof paperSemiCrfLinearModelSchema>;

export function parsePaperSemiCrfLinearModel(input: unknown): PaperSemiCrfLinearModel {
  return paperSemiCrfLinearModelSchema.parse(input);
}

export type PaperSemiCrfSegment = {
  startEvent: number;
  endEvent: number;
  labelId: number;
};

export type PaperSemiCrfLocalPotentialInput = {
  segment: PaperSemiCrfSegment;
  previousLabelId?: number;
};

export type PaperSemiCrfLocalPotential = (input: PaperSemiCrfLocalPotentialInput) => number;

export type PaperSemiCrfFeature = {
  index: number;
  value: number;
};

export type PaperSemiCrfFeatureProvider = (input: PaperSemiCrfLocalPotentialInput) => readonly PaperSemiCrfFeature[];

export type PaperSemiCrfLinearLatticeInput = {
  eventCount: number;
  labelCount: number;
  maxSegmentLength: number;
  weights: readonly number[];
  features: PaperSemiCrfFeatureProvider;
};

export function scorePaperSemiCrfLocalPotential(
  potential: PaperSemiCrfLocalPotential,
  input: PaperSemiCrfLocalPotentialInput,
): number {
  const score = potential(input);
  if (!Number.isFinite(score)) throw new Error("non-finite paper semi-CRF potential");
  return score;
}

export function createPaperSemiCrfLinearPotential(
  weights: readonly number[],
  features: PaperSemiCrfFeatureProvider,
): PaperSemiCrfLocalPotential {
  const local = createLinearLocalScorer(weights, features);
  return (input) => local(input).score;
}

export function computePaperSemiCrfLogPartition(input: PaperSemiCrfLinearLatticeInput): number {
  validateLinearLattice(input);
  if (input.eventCount === 0) return 0;
  const local = createLinearLocalScorer(input.weights, input.features);
  const forward = computeForward(input, local);
  return logSumExp(forward[input.eventCount]!);
}

export function evaluatePaperSemiCrfNegativeLogLikelihood(
  input: PaperSemiCrfLinearLatticeInput & {
    targetSegments: readonly PaperSemiCrfSegment[];
    l2: number;
  },
): {
  value: number;
  gradient: number[];
  logPartition: number;
  targetScore: number;
} {
  validateLinearLattice(input);
  validateTargetPath(input);
  if (!Number.isFinite(input.l2) || input.l2 < 0) throw new Error("invalid paper semi-CRF regularization");
  const local = createLinearLocalScorer(input.weights, input.features);
  const forward = computeForward(input, local);
  const backward = computeBackward(input, local);
  const logPartition = input.eventCount === 0 ? 0 : logSumExp(forward[input.eventCount]!);
  const expectedCounts = Array.from({ length: input.weights.length }, () => 0);
  accumulateExpectedCounts(input, local, forward, backward, logPartition, expectedCounts);
  const targetCounts = Array.from({ length: input.weights.length }, () => 0);
  let targetScore = 0;
  for (const [index, segment] of input.targetSegments.entries()) {
    const scored = local({
      segment,
      ...(index === 0 ? {} : { previousLabelId: input.targetSegments[index - 1]!.labelId }),
    });
    targetScore += scored.score;
    addFeatureCounts(targetCounts, scored.features, 1);
  }
  const squaredWeightSum = input.weights.reduce((sum, weight) => sum + weight * weight, 0);
  const value = logPartition - targetScore + 0.5 * input.l2 * squaredWeightSum;
  const gradient = input.weights.map(
    (weight, index) => expectedCounts[index]! - targetCounts[index]! + input.l2 * weight,
  );
  if (!Number.isFinite(value) || gradient.some((component) => !Number.isFinite(component))) {
    throw new Error("non-finite paper semi-CRF objective");
  }
  return { value, gradient, logPartition, targetScore };
}

type ScoredLocal = {
  score: number;
  features: readonly PaperSemiCrfFeature[];
};

type LinearLocalScorer = (input: PaperSemiCrfLocalPotentialInput) => ScoredLocal;

function createLinearLocalScorer(
  weights: readonly number[],
  featureProvider: PaperSemiCrfFeatureProvider,
): LinearLocalScorer {
  for (const weight of weights) {
    if (!Number.isFinite(weight)) throw new Error("non-finite paper semi-CRF weight");
  }
  const cache = new Map<string, ScoredLocal>();
  return (input) => {
    const key = `${input.segment.startEvent}:${input.segment.endEvent}:${input.segment.labelId}:${input.previousLabelId ?? "start"}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const features = featureProvider(input);
    let score = 0;
    for (const feature of features) {
      if (
        !Number.isSafeInteger(feature.index) ||
        feature.index < 0 ||
        feature.index >= weights.length ||
        !Number.isFinite(feature.value)
      ) {
        throw new Error("invalid paper semi-CRF feature");
      }
      score += weights[feature.index]! * feature.value;
    }
    if (!Number.isFinite(score)) throw new Error("non-finite paper semi-CRF potential");
    const scored = { score, features };
    cache.set(key, scored);
    return scored;
  };
}

function computeForward(input: PaperSemiCrfLinearLatticeInput, local: LinearLocalScorer): number[][] {
  const forward = Array.from({ length: input.eventCount + 1 }, () =>
    Array.from({ length: input.labelCount }, () => Number.NEGATIVE_INFINITY),
  );
  for (let endEvent = 1; endEvent <= input.eventCount; endEvent += 1) {
    const earliestStart = Math.max(0, endEvent - input.maxSegmentLength);
    for (let labelId = 0; labelId < input.labelCount; labelId += 1) {
      const scores: number[] = [];
      for (let startEvent = earliestStart; startEvent < endEvent; startEvent += 1) {
        const segment = { startEvent, endEvent, labelId };
        if (startEvent === 0) {
          scores.push(local({ segment }).score);
          continue;
        }
        for (let previousLabelId = 0; previousLabelId < input.labelCount; previousLabelId += 1) {
          scores.push(forward[startEvent]![previousLabelId]! + local({ segment, previousLabelId }).score);
        }
      }
      forward[endEvent]![labelId] = logSumExp(scores);
    }
  }
  return forward;
}

function computeBackward(input: PaperSemiCrfLinearLatticeInput, local: LinearLocalScorer): number[][] {
  const backward = Array.from({ length: input.eventCount + 1 }, () =>
    Array.from({ length: input.labelCount }, () => Number.NEGATIVE_INFINITY),
  );
  backward[input.eventCount]!.fill(0);
  for (let startEvent = input.eventCount - 1; startEvent >= 1; startEvent -= 1) {
    const latestEnd = Math.min(input.eventCount, startEvent + input.maxSegmentLength);
    for (let previousLabelId = 0; previousLabelId < input.labelCount; previousLabelId += 1) {
      const scores: number[] = [];
      for (let endEvent = startEvent + 1; endEvent <= latestEnd; endEvent += 1) {
        for (let labelId = 0; labelId < input.labelCount; labelId += 1) {
          const segment = { startEvent, endEvent, labelId };
          scores.push(local({ segment, previousLabelId }).score + backward[endEvent]![labelId]!);
        }
      }
      backward[startEvent]![previousLabelId] = logSumExp(scores);
    }
  }
  return backward;
}

function accumulateExpectedCounts(
  input: PaperSemiCrfLinearLatticeInput,
  local: LinearLocalScorer,
  forward: readonly (readonly number[])[],
  backward: readonly (readonly number[])[],
  logPartition: number,
  counts: number[],
): void {
  if (input.eventCount === 0) return;
  for (let endEvent = 1; endEvent <= Math.min(input.eventCount, input.maxSegmentLength); endEvent += 1) {
    for (let labelId = 0; labelId < input.labelCount; labelId += 1) {
      const scored = local({ segment: { startEvent: 0, endEvent, labelId } });
      addFeatureCounts(counts, scored.features, Math.exp(scored.score + backward[endEvent]![labelId]! - logPartition));
    }
  }
  for (let startEvent = 1; startEvent < input.eventCount; startEvent += 1) {
    const latestEnd = Math.min(input.eventCount, startEvent + input.maxSegmentLength);
    for (let endEvent = startEvent + 1; endEvent <= latestEnd; endEvent += 1) {
      for (let labelId = 0; labelId < input.labelCount; labelId += 1) {
        const segment = { startEvent, endEvent, labelId };
        for (let previousLabelId = 0; previousLabelId < input.labelCount; previousLabelId += 1) {
          const scored = local({ segment, previousLabelId });
          const logProbability =
            forward[startEvent]![previousLabelId]! + scored.score + backward[endEvent]![labelId]! - logPartition;
          addFeatureCounts(counts, scored.features, Math.exp(logProbability));
        }
      }
    }
  }
}

function addFeatureCounts(counts: number[], features: readonly PaperSemiCrfFeature[], scale: number): void {
  for (const feature of features) counts[feature.index]! += feature.value * scale;
}

function validateLinearLattice(input: PaperSemiCrfLinearLatticeInput): void {
  if (
    !Number.isSafeInteger(input.eventCount) ||
    input.eventCount < 0 ||
    !Number.isSafeInteger(input.labelCount) ||
    input.labelCount <= 0 ||
    !Number.isSafeInteger(input.maxSegmentLength) ||
    input.maxSegmentLength <= 0
  ) {
    throw new Error("invalid paper semi-CRF lattice");
  }
  for (const weight of input.weights) {
    if (!Number.isFinite(weight)) throw new Error("non-finite paper semi-CRF weight");
  }
}

function validateTargetPath(
  input: PaperSemiCrfLinearLatticeInput & { targetSegments: readonly PaperSemiCrfSegment[] },
): void {
  let nextStart = 0;
  for (const segment of input.targetSegments) {
    if (
      segment.startEvent !== nextStart ||
      !Number.isSafeInteger(segment.endEvent) ||
      segment.endEvent <= segment.startEvent ||
      segment.endEvent - segment.startEvent > input.maxSegmentLength ||
      !Number.isSafeInteger(segment.labelId) ||
      segment.labelId < 0 ||
      segment.labelId >= input.labelCount
    ) {
      throw new Error("invalid paper semi-CRF target path");
    }
    nextStart = segment.endEvent;
  }
  if (nextStart !== input.eventCount) throw new Error("invalid paper semi-CRF target path");
}

function logSumExp(values: readonly number[]): number {
  if (values.length === 0) return Number.NEGATIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const value of values) maximum = Math.max(maximum, value);
  if (maximum === Number.NEGATIVE_INFINITY) return maximum;
  const result = maximum + Math.log(values.reduce((sum, value) => sum + Math.exp(value - maximum), 0));
  if (!Number.isFinite(result)) throw new Error("non-finite paper semi-CRF partition");
  return result;
}
