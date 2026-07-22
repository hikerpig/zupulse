import type { ChordSymbolInput, HarmonySegment, ScoreWrittenMoment, ScoreWrittenRange } from "@zupulse/web-core";
import { describe, expect, it } from "vitest";
import { calculateIntervalOverlapDiagnostics, mergeIntervalOverlapDiagnostics } from "../intervalMetrics";

const cMajor: ChordSymbolInput = { root: { step: "C", alter: 0 }, kind: "major", degrees: [] };
const gMajor: ChordSymbolInput = { root: { step: "G", alter: 0 }, kind: "major", degrees: [] };
const range = (start: number, end: number): ScoreWrittenRange => ({
  start: { measureIndex: 0, offsetTicks: start },
  end: { measureIndex: 0, offsetTicks: end },
});

describe("interval overlap diagnostics", () => {
  it("splits gold and predictions by duration and matches boundaries within the legal-moment tolerance", () => {
    const gold = [
      { range: range(0, 240), chord: cMajor },
      { range: range(240, 480), chord: gMajor },
    ];
    const predicted: HarmonySegment[] = [
      {
        status: "resolved",
        range: range(0, 180),
        chord: cMajor,
        confidence: 0.9,
        alternatives: [],
      },
      {
        status: "resolved",
        range: range(180, 360),
        chord: gMajor,
        confidence: 0.9,
        alternatives: [],
      },
      {
        status: "unresolved",
        range: range(360, 480),
        reason: "low-confidence",
        alternatives: [],
      },
    ];
    const legalMoments: ScoreWrittenMoment[] = [0, 180, 240, 300, 360, 480].map((offsetTicks) => ({
      measureIndex: 0,
      offsetTicks,
    }));

    const diagnostics = calculateIntervalOverlapDiagnostics({
      ticksPerQuarter: 480,
      measures: [{ index: 0, durationTicks: 480 }],
      legalMoments,
      gold,
      predicted,
    });

    expect(diagnostics.overlap).toEqual({
      mappedDurationTicks: 480,
      correctDurationTicks: 300,
      wrongDurationTicks: 60,
      unresolvedDurationTicks: 120,
      accuracy: 0.625,
      resolvedPrecision: 5 / 6,
      resolvedCoverage: 0.75,
    });
    expect(diagnostics.boundaries).toEqual({
      expected: 1,
      predicted: 2,
      truePositive: 1,
      overSegmented: 1,
      underSegmented: 0,
      f1: 2 / 3,
    });

    expect(mergeIntervalOverlapDiagnostics([diagnostics, diagnostics])).toMatchObject({
      overlap: { mappedDurationTicks: 960, accuracy: 0.625, resolvedPrecision: 5 / 6, resolvedCoverage: 0.75 },
      boundaries: { expected: 2, predicted: 4, truePositive: 2, overSegmented: 2, underSegmented: 0, f1: 2 / 3 },
    });
  });
});
