import { describe, expect, it } from "vitest";
import {
  aggregateRuntimeMetrics,
  assessRuntimeObservation,
  benchmarkStages,
  type RuntimeObservation,
} from "../benchmark/runtime-metrics";

describe("MusicXML and runtime metrics", () => {
  it("fails closed when stage, cancellation, or GPU observations are missing", () => {
    const observation = baseObservation();

    expect(assessRuntimeObservation(observation)).toEqual({
      complete: false,
      missing: ["cancelLatencyMs", "gpuMemoryBytes"],
    });
    expect(benchmarkStages).toEqual(["inspect", "recognize", "normalize", "validate", "export"]);
  });

  it("keeps capability rates separate from structural agreement", () => {
    const metrics = aggregateRuntimeMetrics([
      { ...baseObservation(), structural: false, wallTimeMs: 100, gpuMemoryBytes: 4_000, cancelLatencyMs: 90 },
      {
        ...baseObservation(),
        view: false,
        playback: false,
        structural: false,
        wallTimeMs: 300,
        peakRssBytes: 2_000,
        gpuMemoryBytes: 6_000,
        cancelLatencyMs: 120,
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
    expect(metrics.stageWallTimeMs.inspect).toEqual({ p50: 10, p95: 10, max: 10 });
    expect(metrics.metricsAvailability).toEqual({
      stageWallTimeMs: true,
      cancelLatencyMs: true,
      peakRssBytes: true,
      gpuMemoryBytes: true,
    });
  });

  it("retains missing resource metrics as unavailable instead of writing zero", () => {
    const metrics = aggregateRuntimeMetrics([baseObservation()]);

    expect(metrics).not.toHaveProperty("gpuMemoryBytes");
    expect(metrics).not.toHaveProperty("cancelLatencyMs");
    expect(metrics.metricsAvailability.gpuMemoryBytes).toBe(false);
    expect(metrics.metricsAvailability.cancelLatencyMs).toBe(false);
  });
});

function baseObservation(): RuntimeObservation {
  return {
    generation: true,
    parse: true,
    view: true,
    playback: true,
    structural: true,
    wallTimeMs: 100,
    peakRssBytes: 1_000,
    stageWallTimeMs: { inspect: 10, recognize: 20, normalize: 30, validate: 40, export: 50 },
  };
}
