import {
  createPaperSemiCrfFactorizedLinearPotential,
  createPaperSemiCrfLabelInventory,
  decodePaperSemiCrf,
  parsePaperSemiCrfLinearModel,
  type PaperSemiCrfLinearModel,
  type PaperSemiCrfSegment,
  type PaperSemiCrfSupportedLabel,
} from "@zupulse/web-core";
import { parsePaperSemiCrfEvaluationRecords, type PaperSemiCrfRecordsFile } from "./paperSemiCrfRecords";

export type PaperSemiCrfEvaluationMetrics = {
  events: { correct: number; total: number; accuracy: number };
  segments: {
    correct: number;
    predicted: number;
    gold: number;
    precision: number;
    recall: number;
    f1: number;
  };
};

export function evaluatePaperSemiCrfRecords(input: {
  records: PaperSemiCrfRecordsFile;
  model: PaperSemiCrfLinearModel;
  allowFinal?: boolean;
}): {
  metrics: PaperSemiCrfEvaluationMetrics;
  predictions: Array<{ id: string; segments: PaperSemiCrfSegment[] }>;
  recordPerformance: Array<{ id: string; eventCount: number; runtimeMs: number }>;
} {
  const records = parsePaperSemiCrfEvaluationRecords(input.records, {
    ...(input.allowFinal === undefined ? {} : { allowFinal: input.allowFinal }),
  });
  const model = parsePaperSemiCrfLinearModel(input.model);
  if (
    model.labels.length !== records.labels.length ||
    model.labels.some((label, index) => label !== records.labels[index])
  ) {
    throw new Error("model labels must exactly match evaluation records");
  }
  if (model.maxSegmentLength !== records.maxSegmentLength) {
    throw new Error("model maxSegmentLength must match evaluation records");
  }
  const labels = supportedLabels(model.labels);
  const dictionary = {
    featureVersion: model.featureVersion,
    featureNames: model.featureNames,
  };
  let correctEvents = 0;
  let totalEvents = 0;
  let correctSegments = 0;
  let predictedSegments = 0;
  let goldSegments = 0;
  const labelIds = new Map(model.labels.map((label, index) => [label, index]));
  const recordPerformance: Array<{ id: string; eventCount: number; runtimeMs: number }> = [];
  const predictions = records.records.map((record) => {
    const startedAt = performance.now();
    const decoded = decodePaperSemiCrf({
      eventCount: record.events.length,
      labelCount: labels.length,
      maxSegmentLength: model.maxSegmentLength,
      potential: createPaperSemiCrfFactorizedLinearPotential({
        events: record.events,
        labels,
        dictionary,
        weights: model.weights,
      }),
    });
    recordPerformance.push({
      id: record.id,
      eventCount: record.events.length,
      runtimeMs: performance.now() - startedAt,
    });
    const gold = record.targetSegments.map((segment) => ({
      startEvent: segment.startEvent,
      endEvent: segment.endEvent,
      labelId: labelIds.get(segment.label)!,
    }));
    const predictedLabels = expandLabels(decoded.segments, record.events.length);
    const goldLabels = expandLabels(gold, record.events.length);
    totalEvents += record.events.length;
    for (let index = 0; index < record.events.length; index += 1) {
      if (predictedLabels[index] === goldLabels[index]) correctEvents += 1;
    }
    const predictedKeys = new Set(decoded.segments.map(segmentKey));
    correctSegments += gold.filter((segment) => predictedKeys.has(segmentKey(segment))).length;
    predictedSegments += decoded.segments.length;
    goldSegments += gold.length;
    return { id: record.id, segments: decoded.segments };
  });
  const precision = predictedSegments === 0 ? 0 : correctSegments / predictedSegments;
  const recall = goldSegments === 0 ? 0 : correctSegments / goldSegments;
  return {
    metrics: {
      events: {
        correct: correctEvents,
        total: totalEvents,
        accuracy: totalEvents === 0 ? 0 : correctEvents / totalEvents,
      },
      segments: {
        correct: correctSegments,
        predicted: predictedSegments,
        gold: goldSegments,
        precision,
        recall,
        f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
      },
    },
    predictions,
    recordPerformance,
  };
}

function expandLabels(segments: readonly PaperSemiCrfSegment[], eventCount: number): number[] {
  const labels = Array.from({ length: eventCount }, () => -1);
  for (const segment of segments) {
    for (let index = segment.startEvent; index < segment.endEvent; index += 1) labels[index] = segment.labelId;
  }
  return labels;
}

function segmentKey(segment: PaperSemiCrfSegment): string {
  return `${segment.startEvent}:${segment.endEvent}:${segment.labelId}`;
}

function supportedLabels(referenceLabels: readonly string[]): PaperSemiCrfSupportedLabel[] {
  const labels = createPaperSemiCrfLabelInventory(referenceLabels).labels;
  if (labels.some((label) => label.status !== "supported")) {
    throw new Error("paper Semi-CRF evaluation labels must be supported");
  }
  return labels as PaperSemiCrfSupportedLabel[];
}
