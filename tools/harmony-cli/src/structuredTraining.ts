import {
  createStructuredTransitionFeatures,
  flattenStructuredTransitionFeatures,
  harmonyStructuredLinearModelSchema,
  scoreHarmonyTransition,
  STRUCTURED_SEGMENT_FEATURE_LENGTH,
  STRUCTURED_TRANSITION_FEATURE_LENGTH,
  type HarmonyStructuredLinearModel,
} from "@zupulse/web-core";
import type { HarmonyStructuredRecordPiece } from "./schemas";

type Window = HarmonyStructuredRecordPiece["windows"][number];
type PathStep = { rangeIndex: number; candidateIndex: number };

export async function trainHarmonyStructuredPerceptron(input: {
  recordsSha256: string;
  groupsSha256: string;
  epochs: number;
  learningRate: number;
  pieces: () => AsyncIterable<HarmonyStructuredRecordPiece>;
}): Promise<{
  model: HarmonyStructuredLinearModel;
  report: {
    epochs: Array<{
      epoch: number;
      pieces: number;
      windows: number;
      exactPaths: number;
      pathLoss: number;
      intervalAccuracy: number;
      boundaryF1: number;
      segmentDensity: number;
      predictedPrimary: number;
    }>;
  };
}> {
  const segmentWeights = zeros(STRUCTURED_SEGMENT_FEATURE_LENGTH);
  const transitionWeights = zeros(STRUCTURED_TRANSITION_FEATURE_LENGTH);
  const segmentTotals = zeros(STRUCTURED_SEGMENT_FEATURE_LENGTH);
  const transitionTotals = zeros(STRUCTURED_TRANSITION_FEATURE_LENGTH);
  let averagingSteps = 0;
  const epochs = [];
  for (let epoch = 0; epoch < input.epochs; epoch += 1) {
    const metrics = createMetrics();
    for await (const piece of input.pieces()) {
      metrics.pieces += 1;
      const pieceSegmentDelta = zeros(STRUCTURED_SEGMENT_FEATURE_LENGTH);
      const pieceTransitionDelta = zeros(STRUCTURED_TRANSITION_FEATURE_LENGTH);
      for (const window of piece.windows) {
        const model = transientModel(input, epoch, segmentWeights, transitionWeights);
        const predicted = decodeStructuredRecordWindow(piece, window, model);
        const gold = window.gold.map(({ rangeIndex, candidateIndex }) => ({ rangeIndex, candidateIndex }));
        observe(metrics, piece, window, gold, predicted, model);
        if (samePath(gold, predicted)) continue;
        addPathFeatures(piece, window, gold, pieceSegmentDelta, pieceTransitionDelta, 1);
        addPathFeatures(piece, window, predicted, pieceSegmentDelta, pieceTransitionDelta, -1);
      }
      if (piece.windows.length > 0) {
        addScaled(segmentWeights, pieceSegmentDelta, input.learningRate / piece.windows.length);
        addScaled(transitionWeights, pieceTransitionDelta, input.learningRate / piece.windows.length);
      }
      addScaled(segmentTotals, segmentWeights, 1);
      addScaled(transitionTotals, transitionWeights, 1);
      averagingSteps += 1;
    }
    epochs.push(finalizeMetrics(metrics, epoch + 1));
  }
  const averagedSegment = averagingSteps === 0 ? segmentWeights : segmentTotals.map((value) => value / averagingSteps);
  const averagedTransition =
    averagingSteps === 0 ? transitionWeights : transitionTotals.map((value) => value / averagingSteps);
  const model = harmonyStructuredLinearModelSchema.parse({
    schemaVersion: "1.0.0",
    featureVersion: "semi-crf-linear-v1",
    algorithmVersion: "averaged-structured-perceptron-v1",
    trainingRecordsSha256: input.recordsSha256,
    trainingGroupsSha256: input.groupsSha256,
    epochs: input.epochs,
    learningRate: q2(input.learningRate),
    ruleScale: 1,
    modelScale: 1,
    segmentWeights: averagedSegment.map(q2),
    transitionWeights: averagedTransition.map(q2),
  });
  return { model, report: { epochs } };
}

