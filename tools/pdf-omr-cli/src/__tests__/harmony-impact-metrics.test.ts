import type { HarmonyAnalysisInput, HarmonySegment } from "@zupulse/web-core";
import { describe, expect, it } from "vitest";
import { musicXmlReadyDraft } from "./fixtures/musicxml-ready-draft";
import { analyzeHarmonyImpactDrafts } from "../benchmark/harmony-ground-truth";
import { calculateHarmonyImpactMetrics } from "../benchmark/harmony-impact-metrics";

const input: HarmonyAnalysisInput = {
  schemaVersion: "1.0.0",
  ticksPerQuarter: 960,
  measures: [{ index: 0, durationTicks: 3840, timeSignature: { numerator: 4, denominator: 4 } }],
  tracks: [],
  sourceHarmony: [],
};
const range = {
  start: { measureIndex: 0, offsetTicks: 0 },
  end: { measureIndex: 0, offsetTicks: 3840 },
};
const cMajor = { root: { step: "C" as const, alter: 0 as const }, kind: "major" as const, degrees: [] };
const dMajor = { root: { step: "D" as const, alter: 0 as const }, kind: "major" as const, degrees: [] };

describe("Harmony impact metrics", () => {
  it("counts a high-confidence wrong resolved chord as false confident", () => {
    const gold: HarmonySegment[] = [{ status: "resolved", range, chord: cMajor, confidence: 0.95, alternatives: [] }];
    const predicted: HarmonySegment[] = [
      { status: "resolved", range, chord: dMajor, confidence: 0.92, alternatives: [] },
    ];

    const metrics = calculateHarmonyImpactMetrics({
      input,
      goldSegments: gold,
      omr: { status: "analyzed", segments: predicted },
      confidenceThreshold: 0.8,
    });

    expect(metrics.overlap).toMatchObject({ resolvedPrecision: 0, resolvedCoverage: 1 });
    expect(metrics.falseConfidentChord).toEqual({ wrong: 1, resolved: 1, rate: 1 });
  });

  it("keeps OMR blocked, Harmony unresolved and unsupported gold separate", () => {
    const unresolved: HarmonySegment[] = [{ status: "unresolved", range, reason: "low-confidence", alternatives: [] }];
    const blocked = calculateHarmonyImpactMetrics({
      input,
      goldSegments: unresolved,
      omr: { status: "blocked" },
      confidenceThreshold: 0.8,
    });
    const analyzed = calculateHarmonyImpactMetrics({
      input,
      goldSegments: [{ status: "resolved", range, chord: cMajor, confidence: 0.95, alternatives: [] }],
      omr: { status: "analyzed", segments: unresolved },
      confidenceThreshold: 0.8,
    });

    expect(blocked.status).toEqual({ omrBlocked: 1, harmonyUnresolved: 0, unsupportedGold: 1 });
    expect(analyzed.status).toEqual({ omrBlocked: 0, harmonyUnresolved: 1, unsupportedGold: 0 });
  });

  it("runs gold and OMR Drafts through the same production analyzer", () => {
    const draft = musicXmlReadyDraft();

    const result = analyzeHarmonyImpactDrafts(draft, structuredClone(draft), {
      decisionThreshold: 0.6,
      confidenceThreshold: 0.8,
    });

    expect(result.metrics.falseConfidentChord.wrong).toBe(0);
    expect(result.algorithmVersion).toMatch(/^paper-semi-crf-/);
  });
});
