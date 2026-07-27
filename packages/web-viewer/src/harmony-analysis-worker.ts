import {
  executeHarmonyAnalysisWorkerRequest,
  harmonyAnalysisWorkerResponseSchema,
  type HarmonyAnalysisWorkerRequest,
  type HarmonyAnalysisWorkerResponse,
} from "./harmony-analysis-worker-protocol";

type HarmonyWorkerScope = {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: HarmonyAnalysisWorkerResponse): void;
};

const workerScope = globalThis as unknown as HarmonyWorkerScope;

workerScope.onmessage = (event) => {
  let response: HarmonyAnalysisWorkerResponse;
  try {
    response = executeHarmonyAnalysisWorkerRequest(event.data as HarmonyAnalysisWorkerRequest);
  } catch {
    response = {
      schemaVersion: "1.0.0",
      type: "failed",
      code: "analysis-failed",
    };
  }
  workerScope.postMessage(harmonyAnalysisWorkerResponseSchema.parse(response));
};
