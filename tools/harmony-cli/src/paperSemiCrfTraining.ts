import {
  createPaperSemiCrfFeatureDictionary,
  createPaperSemiCrfFeatureProvider,
  createPaperSemiCrfLabelInventory,
  createPaperSemiCrfNamedFeatureProvider,
  evaluatePaperSemiCrfNegativeLogLikelihood,
  PAPER_SEMI_CRF_FEATURE_VERSION,
  PAPER_SEMI_CRF_LABEL_MAPPING_VERSION,
  type PaperSemiCrfLinearModel,
  type PaperSemiCrfLocalPotentialInput,
  type PaperSemiCrfSupportedLabel,
} from "@zupulse/web-core";
import { minimizeWithPaperSemiCrfLbfgs, type PaperSemiCrfLbfgsCheckpoint } from "./paperSemiCrfLbfgs";
import { parsePaperSemiCrfTrainingRecords, type PaperSemiCrfRecordsFile } from "./paperSemiCrfRecords";

export type TrainPaperSemiCrfInput = {
  records: PaperSemiCrfRecordsFile;
  l2: number;
  minFeatureCount: number;
  maxIterations: number;
  gradientTolerance?: number;
  featureNames?: readonly string[];
  initialWeights?: readonly number[];
  resume?: PaperSemiCrfLbfgsCheckpoint;
};

export function trainPaperSemiCrf(input: TrainPaperSemiCrfInput): {
  model: PaperSemiCrfLinearModel;
  checkpoint: PaperSemiCrfLbfgsCheckpoint;
  report: {
    algorithmVersion: "deterministic-lbfgs-backtracking-v1";
    status: "converged" | "max-iterations";
    iterations: number;
    records: number;
    featureCount: number;
    l2: number;
    minFeatureCount: number;
    initialObjective: number;
    finalObjective: number;
  };
} {
  const records = parsePaperSemiCrfTrainingRecords(input.records);
  validateTrainingOptions(input);
  const labels = supportedLabels(records.labels);
  const featureNames = input.featureNames
    ? [...input.featureNames]
    : collectFeatureNames(records, labels, input.minFeatureCount);
  const dictionary = createPaperSemiCrfFeatureDictionary(featureNames);
  const initialWeights = input.initialWeights ? [...input.initialWeights] : dictionary.featureNames.map(() => 0);
  if (
    initialWeights.length !== dictionary.featureNames.length ||
    (input.resume !== undefined && input.resume.weights.length !== dictionary.featureNames.length)
  ) {
    throw new Error("initial weights must match paper Semi-CRF feature names");
  }
  if (input.resume !== undefined && input.initialWeights !== undefined) {
    throw new Error("paper Semi-CRF resume and initialWeights are mutually exclusive");
  }
  const evaluate = (weights: readonly number[]) =>
    evaluateCorpusObjective(records, labels, dictionary, weights, input.l2);
  const initialObjective = input.resume?.value ?? evaluate(initialWeights).value;
  const optimized =
    input.resume === undefined
      ? minimizeWithPaperSemiCrfLbfgs({
          initialWeights,
          evaluate,
          maxIterations: input.maxIterations,
          ...(input.gradientTolerance === undefined ? {} : { gradientTolerance: input.gradientTolerance }),
        })
      : minimizeWithPaperSemiCrfLbfgs({
          resume: input.resume,
          evaluate,
          maxIterations: input.maxIterations,
          ...(input.gradientTolerance === undefined ? {} : { gradientTolerance: input.gradientTolerance }),
        });
  const model: PaperSemiCrfLinearModel = {
    schemaVersion: "paper-semi-crf-linear-v1",
    labelMappingVersion: PAPER_SEMI_CRF_LABEL_MAPPING_VERSION,
    featureVersion: PAPER_SEMI_CRF_FEATURE_VERSION,
    labels: [...records.labels],
    featureNames: dictionary.featureNames,
    weights: optimized.weights,
    maxSegmentLength: records.maxSegmentLength,
  };
  return {
    model,
    checkpoint: optimized.checkpoint,
    report: {
      algorithmVersion: "deterministic-lbfgs-backtracking-v1",
      status: optimized.status,
      iterations: optimized.iterations,
      records: records.records.length,
      featureCount: dictionary.featureNames.length,
      l2: input.l2,
      minFeatureCount: input.minFeatureCount,
      initialObjective,
      finalObjective: optimized.value,
    },
  };
}

