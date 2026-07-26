import type { PaperSemiCrfSegment } from "@zupulse/web-core";

export type PaperSemiCrfWindowMetricRecord = {
  id: string;
  eventDurationTicks: readonly number[];
  goldSegments: readonly (Omit<PaperSemiCrfSegment, "labelId"> & { labelId: number })[];
};

type PaperSemiCrfWindowPrediction = {
  id: string;
  segments: readonly PaperSemiCrfSegment[];
};

export function calculatePaperSemiCrfWindowMetrics(
  records: readonly PaperSemiCrfWindowMetricRecord[],
  predictions: readonly PaperSemiCrfWindowPrediction[],
) {
  const predictionsById = new Map(predictions.map((prediction) => [prediction.id, prediction]));
  let correctEvents = 0;
  let totalEvents = 0;
  let correctTicks = 0;
  let totalTicks = 0;
  let correctSegments = 0;
  let predictedSegments = 0;
  let goldSegments = 0;
  let correctBoundaries = 0;
  let predictedBoundaries = 0;
  let goldBoundaries = 0;
  for (const record of records) {
    const prediction = predictionsById.get(record.id);
    if (prediction === undefined) throw new Error(`missing paper Semi-CRF window prediction: ${record.id}`);
    const predictedLabels = expandLabels(prediction.segments, record.eventDurationTicks.length);
    const goldLabels = expandLabels(record.goldSegments, record.eventDurationTicks.length);
    totalEvents += record.eventDurationTicks.length;
    for (const [index, durationTicks] of record.eventDurationTicks.entries()) {
      if (!Number.isSafeInteger(durationTicks) || durationTicks <= 0) {
        throw new Error("invalid paper Semi-CRF window event duration");
      }
      totalTicks += durationTicks;
      if (predictedLabels[index] === goldLabels[index]) {
        correctEvents += 1;
        correctTicks += durationTicks;
      }
    }
    const predictedSegmentKeys = new Set(prediction.segments.map(segmentKey));
    correctSegments += record.goldSegments.filter((segment) => predictedSegmentKeys.has(segmentKey(segment))).length;
    predictedSegments += prediction.segments.length;
    goldSegments += record.goldSegments.length;
    const predictedBoundarySet = new Set(prediction.segments.slice(1).map((segment) => segment.startEvent));
    const goldBoundarySet = new Set(record.goldSegments.slice(1).map((segment) => segment.startEvent));
    correctBoundaries += [...goldBoundarySet].filter((boundary) => predictedBoundarySet.has(boundary)).length;
    predictedBoundaries += predictedBoundarySet.size;
    goldBoundaries += goldBoundarySet.size;
  }
  return {
    events: ratioMetric(correctEvents, totalEvents, "correct", "total"),
    duration: {
      correctTicks,
      totalTicks,
      accuracy: totalTicks === 0 ? 0 : correctTicks / totalTicks,
    },
    segments: precisionRecallMetric(correctSegments, predictedSegments, goldSegments),
    boundaries: precisionRecallMetric(correctBoundaries, predictedBoundaries, goldBoundaries),
    density: {
      predicted: predictedSegments,
      gold: goldSegments,
      ratio: goldSegments === 0 ? 0 : predictedSegments / goldSegments,
    },
  };
}

function expandLabels(segments: readonly PaperSemiCrfSegment[], eventCount: number): number[] {
  const labels = Array.from({ length: eventCount }, () => -1);
  for (const segment of segments) {
    for (let index = segment.startEvent; index < segment.endEvent; index += 1) labels[index] = segment.labelId;
  }
  if (labels.includes(-1)) throw new Error("paper Semi-CRF window path must cover every event");
  return labels;
}

function segmentKey(segment: PaperSemiCrfSegment): string {
  return `${segment.startEvent}:${segment.endEvent}:${segment.labelId}`;
}

function ratioMetric(
  numerator: number,
  denominator: number,
  numeratorName: "correct",
  denominatorName: "total",
): { correct: number; total: number; accuracy: number } {
  return {
    [numeratorName]: numerator,
    [denominatorName]: denominator,
    accuracy: denominator === 0 ? 0 : numerator / denominator,
  };
}

function precisionRecallMetric(correct: number, predicted: number, gold: number) {
  const precision = predicted === 0 ? 0 : correct / predicted;
  const recall = gold === 0 ? 0 : correct / gold;
  return {
    correct,
    predicted,
    gold,
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
  };
}
