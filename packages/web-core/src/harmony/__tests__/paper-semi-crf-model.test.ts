import { describe, expect, it } from "vitest";
import { decodePaperSemiCrf } from "../paper-semi-crf-decode";
import {
  computePaperSemiCrfLogPartition,
  createPaperSemiCrfLinearPotential,
  evaluatePaperSemiCrfNegativeLogLikelihood,
  parsePaperSemiCrfLinearModel,
  PAPER_SEMI_CRF_FEATURE_VERSION,
  type PaperSemiCrfFeatureProvider,
  type PaperSemiCrfSegment,
} from "../paper-semi-crf-model";

describe("paper semi-CRF linear model", () => {
  const features: PaperSemiCrfFeatureProvider = ({ segment, previousLabelId }) => [
    { index: segment.labelId, value: segment.endEvent - segment.startEvent },
    ...(previousLabelId === undefined || previousLabelId === segment.labelId ? [] : [{ index: 2, value: 1 }]),
  ];

  it("matches exhaustive log-partition and exact Viterbi on a tiny lattice", () => {
    const lattice = { eventCount: 3, labelCount: 2, maxSegmentLength: 2 };
    const weights = [0.3, -0.4, 0.8];
    const paths = enumeratePaths(lattice);
    const scored = paths.map((segments) => ({
      segments,
      score: scorePath(segments, weights, features),
    }));
    const maximum = Math.max(...scored.map((path) => path.score));
    const expectedLogPartition =
      maximum + Math.log(scored.reduce((sum, path) => sum + Math.exp(path.score - maximum), 0));
    const expectedBest = scored.sort((left, right) => right.score - left.score)[0]!;

    const logPartition = computePaperSemiCrfLogPartition({
      ...lattice,
      weights,
      features,
    });
    const decoded = decodePaperSemiCrf({
      ...lattice,
      potential: createPaperSemiCrfLinearPotential(weights, features),
    });

    expect(logPartition).toBeCloseTo(expectedLogPartition, 12);
    expect(decoded.score).toBeCloseTo(expectedBest.score, 12);
    expect(scorePath(decoded.segments, weights, features)).toBeCloseTo(expectedBest.score, 12);
  });

  it("matches finite differences for conditional NLL with L2 regularization", () => {
    const input = {
      eventCount: 3,
      labelCount: 2,
      maxSegmentLength: 2,
      targetSegments: [
        { startEvent: 0, endEvent: 1, labelId: 0 },
        { startEvent: 1, endEvent: 3, labelId: 1 },
      ],
      l2: 0.2,
      features,
    } as const;
    const weights = [0.3, -0.4, 0.8];

    const evaluation = evaluatePaperSemiCrfNegativeLogLikelihood({ ...input, weights });
    const epsilon = 1e-6;
    const finiteDifference = weights.map((_, index) => {
      const higher = [...weights];
      const lower = [...weights];
      higher[index]! += epsilon;
      lower[index]! -= epsilon;
      const higherValue = evaluatePaperSemiCrfNegativeLogLikelihood({ ...input, weights: higher }).value;
      const lowerValue = evaluatePaperSemiCrfNegativeLogLikelihood({ ...input, weights: lower }).value;
      return (higherValue - lowerValue) / (2 * epsilon);
    });

    expect(evaluation.value).toBeCloseTo(
      evaluation.logPartition -
        evaluation.targetScore +
        0.5 * input.l2 * weights.reduce((sum, weight) => sum + weight * weight, 0),
      12,
    );
    expect(evaluation.gradient).toHaveLength(weights.length);
    evaluation.gradient.forEach((gradient, index) => {
      expect(gradient).toBeCloseTo(finiteDifference[index]!, 6);
    });
  });

  it("stays finite for large-magnitude scores by operating in log space", () => {
    const result = evaluatePaperSemiCrfNegativeLogLikelihood({
      eventCount: 3,
      labelCount: 2,
      maxSegmentLength: 3,
      targetSegments: [{ startEvent: 0, endEvent: 3, labelId: 0 }],
      weights: [1000, -1000, 500],
      l2: 0,
      features,
    });

    expect(Number.isFinite(result.logPartition)).toBe(true);
    expect(Number.isFinite(result.value)).toBe(true);
    expect(result.gradient.every(Number.isFinite)).toBe(true);
  });

  it("rejects non-finite weights and sparse feature values", () => {
    expect(() =>
      computePaperSemiCrfLogPartition({
        eventCount: 1,
        labelCount: 1,
        maxSegmentLength: 1,
        weights: [Number.NaN],
        features,
      }),
    ).toThrow("non-finite paper semi-CRF weight");
    expect(() =>
      computePaperSemiCrfLogPartition({
        eventCount: 1,
        labelCount: 1,
        maxSegmentLength: 1,
        weights: [0],
        features: () => [{ index: 0, value: Number.POSITIVE_INFINITY }],
      }),
    ).toThrow("invalid paper semi-CRF feature");
  });

  it("validates the complete versioned model asset contract", () => {
    const asset = {
      schemaVersion: "paper-semi-crf-linear-v1",
      labelMappingVersion: "generic-added-notes-v1+masada-bunescu-mode-spelling-v1",
      featureVersion: PAPER_SEMI_CRF_FEATURE_VERSION,
      labels: ["C:maj", "G:min"],
      featureNames: ["PURITY_101", "CHORD_BIGRAM_min_maj_7"],
      weights: [0.5, -0.25],
      maxSegmentLength: 8,
    };

    expect(parsePaperSemiCrfLinearModel(asset)).toEqual(asset);
    expect(() => parsePaperSemiCrfLinearModel({ ...asset, weights: [0.5] })).toThrow(
      "featureNames and weights must have equal length",
    );
    expect(() =>
      parsePaperSemiCrfLinearModel({
        ...asset,
        featureNames: ["PURITY_101", "PURITY_101"],
      }),
    ).toThrow("featureNames must be unique");
    expect(() =>
      parsePaperSemiCrfLinearModel({
        ...asset,
        featureVersion: "approximate-features",
      }),
    ).toThrow();
    expect(() => parsePaperSemiCrfLinearModel({ ...asset, labels: ["C:ger6"] })).toThrow(
      "labels must map to ChordSymbol",
    );
  });
});

function enumeratePaths(input: {
  eventCount: number;
  labelCount: number;
  maxSegmentLength: number;
}): PaperSemiCrfSegment[][] {
  const paths: PaperSemiCrfSegment[][] = [];
  const visit = (segments: PaperSemiCrfSegment[], startEvent: number): void => {
    if (startEvent === input.eventCount) {
      paths.push(segments);
      return;
    }
    for (
      let endEvent = startEvent + 1;
      endEvent <= Math.min(input.eventCount, startEvent + input.maxSegmentLength);
      endEvent += 1
    ) {
      for (let labelId = 0; labelId < input.labelCount; labelId += 1) {
        visit([...segments, { startEvent, endEvent, labelId }], endEvent);
      }
    }
  };
  visit([], 0);
  return paths;
}

function scorePath(
  segments: readonly PaperSemiCrfSegment[],
  weights: readonly number[],
  features: PaperSemiCrfFeatureProvider,
): number {
  return segments.reduce(
    (score, segment, index) =>
      score +
      features({
        segment,
        ...(index === 0 ? {} : { previousLabelId: segments[index - 1]!.labelId }),
      }).reduce((local, feature) => local + weights[feature.index]! * feature.value, 0),
    0,
  );
}
