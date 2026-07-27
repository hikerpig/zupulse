import type { HarmonyAnalysisInput, HarmonySegment } from "@zupulse/web-core/harmony-worker";
import {
  harmonyAnalysisWorkerResponseSchema,
  type HarmonyAnalysisWorkerOptions,
  type HarmonyAnalysisWorkerRequest,
} from "./harmony-analysis-worker-protocol";

export type HarmonyAnalysisRunner = {
  analyze(
    input: HarmonyAnalysisInput,
    options: HarmonyAnalysisWorkerOptions,
    signal?: AbortSignal,
  ): Promise<HarmonySegment[]>;
};

export type HarmonyAnalysisWorkerLike = {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: HarmonyAnalysisWorkerRequest): void;
  terminate(): void;
};

export class HarmonyAnalysisCancelledError extends Error {
  constructor() {
    super("harmony-analysis-cancelled");
    this.name = "HarmonyAnalysisCancelledError";
  }
}

export function createHarmonyAnalysisWorkerRunner(
  createWorker: () => HarmonyAnalysisWorkerLike = () =>
    new Worker(new URL("./harmony-analysis-worker.ts", import.meta.url), {
      type: "module",
      name: "zupulse-harmony-analysis",
    }),
): HarmonyAnalysisRunner {
  return {
    analyze(input, options, signal) {
      if (signal?.aborted) return Promise.reject(new HarmonyAnalysisCancelledError());
      const worker = createWorker();
      return new Promise<HarmonySegment[]>((resolve, reject) => {
        let settled = false;
        const finish = (result: { segments: HarmonySegment[] } | { error: Error }) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener("abort", cancel);
          worker.terminate();
          if ("error" in result) reject(result.error);
          else resolve(result.segments);
        };
        const cancel = () => finish({ error: new HarmonyAnalysisCancelledError() });
        signal?.addEventListener("abort", cancel, { once: true });
        worker.onmessage = (event) => {
          const parsed = harmonyAnalysisWorkerResponseSchema.safeParse(event.data);
          if (!parsed.success) {
            finish({ error: new Error("harmony-analysis-worker-invalid-response") });
            return;
          }
          if (parsed.data.type === "failed") {
            finish({ error: new Error(parsed.data.code) });
            return;
          }
          finish({ segments: parsed.data.segments });
        };
        worker.onerror = () => finish({ error: new Error("harmony-analysis-worker-failed") });
        worker.postMessage({
          schemaVersion: "1.0.0",
          type: "analyze",
          input,
          options,
        });
      });
    },
  };
}
