export type RuntimeObservation = {
  generation: boolean;
  parse: boolean;
  view: boolean;
  playback: boolean;
  structural: boolean;
  wallTimeMs: number;
  peakRssBytes: number;
  gpuMemoryBytes?: number;
  cancelLatencyMs?: number;
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
  peakRssBytes: Distribution;
  gpuMemoryBytes?: Distribution;
  cancelLatencyMs?: Distribution;
};

export function aggregateRuntimeMetrics(observations: readonly RuntimeObservation[]): RuntimeMetrics {
  const gpu = observations.flatMap((observation) =>
    observation.gpuMemoryBytes === undefined ? [] : [observation.gpuMemoryBytes],
  );
  const cancellation = observations.flatMap((observation) =>
    observation.cancelLatencyMs === undefined ? [] : [observation.cancelLatencyMs],
  );
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
    peakRssBytes: distribution(observations.map((observation) => observation.peakRssBytes)),
    ...(gpu.length === 0 ? {} : { gpuMemoryBytes: distribution(gpu) }),
    ...(cancellation.length === 0 ? {} : { cancelLatencyMs: distribution(cancellation) }),
  };
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
