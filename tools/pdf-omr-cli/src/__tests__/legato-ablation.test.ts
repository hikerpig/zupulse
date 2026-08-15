import { describe, expect, it } from "vitest";
import { buildLegatoAblationComparison, legatoBeamCandidates } from "../benchmark/legato-ablation";
import type { BenchmarkReport } from "../benchmark/report";
import { canonicalJson } from "../canonical-json";

describe("LEGATO beam ablation", () => {
  it("stops at beam 4 for the real-corpus screening pass", () => {
    expect(legatoBeamCandidates).toEqual([1, 2, 4]);
  });

  it("reports measured variants without making a promotion decision", () => {
    const comparison = buildLegatoAblationComparison([
      variant(1, { recognitionMs: 60, jointF1: 0.98 }),
      variant(2, { recognitionMs: 70, jointF1: 0.99 }),
      variant(4, { recognitionMs: 100, jointF1: 1 }),
    ]);

    expect(comparison.baselineNumBeams).toBe(1);
    expect(comparison.candidates.map((candidate) => candidate.numBeams)).toEqual([1, 2, 4]);
    expect(comparison.candidates[1]).toMatchObject({
      evaluationSetStable: true,
      symbolic: { jointF1: 0.99 },
      runtime: { recognitionP50Ms: 70 },
    });
    expect(comparison).not.toHaveProperty("decision");
    expect(comparison).not.toHaveProperty("promotionBlocked");
    expect(comparison).not.toHaveProperty("maxLengthExperiment");
    expect(() => canonicalJson(comparison)).not.toThrow();
  });

  it("marks a different evaluation set instead of comparing it", () => {
    const candidate = variant(4, { recognitionMs: 100, jointF1: 1 });
    candidate.report.items = { total: 2, succeeded: 1, failed: 1 };
    candidate.report.failures = [{ itemId: "failed-item" }] as BenchmarkReport["failures"];

    const comparison = buildLegatoAblationComparison([variant(1, { recognitionMs: 60, jointF1: 1 }), candidate]);

    expect(comparison.candidates.find((entry) => entry.numBeams === 4)?.evaluationSetStable).toBe(false);
  });

  it("omits CPU from a variant summary when the process probe collected no samples", () => {
    const candidate = variant(1, { recognitionMs: 60, jointF1: 1 });
    candidate.report.overall!.runtime.processResources = {
      scope: "process-group",
      sampleIntervalMs: 250,
      sampleCount: 0,
    };

    const comparison = buildLegatoAblationComparison([candidate]);

    expect(comparison.candidates[0]?.runtime).not.toHaveProperty("averageCpuPercent");
  });
});

function variant(numBeams: number, input: { recognitionMs: number; jointF1: number }) {
  const metric = (f1: number) => ({ truePositive: 1, falsePositive: 0, falseNegative: 0, precision: 1, recall: 1, f1 });
  return {
    numBeams,
    reportSha256: String(numBeams).padStart(64, "0"),
    environment: {
      id: "legato",
      version: "revision",
      executable: "python",
      modelSha256: "a".repeat(64),
      commandTemplate: [],
      license: { id: "MIT", source: "https://example.test" },
    },
    report: {
      metadata: { manifestSha256: "b".repeat(64) },
      items: { total: 1, succeeded: 1, failed: 0 },
      failures: [],
      overall: {
        symbolic: { joint: metric(input.jointF1), pitch: metric(1), onset: metric(1) },
        runtime: {
          capabilities: { parseRate: 1, viewRate: 1, playbackRate: 1 },
          stageWallTimeMs: { recognize: { p50: input.recognitionMs } },
          wallTimeMs: { p50: input.recognitionMs },
        },
        reproducibility: { agreementRate: 1 },
      },
    } as unknown as BenchmarkReport,
  };
}
