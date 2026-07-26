import {
  createPaperSemiCrfFeatureDictionary,
  createPaperSemiCrfLabelInventory,
  createPaperSemiCrfNamedFeatureProvider,
  encodePaperSemiCrfNamedFeatures,
  evaluatePaperSemiCrfFactorizedNegativeLogLikelihood,
  extractPaperSemiCrfTransitionFeature,
  PAPER_SEMI_CRF_FEATURE_VERSION,
  PAPER_SEMI_CRF_LABEL_MAPPING_VERSION,
  type PaperSemiCrfLinearModel,
  type PaperSemiCrfLocalPotentialInput,
  type PaperSemiCrfPackedFeatures,
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

type CompiledPaperSemiCrfRecord = {
  eventCount: number;
  segmentFeatures: (segment: PaperSemiCrfLocalPotentialInput["segment"]) => PaperSemiCrfPackedFeatures;
  targetSegments: PaperSemiCrfLocalPotentialInput["segment"][];
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
    performance: {
      compileMs: number;
      objectiveEvaluations: number;
      objectiveRuntimeMs: number;
    };
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
  const compileStartedAt = performance.now();
  const compiledRecords = compileRecords(records, labels, dictionary);
  const transitionFeatures = labels.map((current) =>
    labels.map((previous) =>
      encodePaperSemiCrfNamedFeatures(dictionary, [extractPaperSemiCrfTransitionFeature(current, previous)]),
    ),
  );
  const compileMs = performance.now() - compileStartedAt;
  let objectiveEvaluations = 0;
  let objectiveRuntimeMs = 0;
  const evaluate = (weights: readonly number[]) => {
    const startedAt = performance.now();
    const evaluated = evaluateCorpusObjective(
      compiledRecords,
      transitionFeatures,
      labels.length,
      records.maxSegmentLength,
      weights,
      input.l2,
    );
    objectiveEvaluations += 1;
    objectiveRuntimeMs += performance.now() - startedAt;
    return evaluated;
  };
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
      performance: { compileMs, objectiveEvaluations, objectiveRuntimeMs },
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
    forEachLegalSegment(record.events.length, labels.length, records.maxSegmentLength, (segment) => {
      for (const name of named({ segment })) counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    if (record.events.length > 1) {
      for (const current of labels) {
        for (const previous of labels) {
          const name = extractPaperSemiCrfTransitionFeature(current, previous);
          counts.set(name, (counts.get(name) ?? 0) + (record.events.length - 1));
        }
      }
    }
  }
  return [...counts].filter(([, count]) => count > minFeatureCount).map(([name]) => name);
}

function evaluateCorpusObjective(
  records: readonly CompiledPaperSemiCrfRecord[],
  transitionFeatures: readonly (readonly ReturnType<typeof encodePaperSemiCrfNamedFeatures>[])[],
  labelCount: number,
  maxSegmentLength: number,
  weights: readonly number[],
  l2: number,
): { value: number; gradient: number[] } {
  let value = 0;
  const gradient = weights.map(() => 0);
  for (const record of records) {
    const evaluated = evaluatePaperSemiCrfFactorizedNegativeLogLikelihood({
      eventCount: record.eventCount,
      labelCount,
      maxSegmentLength,
      weights,
      segmentFeatures: record.segmentFeatures,
      transitionFeatures: (currentLabelId, previousLabelId) => transitionFeatures[currentLabelId]![previousLabelId]!,
      targetSegments: record.targetSegments,
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

function compileRecords(
  records: PaperSemiCrfRecordsFile & { role: "train" },
  labels: readonly PaperSemiCrfSupportedLabel[],
  dictionary: ReturnType<typeof createPaperSemiCrfFeatureDictionary>,
): CompiledPaperSemiCrfRecord[] {
  const labelIds = new Map(records.labels.map((label, index) => [label, index]));
  return records.records.map((record) => {
    const named = createPaperSemiCrfNamedFeatureProvider({ events: record.events, labels });
    const vectorCount = countLegalSegments(record.events.length, records.maxSegmentLength) * labels.length;
    const builder = new PackedFeatureBuilder(vectorCount);
    forEachLegalSegment(record.events.length, labels.length, records.maxSegmentLength, (segment) => {
      builder.append(encodePaperSemiCrfNamedFeatures(dictionary, named({ segment })));
    });
    const packed = builder.finish();
    return {
      eventCount: record.events.length,
      segmentFeatures: (segment) => packed.vector(denseSegmentIndex(segment, labels.length, records.maxSegmentLength)),
      targetSegments: record.targetSegments.map((segment) => ({
        startEvent: segment.startEvent,
        endEvent: segment.endEvent,
        labelId: labelIds.get(segment.label)!,
      })),
    };
  });
}

const PACKED_FEATURE_CHUNK_SIZE = 65_536;

class PackedFeatureBuilder {
  readonly #offsets: Uint32Array;
  readonly #indexChunks: Uint16Array[] = [];
  readonly #valueChunks: Uint16Array[] = [];
  #featureCount = 0;
  #vectorCount = 0;

  constructor(vectorCount: number) {
    this.#offsets = new Uint32Array(vectorCount + 1);
  }

  append(features: ReturnType<typeof encodePaperSemiCrfNamedFeatures>): void {
    for (const feature of features) {
      if (
        feature.index > 65_535 ||
        !Number.isSafeInteger(feature.value) ||
        feature.value < 0 ||
        feature.value > 65_535
      ) {
        throw new Error("paper Semi-CRF packed feature exceeds uint16");
      }
      const chunkIndex = Math.floor(this.#featureCount / PACKED_FEATURE_CHUNK_SIZE);
      const chunkOffset = this.#featureCount % PACKED_FEATURE_CHUNK_SIZE;
      if (chunkOffset === 0) {
        this.#indexChunks.push(new Uint16Array(PACKED_FEATURE_CHUNK_SIZE));
        this.#valueChunks.push(new Uint16Array(PACKED_FEATURE_CHUNK_SIZE));
      }
      this.#indexChunks[chunkIndex]![chunkOffset] = feature.index;
      this.#valueChunks[chunkIndex]![chunkOffset] = feature.value;
      this.#featureCount += 1;
    }
    this.#vectorCount += 1;
    if (this.#vectorCount >= this.#offsets.length) throw new Error("too many paper Semi-CRF packed vectors");
    this.#offsets[this.#vectorCount] = this.#featureCount;
  }

  finish(): PackedFeatureTable {
    if (this.#vectorCount + 1 !== this.#offsets.length) {
      throw new Error("incomplete paper Semi-CRF packed vectors");
    }
    return new PackedFeatureTable(this.#offsets, this.#indexChunks, this.#valueChunks);
  }
}

class PackedFeatureTable {
  readonly #view: PaperSemiCrfPackedFeatures;
  #vectorIndex = 0;

  constructor(
    readonly offsets: Uint32Array,
    readonly indexChunks: readonly Uint16Array[],
    readonly valueChunks: readonly Uint16Array[],
  ) {
    this.#view = {
      forEachFeature: (visit) => {
        const start = this.offsets[this.#vectorIndex]!;
        const end = this.offsets[this.#vectorIndex + 1]!;
        for (let position = start; position < end; position += 1) {
          const chunkIndex = Math.floor(position / PACKED_FEATURE_CHUNK_SIZE);
          const chunkOffset = position % PACKED_FEATURE_CHUNK_SIZE;
          visit(this.indexChunks[chunkIndex]![chunkOffset]!, this.valueChunks[chunkIndex]![chunkOffset]!);
        }
      },
    };
  }

  vector(index: number): PaperSemiCrfPackedFeatures {
    if (!Number.isSafeInteger(index) || index < 0 || index + 1 >= this.offsets.length) {
      throw new Error("invalid paper Semi-CRF packed vector index");
    }
    this.#vectorIndex = index;
    return this.#view;
  }
}

function denseSegmentIndex(
  segment: PaperSemiCrfLocalPotentialInput["segment"],
  labelCount: number,
  maxSegmentLength: number,
): number {
  const previousEnd = segment.endEvent - 1;
  const previousSegments =
    previousEnd <= maxSegmentLength
      ? (previousEnd * (previousEnd + 1)) / 2
      : (maxSegmentLength * (maxSegmentLength + 1)) / 2 + (previousEnd - maxSegmentLength) * maxSegmentLength;
  const earliestStart = Math.max(0, segment.endEvent - maxSegmentLength);
  return (previousSegments + segment.startEvent - earliestStart) * labelCount + segment.labelId;
}

function countLegalSegments(eventCount: number, maxSegmentLength: number): number {
  return eventCount <= maxSegmentLength
    ? (eventCount * (eventCount + 1)) / 2
    : (maxSegmentLength * (maxSegmentLength + 1)) / 2 + (eventCount - maxSegmentLength) * maxSegmentLength;
}

function supportedLabels(referenceLabels: readonly string[]): PaperSemiCrfSupportedLabel[] {
  const labels = createPaperSemiCrfLabelInventory(referenceLabels).labels;
  if (labels.some((label) => label.status !== "supported")) {
    throw new Error("paper Semi-CRF training labels must be supported");
  }
  return labels as PaperSemiCrfSupportedLabel[];
}

function forEachLegalSegment(
  eventCount: number,
  labelCount: number,
  maxSegmentLength: number,
  visit: (segment: PaperSemiCrfLocalPotentialInput["segment"]) => void,
): void {
  for (let endEvent = 1; endEvent <= eventCount; endEvent += 1) {
    for (let startEvent = Math.max(0, endEvent - maxSegmentLength); startEvent < endEvent; startEvent += 1) {
      for (let labelId = 0; labelId < labelCount; labelId += 1) {
        visit({ startEvent, endEvent, labelId });
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