export function decodeStructuredRecordWindow(
  piece: HarmonyStructuredRecordPiece,
  window: Window,
  model: HarmonyStructuredLinearModel,
  transitionCache = new Map<string, { ruleScore: number; features: number[] }>(),
): PathStep[] {
  type State = {
    score: number;
    chordIndex?: number;
    rangeIndex?: number;
    candidateIndex?: number;
    durationQuarterNotes?: number;
    previous?: State;
  };
  const states = new Map<number, Map<number, State>>();
  states.set(window.startBoundaryIndex, new Map([[-1, { score: 0 }]]));
  const rangesByEnd = new Map<number, Array<{ range: Window["ranges"][number]; rangeIndex: number }>>();
  for (const [rangeIndex, range] of window.ranges.entries()) {
    const ranges = rangesByEnd.get(range.endBoundaryIndex) ?? [];
    ranges.push({ range, rangeIndex });
    rangesByEnd.set(range.endBoundaryIndex, ranges);
  }
  for (let end = window.startBoundaryIndex + 1; end <= window.endBoundaryIndex; end += 1) {
    const endStates = new Map<number, State>();
    for (const { range, rangeIndex } of rangesByEnd.get(end) ?? []) {
      const candidateSegmentScores = range.candidates.map(
        (candidate) =>
          model.ruleScale * candidate.ruleSequenceScore +
          model.modelScale * dot(model.segmentWeights, candidate.segmentFeatures),
      );
      for (const previous of states.get(range.startBoundaryIndex)?.values() ?? []) {
        for (const [candidateIndex, candidate] of range.candidates.entries()) {
          let score = previous.score + candidateSegmentScores[candidateIndex]!;
          if (previous.chordIndex !== undefined && previous.durationQuarterNotes !== undefined) {
            const transition = cachedTransition(
              piece,
              previous.chordIndex,
              candidate.chordIndex,
              previous.durationQuarterNotes,
              range.durationQuarterNotes,
              transitionCache,
            );
            score +=
              model.ruleScale * transition.ruleScore +
              model.modelScale * dot(model.transitionWeights, transition.features);
          }
          const existing = endStates.get(candidate.chordIndex);
          if (existing && existing.score >= score) continue;
          endStates.set(candidate.chordIndex, {
            score,
            chordIndex: candidate.chordIndex,
            rangeIndex,
            candidateIndex,
            durationQuarterNotes: range.durationQuarterNotes,
            previous,
          });
        }
      }
    }
    states.set(end, endStates);
  }
  const best = [...(states.get(window.endBoundaryIndex)?.values() ?? [])].sort((a, b) => b.score - a.score)[0];
  const path: PathStep[] = [];
  for (let state = best; state?.rangeIndex !== undefined && state.candidateIndex !== undefined; state = state.previous)
    path.push({ rangeIndex: state.rangeIndex, candidateIndex: state.candidateIndex });
  return path.reverse();
}

