import type { ChordSymbolInput } from "@zupulse/web-core";
import { describe, expect, it } from "vitest";
import {
  calculateAccuracyMetrics,
  classifyAccuracyOutcome,
  shouldIncludeDiagnosticSample,
  type AccuracyObservation,
} from "../accuracyMetrics";
import { harmonyAccuracyMetricsSchema } from "../schemas";

const cMajor: ChordSymbolInput = { root: { step: "C", alter: 0 }, kind: "major", degrees: [] };
const gMajor: ChordSymbolInput = { root: { step: "G", alter: 0 }, kind: "major", degrees: [] };

describe("calculateAccuracyMetrics", () => {
  it("reports mapping, ranking, resolution, boundaries, calibration, facets, and slices separately", () => {
    const observations: AccuracyObservation[] = [
      {
        groupId: "work-a",
        corpus: "fixture",
        family: "triad",
        weight: 2,
        expected: cMajor,
        predicted: cMajor,
        alternatives: [cMajor],
        confidence: 0.8,
        expectedBoundary: true,
        predictedBoundary: true,
      },
      {
        groupId: "work-a",
        corpus: "fixture",
        family: "triad",
        weight: 1,
        expected: gMajor,
        alternatives: [cMajor, gMajor],
        confidence: 0,
        expectedBoundary: true,
        predictedBoundary: false,
      },
      {
        groupId: "work-b",
        corpus: "fixture",
        family: "unsupported",
        weight: 1,
        unsupportedLabel: "Ger",
        alternatives: [],
        confidence: 0,
        expectedBoundary: false,
        predictedBoundary: false,
      },
    ];

    const metrics = calculateAccuracyMetrics(observations);

    expect(() => harmonyAccuracyMetricsSchema.parse(metrics)).not.toThrow();

    expect(metrics).toMatchObject({
      gold: { total: 3, mapped: 2, unsupported: 1 },
      mappingCoverage: 2 / 3,
      unsupportedLabelRate: 1 / 3,
      top1Accuracy: 2 / 3,
      top8OracleRecall: 1,
      resolvedPrecision: 1,
      resolvedCoverage: 2 / 3,
      boundaryF1: 2 / 3,
    });
    expect(metrics.expectedCalibrationError).toBeCloseTo(2 / 15);
    expect(metrics.facets).toEqual({ root: 1, bass: 1, kind: 1, extension: 1, degrees: 1 });
    expect(metrics.slices).toMatchObject({
      corpus: { fixture: { cases: 2, top1Accuracy: 2 / 3 } },
      chordFamily: { triad: { cases: 2, top1Accuracy: 2 / 3 } },
    });
    expect(metrics).toMatchObject({
      diagnostics: {
        outcomes: {
          "resolved-correct": { cases: 1, weight: 2 },
          "unresolved-oracle-hit": { cases: 1, weight: 1 },
          "unsupported-label": { cases: 1, weight: 1 },
        },
        outcomesByFamily: {
          triad: {
            "resolved-correct": { cases: 1, weight: 2 },
            "unresolved-oracle-hit": { cases: 1, weight: 1 },
          },
        },
        errors: {
          "unresolved-oracle-hit": { cases: 1, weight: 1 },
        },
        confidenceBins: expect.arrayContaining([
          expect.objectContaining({ index: 0, cases: 1, weight: 1, averageConfidence: 0, accuracy: 0 }),
          expect.objectContaining({ index: 8, cases: 1, weight: 2, averageConfidence: 0.8, accuracy: 1 }),
        ]),
        precisionCoverageCurve: expect.arrayContaining([
          { threshold: 0, precision: 1, coverage: 2 / 3 },
          { threshold: 0.9, precision: 0, coverage: 0 },
        ]),
      },
    });
  });

  it("caps deterministic diagnostic samples per error category", () => {
    const samples = Array.from({ length: 5 }, () => ({ category: "unresolved-oracle-hit" as const }));

    expect(shouldIncludeDiagnosticSample(samples, "unresolved-oracle-hit")).toBe(false);
    expect(shouldIncludeDiagnosticSample(samples, "unresolved-oracle-miss")).toBe(true);
  });

  it("separates resolved selection errors from candidate misses", () => {
    const observation = (alternatives: ChordSymbolInput[]): AccuracyObservation => ({
      groupId: "work-a",
      corpus: "fixture",
      family: "triad",
      weight: 1,
      expected: cMajor,
      predicted: gMajor,
      alternatives,
      confidence: 0.8,
      expectedBoundary: false,
      predictedBoundary: false,
    });

    expect(classifyAccuracyOutcome(observation([gMajor, cMajor]))).toBe("resolved-wrong-oracle-hit");
    expect(classifyAccuracyOutcome(observation([gMajor]))).toBe("resolved-wrong-oracle-miss");
  });
});
