import { performance } from "node:perf_hooks";
import { execFile } from "node:child_process";

export type MonotonicTimer = {
  elapsedMs(): number;
};

export function startMonotonicTimer(): MonotonicTimer {
  const startedAt = performance.now();
  return {
    elapsedMs() {
      return Math.max(0, performance.now() - startedAt);
    },
  };
}

export type ProcessResourceUsage = {
  scope: "process-group";
  sampleIntervalMs: number;
  sampleCount: number;
  peakRssBytes?: number;
  averageCpuPercent?: number;
  peakCpuPercent?: number;
};

export type ProcessResourceSampler = {
  stop(): Promise<ProcessResourceUsage>;
};

const defaultResourceSampleIntervalMs = 250;

export function startProcessResourceSampler(
  processGroupId: number,
  sampleIntervalMs = defaultResourceSampleIntervalMs,
): ProcessResourceSampler {
  let sampleCount = 0;
  let peakRssBytes = 0;
  let cpuPercentTotal = 0;
  let peakCpuPercent = 0;
  let stopped = false;
  let pending: Promise<void> | undefined;

  const sample = () => {
    if (stopped || pending !== undefined || process.platform === "win32") return;
    pending = readUnixProcessGroupUsage(processGroupId)
      .then((usage) => {
        if (usage === undefined) return;
        sampleCount += 1;
        peakRssBytes = Math.max(peakRssBytes, usage.rssBytes);
        cpuPercentTotal += usage.cpuPercent;
        peakCpuPercent = Math.max(peakCpuPercent, usage.cpuPercent);
      })
      .catch(() => undefined)
      .finally(() => {
        pending = undefined;
      });
  };

  sample();
  const interval = setInterval(sample, sampleIntervalMs);
  interval.unref();

  return {
    async stop() {
      stopped = true;
      clearInterval(interval);
      await pending;
      return {
        scope: "process-group",
        sampleIntervalMs,
        sampleCount,
        ...(sampleCount === 0
          ? {}
          : {
              peakRssBytes,
              averageCpuPercent: cpuPercentTotal / sampleCount,
              peakCpuPercent,
            }),
      };
    },
  };
}

export function combineProcessResourceUsage(usages: readonly ProcessResourceUsage[]): ProcessResourceUsage | undefined {
  if (usages.length === 0) return undefined;
  const sampled = usages.filter((usage) => usage.sampleCount > 0);
  const sampleCount = sampled.reduce((total, usage) => total + usage.sampleCount, 0);
  return {
    scope: "process-group",
    sampleIntervalMs: Math.max(...usages.map((usage) => usage.sampleIntervalMs)),
    sampleCount,
    ...(sampleCount === 0
      ? {}
      : {
          peakRssBytes: Math.max(...sampled.map((usage) => usage.peakRssBytes ?? 0)),
          averageCpuPercent:
            sampled.reduce((total, usage) => total + (usage.averageCpuPercent ?? 0) * usage.sampleCount, 0) /
            sampleCount,
          peakCpuPercent: Math.max(...sampled.map((usage) => usage.peakCpuPercent ?? 0)),
        }),
  };
}

function readUnixProcessGroupUsage(
  processGroupId: number,
): Promise<{ rssBytes: number; cpuPercent: number } | undefined> {
  return new Promise((resolve) => {
    execFile("ps", ["-axo", "pgid=,rss=,%cpu="], { encoding: "utf8" }, (error, stdout) => {
      if (error !== null) {
        resolve(undefined);
        return;
      }
      let rssKilobytes = 0;
      let cpuPercent = 0;
      let matched = false;
      for (const line of stdout.split("\n")) {
        const [rawGroupId, rawRss, rawCpu] = line.trim().split(/\s+/);
        if (Number(rawGroupId) !== processGroupId) continue;
        const rss = Number(rawRss);
        const cpu = Number(rawCpu);
        if (!Number.isFinite(rss) || !Number.isFinite(cpu)) continue;
        matched = true;
        rssKilobytes += rss;
        cpuPercent += cpu;
      }
      resolve(matched ? { rssBytes: rssKilobytes * 1024, cpuPercent } : undefined);
    });
  });
}
