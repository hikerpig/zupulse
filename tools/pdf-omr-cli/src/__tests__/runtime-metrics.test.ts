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
      processCpuPercent: true,
      decoderTelemetry: true,
    });
  });

  it("retains missing resource metrics as unavailable instead of writing zero", () => {
    const observation = baseObservation();
    delete observation.peakRssBytes;
    delete observation.processResources;
    const metrics = aggregateRuntimeMetrics([observation]);

    expect(metrics).not.toHaveProperty("peakRssBytes");
    expect(metrics).not.toHaveProperty("processResources");
    expect(metrics).not.toHaveProperty("gpuMemoryBytes");
    expect(metrics).not.toHaveProperty("cancelLatencyMs");
    expect(metrics.metricsAvailability.gpuMemoryBytes).toBe(false);
    expect(metrics.metricsAvailability.cancelLatencyMs).toBe(false);
    expect(metrics.metricsAvailability.peakRssBytes).toBe(false);
    expect(metrics.metricsAvailability.processCpuPercent).toBe(false);
  });

  it("separates worker model load, cold request, and warm request timings", () => {
    const cold = baseObservation();
    cold.decoderTelemetry!.workerRequests = [{ warm: false, requestDurationMs: 80, modelLoadMs: 500 }];
    const warm = baseObservation();
    warm.decoderTelemetry!.workerRequests = [{ warm: true, requestDurationMs: 40 }];

    expect(aggregateRuntimeMetrics([cold, warm]).decoder?.worker).toEqual({
      modelLoadMs: { p50: 500, p95: 500, max: 500 },
      coldRequestMs: { p50: 80, p95: 80, max: 80 },
      warmRequestMs: { p50: 40, p95: 40, max: 40 },
    });
  });

  it("does not report a fabricated process count", () => {
    expect(aggregateRuntimeMetrics([baseObservation()]).processResources).not.toHaveProperty("processCount");
  });

  it("omits CPU distributions when the process probe collected no samples", () => {
    const observation = baseObservation();
    observation.processResources = {
      scope: "process-group",
      sampleIntervalMs: 250,
      sampleCount: 0,
    };

    const metrics = aggregateRuntimeMetrics([observation]);

    expect(metrics.processResources).toEqual({
      scope: "process-group",
      sampleIntervalMs: 250,
      sampleCount: 0,
    });
    expect(metrics.metricsAvailability.processCpuPercent).toBe(false);
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
    processResources: {
      scope: "process-group",
      sampleIntervalMs: 250,
      sampleCount: 2,
      peakRssBytes: 1_000,
      averageCpuPercent: 25,
      peakCpuPercent: 50,
    },
    stageWallTimeMs: { inspect: 10, recognize: 20, normalize: 30, validate: 40, export: 50 },
    decoderTelemetry: {
      schemaVersion: "1.0.0",
      pages: [
        {
          pageNumber: 1,
          outputTokenCount: 64,
          maxLength: 2048,
          termination: "eos",
          device: "mps",
          dtype: "float16",
        },
      ],
    },
  };
}
