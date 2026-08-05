import { describe, expect, it } from "vitest";
import { aggregateRuntimeMetrics } from "../benchmark/runtime-metrics";

describe("MusicXML and runtime metrics", () => {
  it("keeps capability rates separate from structural agreement", () => {
    const metrics = aggregateRuntimeMetrics([
      {
        generation: true,
        parse: true,
        view: true,
        playback: true,
        structural: false,
        wallTimeMs: 100,
        peakRssBytes: 1_000,
      },
      {
        generation: true,
        parse: true,
        view: false,
        playback: false,
        structural: false,
        wallTimeMs: 300,
        peakRssBytes: 2_000,
      },
    ]);

    expect(metrics.capabilities).toEqual({
      generationRate: 1,
      parseRate: 1,
      viewRate: 0.5,
      playbackRate: 0.5,
      structuralAgreementRate: 0,
    });
    expect(metrics.wallTimeMs).toEqual({ p50: 100, p95: 300, max: 300 });
  });

  it("omits unavailable GPU and cancellation metrics instead of writing zero", () => {
    const metrics = aggregateRuntimeMetrics([
      {
        generation: false,
        parse: false,
        view: false,
        playback: false,
        structural: false,
        wallTimeMs: 10,
        peakRssBytes: 100,
      },
    ]);

    expect(metrics).not.toHaveProperty("gpuMemoryBytes");
    expect(metrics).not.toHaveProperty("cancelLatencyMs");
  });
});
