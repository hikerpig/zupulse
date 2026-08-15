import type { ProcessResourceUsage } from "../resource-metrics";
import type { DecoderTelemetry } from "../engines/types";

export type RuntimeObservation = {
  generation: boolean;
  parse: boolean;
  view: boolean;
  playback: boolean;
  structural: boolean;
  wallTimeMs: number;
  peakRssBytes?: number;
  processResources?: ProcessResourceUsage;
  decoderTelemetry?: DecoderTelemetry;
  stageWallTimeMs: Record<BenchmarkStage, number>;
  gpuMemoryBytes?: number;
  cancelLatencyMs?: number;
};

export const benchmarkStages = ["inspect", "recognize", "normalize", "validate", "export"] as const;
export type BenchmarkStage = (typeof benchmarkStages)[number];

export type RuntimeMetricAvailability = {
  stageWallTimeMs: boolean;
  cancelLatencyMs: boolean;
  peakRssBytes: boolean;
  gpuMemoryBytes: boolean;
  processCpuPercent: boolean;
  decoderTelemetry: boolean;
};

type Distribution = { p50: number; p95: number; max: number };

export type RuntimeMetrics = {
  cases: number;
  capabilities: {
    generationRate: number;
    parseRate: number;
    viewRate: number;
    playbackRate: number;
    structuralAgreementRate: number;
  };
  wallTimeMs: Distribution;
  stageWallTimeMs: Record<BenchmarkStage, Distribution>;
  peakRssBytes?: Distribution;
  processResources?: {
    scope: "process-group";
    sampleIntervalMs: number;
    sampleCount: number;
    averageCpuPercent?: Distribution;
    peakCpuPercent?: Distribution;
  };
  gpuMemoryBytes?: Distribution;
  cancelLatencyMs?: Distribution;
  decoder?: {
    pageCount: number;
    outputTokens: Distribution;
    maxLengthHitCount: number;
    terminationCounts: Record<"eos" | "max-length" | "other", number>;
    worker?: {
      modelLoadMs?: Distribution;
      coldRequestMs?: Distribution;
      warmRequestMs?: Distribution;
    };
  };
  metricsAvailability: RuntimeMetricAvailability;
};

export function assessRuntimeObservation(observation: RuntimeObservation): {
  complete: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (
    benchmarkStages.some(
      (stage) => !Number.isFinite(observation.stageWallTimeMs[stage]) || observation.stageWallTimeMs[stage] < 0,
    )
  ) {
    missing.push("stageWallTimeMs");
  }
  if (observation.cancelLatencyMs === undefined) missing.push("cancelLatencyMs");
  if (
    observation.peakRssBytes === undefined ||
    !Number.isFinite(observation.peakRssBytes) ||
    observation.peakRssBytes <= 0
  ) {
    missing.push("peakRssBytes");
  }
  if (
    observation.processResources?.averageCpuPercent === undefined ||
    observation.processResources.peakCpuPercent === undefined
  ) {
    missing.push("processCpuPercent");
  }
  if (observation.gpuMemoryBytes === undefined) missing.push("gpuMemoryBytes");
  if (observation.decoderTelemetry === undefined) missing.push("decoderTelemetry");
  return { complete: missing.length === 0, missing };
}