function collectFeatureNames(
  records: PaperSemiCrfRecordsFile & { role: "train" },
  labels: readonly PaperSemiCrfSupportedLabel[],
  minFeatureCount: number,
): string[] {
  const counts = new Map<string, number>();
  for (const record of records.records) {
    const named = createPaperSemiCrfNamedFeatureProvider({ events: record.events, labels });
    forEachLegalLocal(record.events.length, labels.length, records.maxSegmentLength, (local) => {
      for (const name of named(local)) counts.set(name, (counts.get(name) ?? 0) + 1);
    });
  }
  return [...counts].filter(([, count]) => count > minFeatureCount).map(([name]) => name);
}

function evaluateCorpusObjective(
  records: PaperSemiCrfRecordsFile & { role: "train" },
  labels: readonly PaperSemiCrfSupportedLabel[],
  dictionary: ReturnType<typeof createPaperSemiCrfFeatureDictionary>,
  weights: readonly number[],
  l2: number,
): { value: number; gradient: number[] } {
  let value = 0;
  const gradient = weights.map(() => 0);
  const labelIds = new Map(records.labels.map((label, index) => [label, index]));
  for (const record of records.records) {
    const evaluated = evaluatePaperSemiCrfNegativeLogLikelihood({
      eventCount: record.events.length,
      labelCount: labels.length,
      maxSegmentLength: records.maxSegmentLength,
      weights,
      features: createPaperSemiCrfFeatureProvider({ events: record.events, labels, dictionary }),
      targetSegments: record.targetSegments.map((segment) => ({
        startEvent: segment.startEvent,
        endEvent: segment.endEvent,
        labelId: labelIds.get(segment.label)!,
      })),
      l2: 0,
    });
    value += evaluated.value;
    for (let index = 0; index < gradient.length; index += 1) gradient[index]! += evaluated.gradient[index]!;
  }
  for (let index = 0; index < weights.length; index += 1) {
    value += 0.5 * l2 * weights[index]! * weights[index]!;
    gradient[index]! += l2 * weights[index]!;
  }
  if (!Number.isFinite(value) || gradient.some((component) => !Number.isFinite(component))) {
    throw new Error("non-finite paper Semi-CRF corpus objective");
  }
  return { value, gradient };
}

function supportedLabels(referenceLabels: readonly string[]): PaperSemiCrfSupportedLabel[] {
  const labels = createPaperSemiCrfLabelInventory(referenceLabels).labels;
  if (labels.some((label) => label.status !== "supported")) {
    throw new Error("paper Semi-CRF training labels must be supported");
  }
  return labels as PaperSemiCrfSupportedLabel[];
}

function forEachLegalLocal(
  eventCount: number,
  labelCount: number,
  maxSegmentLength: number,
  visit: (input: PaperSemiCrfLocalPotentialInput) => void,
): void {
  for (let endEvent = 1; endEvent <= eventCount; endEvent += 1) {
    for (let startEvent = Math.max(0, endEvent - maxSegmentLength); startEvent < endEvent; startEvent += 1) {
      for (let labelId = 0; labelId < labelCount; labelId += 1) {
        const segment = { startEvent, endEvent, labelId };
        if (startEvent === 0) {
          visit({ segment });
        } else {
          for (let previousLabelId = 0; previousLabelId < labelCount; previousLabelId += 1) {
            visit({ segment, previousLabelId });
          }
        }
      }
    }
  }
}

function validateTrainingOptions(input: TrainPaperSemiCrfInput): void {
  if (!Number.isFinite(input.l2) || input.l2 < 0) throw new Error("paper Semi-CRF l2 must be nonnegative");
  if (!Number.isSafeInteger(input.minFeatureCount) || input.minFeatureCount < 0) {
    throw new Error("paper Semi-CRF minFeatureCount must be a nonnegative integer");
  }
  if (!Number.isSafeInteger(input.maxIterations) || input.maxIterations < 0) {
    throw new Error("paper Semi-CRF maxIterations must be a nonnegative integer");
  }
}
