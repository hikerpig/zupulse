import { performance } from "node:perf_hooks";

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