export function aggregateRuntimeMetrics(observations: readonly RuntimeObservation[]): RuntimeMetrics {
  const gpu = observations.flatMap((observation) =>
    observation.gpuMemoryBytes === undefined ? [] : [observation.gpuMemoryBytes],
  );
  const cancellation = observations.flatMap((observation) =>
    observation.cancelLatencyMs === undefined ? [] : [observation.cancelLatencyMs],
  );
  const rss = observations.flatMap((observation) =>
    observation.peakRssBytes === undefined ? [] : [observation.peakRssBytes],
  );
  const processResources = observations.flatMap((observation) =>
    observation.processResources === undefined ? [] : [observation.processResources],
  );
  const averageCpuPercent = processResources.flatMap((resources) =>
    resources.averageCpuPercent === undefined ? [] : [resources.averageCpuPercent],
  );
  const peakCpuPercent = processResources.flatMap((resources) =>
    resources.peakCpuPercent === undefined ? [] : [resources.peakCpuPercent],
  );
  const decoderPages = observations.flatMap((observation) => observation.decoderTelemetry?.pages ?? []);
  const workerTelemetry = observations.flatMap((observation) => observation.decoderTelemetry?.workerRequests ?? []);
  return {
    cases: observations.length,
    capabilities: {
      generationRate: rate(observations, (observation) => observation.generation),
      parseRate: rate(observations, (observation) => observation.parse),
      viewRate: rate(observations, (observation) => observation.view),
      playbackRate: rate(observations, (observation) => observation.playback),
      structuralAgreementRate: rate(observations, (observation) => observation.structural),
    },
    wallTimeMs: distribution(observations.map((observation) => observation.wallTimeMs)),
    stageWallTimeMs: Object.fromEntries(
      benchmarkStages.map((stage) => [
        stage,
        distribution(observations.map((observation) => observation.stageWallTimeMs[stage])),
      ]),
    ) as Record<BenchmarkStage, Distribution>,
    ...(rss.length === 0 ? {} : { peakRssBytes: distribution(rss) }),
    ...(processResources.length === 0
      ? {}
      : {
          processResources: {
            scope: "process-group" as const,
            sampleIntervalMs: Math.max(...processResources.map((resources) => resources.sampleIntervalMs)),
            sampleCount: sum(processResources.map((resources) => resources.sampleCount)),
            ...(averageCpuPercent.length === 0 ? {} : { averageCpuPercent: distribution(averageCpuPercent) }),
            ...(peakCpuPercent.length === 0 ? {} : { peakCpuPercent: distribution(peakCpuPercent) }),
          },
        }),
    ...(gpu.length === 0 ? {} : { gpuMemoryBytes: distribution(gpu) }),
    ...(cancellation.length === 0 ? {} : { cancelLatencyMs: distribution(cancellation) }),
    ...(decoderPages.length === 0
      ? {}
      : {
          decoder: {
            pageCount: decoderPages.length,
            outputTokens: distribution(decoderPages.map((page) => page.outputTokenCount)),
            maxLengthHitCount: decoderPages.filter((page) => page.termination === "max-length").length,
            terminationCounts: {
              eos: decoderPages.filter((page) => page.termination === "eos").length,
              "max-length": decoderPages.filter((page) => page.termination === "max-length").length,
              other: decoderPages.filter((page) => page.termination === "other").length,
            },
            ...(workerTelemetry.length === 0
              ? {}
              : {
                  worker: {
                    ...(workerTelemetry.some((worker) => worker.modelLoadMs !== undefined)
                      ? {
                          modelLoadMs: distribution(
                            workerTelemetry.flatMap((worker) =>
                              worker.modelLoadMs === undefined ? [] : [worker.modelLoadMs],
                            ),
                          ),
                        }
                      : {}),
                    ...(workerTelemetry.some((worker) => !worker.warm)
                      ? {
                          coldRequestMs: distribution(
                            workerTelemetry.filter((worker) => !worker.warm).map((worker) => worker.requestDurationMs),
                          ),
                        }
                      : {}),
                    ...(workerTelemetry.some((worker) => worker.warm)
                      ? {
                          warmRequestMs: distribution(
                            workerTelemetry.filter((worker) => worker.warm).map((worker) => worker.requestDurationMs),
                          ),
                        }
                      : {}),
                  },
                }),
          },
        }),
    metricsAvailability: {
      stageWallTimeMs: observations.every(
        (observation) => assessRuntimeObservation(observation).missing.includes("stageWallTimeMs") === false,
      ),
      cancelLatencyMs: observations.every((observation) => observation.cancelLatencyMs !== undefined),
      peakRssBytes: observations.every(
        (observation) =>
          observation.peakRssBytes !== undefined &&
          Number.isFinite(observation.peakRssBytes) &&
          observation.peakRssBytes > 0,
      ),
      gpuMemoryBytes: observations.every((observation) => observation.gpuMemoryBytes !== undefined),
      processCpuPercent: observations.every(
        (observation) =>
          observation.processResources?.averageCpuPercent !== undefined &&
          observation.processResources.peakCpuPercent !== undefined,
      ),
      decoderTelemetry: observations.every((observation) => observation.decoderTelemetry !== undefined),
    },
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function rate<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  return values.length === 0 ? 0 : values.filter(predicate).length / values.length;
}

function distribution(values: readonly number[]): Distribution {
  if (values.length === 0) return { p50: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1)!,
  };
}

function percentile(sorted: readonly number[], probability: number): number {
  return sorted[Math.max(0, Math.ceil(probability * sorted.length) - 1)]!;
}
