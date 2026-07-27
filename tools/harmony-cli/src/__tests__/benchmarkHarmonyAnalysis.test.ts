import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { benchmarkHarmonyAnalysisFile, canonicalHarmonyResultJson } from "../benchmarkHarmonyAnalysis";

describe("Harmony Analysis benchmark", () => {
  it("benchmarks the production analyzer and returns a reproducible result checksum", async () => {
    const score = fileURLToPath(
      new URL("../../../../test-fixtures/musicxml/generated/single-voice.musicxml", import.meta.url),
    );

    const first = await benchmarkHarmonyAnalysisFile({ scorePath: score, runs: 1, warmupRuns: 0 });
    const second = await benchmarkHarmonyAnalysisFile({ scorePath: score, runs: 1, warmupRuns: 0 });

    expect(first).toMatchObject({
      schemaVersion: "harmony-analysis-benchmark-v1",
      command: "benchmark",
      source: {
        name: "single-voice.musicxml",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      workload: {
        runs: 1,
        warmupRuns: 0,
        pitchedNotes: expect.any(Number),
        basicEvents: expect.any(Number),
        segmentLabelPotentials: expect.any(Number),
      },
      performance: {
        parseAndProjectionMs: expect.any(Number),
        analysisMs: [expect.any(Number)],
        medianAnalysisMs: expect.any(Number),
        rssBytesBefore: expect.any(Number),
        rssBytesAfter: expect.any(Number),
        maxRssBytes: expect.any(Number),
      },
      result: {
        segments: expect.any(Number),
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      environment: {
        platform: expect.any(String),
        architecture: expect.any(String),
        nodeVersion: expect.any(String),
        cpu: expect.any(String),
      },
    });
    expect(first.result.sha256).toBe(second.result.sha256);
  });

  it("canonicalizes object keys without changing array order", () => {
    expect(
      canonicalHarmonyResultJson([
        { z: 1, a: 2 },
        { b: 3, a: 4 },
      ]),
    ).toBe('[{"a":2,"z":1},{"a":4,"b":3}]');
  });

  it("rejects a result that differs from the expected golden checksum", async () => {
    const score = fileURLToPath(
      new URL("../../../../test-fixtures/musicxml/generated/single-voice.musicxml", import.meta.url),
    );

    await expect(
      benchmarkHarmonyAnalysisFile({
        scorePath: score,
        runs: 1,
        warmupRuns: 0,
        expectedResultSha256: "0".repeat(64),
      }),
    ).rejects.toThrow("harmony benchmark result checksum mismatch");
  });
});
