import { describe, expect, it } from "vitest";
import { calculateReproducibilityMetrics } from "../benchmark/reproducibility-metrics";

describe("Draft reproducibility metrics", () => {
  it("reports full agreement for identical repeated Draft hashes", () => {
    const metrics = calculateReproducibilityMetrics([
      { runId: "run-1", draftSha256: "a".repeat(64) },
      { runId: "run-2", draftSha256: "a".repeat(64) },
    ]);

    expect(metrics).toEqual({ comparisons: 1, agreements: 1, agreementRate: 1, mismatches: [] });
  });

  it("retains both run IDs and hashes when repeated runs disagree", () => {
    const metrics = calculateReproducibilityMetrics([
      { runId: "run-1", draftSha256: "a".repeat(64) },
      { runId: "run-2", draftSha256: "b".repeat(64) },
      { runId: "run-3", draftSha256: "a".repeat(64) },
    ]);

    expect(metrics.agreementRate).toBe(0.5);
    expect(metrics.mismatches).toEqual([
      {
        baselineRunId: "run-1",
        baselineDraftSha256: "a".repeat(64),
        runId: "run-2",
        draftSha256: "b".repeat(64),
      },
    ]);
  });
});