function cachedTransition(
  piece: HarmonyStructuredRecordPiece,
  fromChordIndex: number,
  toChordIndex: number,
  fromDurationQuarterNotes: number,
  toDurationQuarterNotes: number,
  cache: Map<string, { ruleScore: number; features: number[] }>,
) {
  const key = `${fromChordIndex}:${toChordIndex}:${fromDurationQuarterNotes}:${toDurationQuarterNotes}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const from = piece.chords[fromChordIndex]!;
  const to = piece.chords[toChordIndex]!;
  const transition = {
    ruleScore: scoreHarmonyTransition(from, to) * piece.ticksPerQuarter * 0.1,
    features: flattenStructuredTransitionFeatures(
      createStructuredTransitionFeatures({
        from,
        to,
        fromDurationQuarterNotes,
        toDurationQuarterNotes,
      }),
    ),
  };
  cache.set(key, transition);
  return transition;
}

function addPathFeatures(
  piece: HarmonyStructuredRecordPiece,
  window: Window,
  path: readonly PathStep[],
  segmentTarget: number[],
  transitionTarget: number[],
  direction: 1 | -1,
) {
  for (const [index, step] of path.entries()) {
    const range = window.ranges[step.rangeIndex]!;
    const candidate = range.candidates[step.candidateIndex]!;
    addScaled(segmentTarget, candidate.segmentFeatures, direction);
    const previous = path[index - 1];
    if (!previous) continue;
    const previousRange = window.ranges[previous.rangeIndex]!;
    const previousCandidate = previousRange.candidates[previous.candidateIndex]!;
    addScaled(
      transitionTarget,
      flattenStructuredTransitionFeatures(
        createStructuredTransitionFeatures({
          from: piece.chords[previousCandidate.chordIndex]!,
          to: piece.chords[candidate.chordIndex]!,
          fromDurationQuarterNotes: previousRange.durationQuarterNotes,
          toDurationQuarterNotes: range.durationQuarterNotes,
        }),
      ),
      direction,
    );
  }
}

function transientModel(
  input: { recordsSha256: string; groupsSha256: string; learningRate: number },
  epoch: number,
  segmentWeights: number[],
  transitionWeights: number[],
): HarmonyStructuredLinearModel {
  return {
    schemaVersion: "1.0.0",
    featureVersion: "semi-crf-linear-v1",
    algorithmVersion: "averaged-structured-perceptron-v1",
    trainingRecordsSha256: input.recordsSha256,
    trainingGroupsSha256: input.groupsSha256,
    epochs: epoch,
    learningRate: input.learningRate,
    ruleScale: 1,
    modelScale: 1,
    segmentWeights,
    transitionWeights,
  };
}

function createMetrics() {
  return {
    pieces: 0,
    windows: 0,
    exactPaths: 0,
    pathLoss: 0,
    goldDuration: 0,
    correctDuration: 0,
    goldBoundaries: 0,
    predictedBoundaries: 0,
    truePositiveBoundaries: 0,
    goldSegments: 0,
    predictedSegments: 0,
  };
}

function observe(
  metrics: ReturnType<typeof createMetrics>,
  piece: HarmonyStructuredRecordPiece,
  window: Window,
  gold: PathStep[],
  predicted: PathStep[],
  model: HarmonyStructuredLinearModel,
) {
  metrics.windows += 1;
  if (samePath(gold, predicted)) metrics.exactPaths += 1;
  metrics.pathLoss += Math.max(0, pathScore(piece, window, predicted, model) - pathScore(piece, window, gold, model));
  metrics.goldSegments += gold.length;
  metrics.predictedSegments += predicted.length;
  const goldEnds = new Set(gold.slice(0, -1).map((step) => window.ranges[step.rangeIndex]!.endBoundaryIndex));
  const predictedEnds = new Set(predicted.slice(0, -1).map((step) => window.ranges[step.rangeIndex]!.endBoundaryIndex));
  metrics.goldBoundaries += goldEnds.size;
  metrics.predictedBoundaries += predictedEnds.size;
  metrics.truePositiveBoundaries += [...goldEnds].filter((boundary) => predictedEnds.has(boundary)).length;
  for (const goldStep of gold) {
    const goldRange = window.ranges[goldStep.rangeIndex]!;
    const goldCandidate = goldRange.candidates[goldStep.candidateIndex]!;
    metrics.goldDuration += goldRange.durationQuarterNotes;
    const predictedStep = predicted.find((step) => {
      const range = window.ranges[step.rangeIndex]!;
      return (
        range.startBoundaryIndex <= goldRange.startBoundaryIndex &&
        goldRange.startBoundaryIndex < range.endBoundaryIndex
      );
    });
    if (
      predictedStep &&
      window.ranges[predictedStep.rangeIndex]!.candidates[predictedStep.candidateIndex]!.chordIndex ===
        goldCandidate.chordIndex
    )
      metrics.correctDuration += goldRange.durationQuarterNotes;
  }
}

function finalizeMetrics(metrics: ReturnType<typeof createMetrics>, epoch: number) {
  const precision =
    metrics.predictedBoundaries === 0 ? 1 : metrics.truePositiveBoundaries / metrics.predictedBoundaries;
  const recall = metrics.goldBoundaries === 0 ? 1 : metrics.truePositiveBoundaries / metrics.goldBoundaries;
  return {
    epoch,
    pieces: metrics.pieces,
    windows: metrics.windows,
    exactPaths: metrics.exactPaths,
    pathLoss: q2(metrics.pathLoss),
    intervalAccuracy: q2(metrics.goldDuration === 0 ? 1 : metrics.correctDuration / metrics.goldDuration),
    boundaryF1: q2(precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)),
    segmentDensity: q2(metrics.goldSegments === 0 ? 1 : metrics.predictedSegments / metrics.goldSegments),
    predictedPrimary: q2(metrics.goldDuration === 0 ? 1 : metrics.correctDuration / metrics.goldDuration),
  };
}

function pathScore(
  piece: HarmonyStructuredRecordPiece,
  window: Window,
  path: PathStep[],
  model: HarmonyStructuredLinearModel,
): number {
  let score = 0;
  for (const [index, step] of path.entries()) {
    const range = window.ranges[step.rangeIndex]!;
    const candidate = range.candidates[step.candidateIndex]!;
    score +=
      model.ruleScale * candidate.ruleSequenceScore +
      model.modelScale * dot(model.segmentWeights, candidate.segmentFeatures);
    const previous = path[index - 1];
    if (!previous) continue;
    const previousRange = window.ranges[previous.rangeIndex]!;
    const previousCandidate = previousRange.candidates[previous.candidateIndex]!;
    const from = piece.chords[previousCandidate.chordIndex]!;
    const to = piece.chords[candidate.chordIndex]!;
    score +=
      model.ruleScale * scoreHarmonyTransition(from, to) * piece.ticksPerQuarter * 0.1 +
      model.modelScale *
        dot(
          model.transitionWeights,
          flattenStructuredTransitionFeatures(
            createStructuredTransitionFeatures({
              from,
              to,
              fromDurationQuarterNotes: previousRange.durationQuarterNotes,
              toDurationQuarterNotes: range.durationQuarterNotes,
            }),
          ),
        );
  }
  return score;
}

function samePath(a: readonly PathStep[], b: readonly PathStep[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (step, index) => step.rangeIndex === b[index]?.rangeIndex && step.candidateIndex === b[index]?.candidateIndex,
    )
  );
}

function dot(weights: readonly number[], features: readonly number[]): number {
  return weights.reduce((total, weight, index) => total + weight * features[index]!, 0);
}

function addScaled(target: number[], source: readonly number[], scale: number) {
  for (let index = 0; index < target.length; index += 1) target[index] = target[index]! + source[index]! * scale;
}

function zeros(length: number): number[] {
  return Array(length).fill(0);
}

function q2(value: number): number {
  return Number(value.toFixed(2));
}
