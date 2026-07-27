import { describe, expect, it, vi } from "vitest";
import { createHarmonyAnalysisInput } from "@zupulse/web-core";
import {
  HarmonyAnalysisCancelledError,
  createHarmonyAnalysisWorkerRunner,
  type HarmonyAnalysisWorkerLike,
} from "../harmony-analysis-worker-client";
import { executeHarmonyAnalysisWorkerRequest } from "../harmony-analysis-worker-protocol";

describe("Harmony Analysis Worker client", () => {
  it("returns the same validated result as the production worker request", async () => {
    const worker = fakeWorker();
    const runner = createHarmonyAnalysisWorkerRunner(() => worker);
    const input = analysisInput();

    const result = await runner.analyze(input, {
      includedTrackIds: ["piano"],
      topK: 8,
      decisionThreshold: 0.6,
    });

    expect(result).toEqual(
      executeHarmonyAnalysisWorkerRequest({
        schemaVersion: "1.0.0",
        type: "analyze",
        input,
        options: {
          includedTrackIds: ["piano"],
          topK: 8,
          decisionThreshold: 0.6,
        },
      }).segments,
    );
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("terminates actual work when its AbortSignal is cancelled", async () => {
    const worker = fakeWorker({ hold: true });
    const runner = createHarmonyAnalysisWorkerRunner(() => worker);
    const controller = new AbortController();
    const pending = runner.analyze(
      analysisInput(),
      { includedTrackIds: ["piano"], topK: 8, decisionThreshold: 0.6 },
      controller.signal,
    );

    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(HarmonyAnalysisCancelledError);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("rejects invalid Worker output without exposing its raw payload", async () => {
    const worker = fakeWorker({ response: { privatePath: "/Users/example/score.mxl" } });
    const runner = createHarmonyAnalysisWorkerRunner(() => worker);

    await expect(
      runner.analyze(analysisInput(), {
        includedTrackIds: ["piano"],
        topK: 8,
        decisionThreshold: 0.6,
      }),
    ).rejects.toThrow("harmony-analysis-worker-invalid-response");
  });
});

function fakeWorker(options: { hold?: boolean; response?: unknown } = {}): HarmonyAnalysisWorkerLike {
  const worker: HarmonyAnalysisWorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(request) {
      if (options.hold) return;
      queueMicrotask(() => {
        worker.onmessage?.({
          data: options.response ?? {
            schemaVersion: "1.0.0",
            type: "completed",
            ...executeHarmonyAnalysisWorkerRequest(request),
          },
        } as MessageEvent<unknown>);
      });
    },
    terminate: vi.fn(),
  };
  return worker;
}

function analysisInput() {
  return createHarmonyAnalysisInput({
    ticksPerQuarter: 480,
    measures: [{ index: 0, durationTicks: 480, timeSignature: { numerator: 1, denominator: 4 } }],
    tracks: [
      {
        id: "piano",
        name: "Piano",
        isPercussion: false,
        staves: [
          {
            index: 0,
            notes: [0, 4, 7].map((soundingPitchClass, index) => ({
              id: `note-${index}`,
              moment: { measureIndex: 0, offsetTicks: 0 },
              durationTicks: 480,
              soundingPitchClass,
              soundingMidi: 60 + soundingPitchClass,
              voice: 1,
            })),
          },
        ],
      },
    ],
  });
}
