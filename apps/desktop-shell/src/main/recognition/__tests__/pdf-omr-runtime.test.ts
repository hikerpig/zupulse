import { describe, expect, it } from "vitest";
import type { EngineRegistry, PdfOmrPipelineResult } from "@zupulse/pdf-omr-cli/pipeline";
import { PdfOmrError } from "@zupulse/pdf-omr-cli/pipeline";
import { DesktopPdfOmrRuntime } from "../pdf-omr-runtime";

describe("DesktopPdfOmrRuntime", () => {
  it("runs the programmatic pipeline without returning Main paths", async () => {
    const engineRegistry = { get: () => ({}) } as EngineRegistry;
    let receivedRegistry: EngineRegistry | undefined;
    const runtime = new DesktopPdfOmrRuntime({
      engineRegistry,
      runPipeline: async (request) => {
        receivedRegistry = request.engineRegistry;
        return succeededResult();
      },
    });

    const result = await runtime.run({
      inputPath: "/private/input/score.pdf",
      engineId: "fake",
      outputDirectory: "/private/output/run",
    });

    expect(result).toEqual(succeededResult());
    expect(JSON.stringify(result)).not.toContain("/private/");
    expect(receivedRegistry).toBe(engineRegistry);
    expect(runtime.isRunning()).toBe(false);
  });

  it("captures one registry snapshot per job so later settings affect only later jobs", async () => {
    const firstRegistry = { get: () => ({ id: "first" }) } as unknown as EngineRegistry;
    const secondRegistry = { get: () => ({ id: "second" }) } as unknown as EngineRegistry;
    let currentRegistry = firstRegistry;
    const received: EngineRegistry[] = [];
    const runtime = new DesktopPdfOmrRuntime({
      engineRegistryProvider: () => currentRegistry,
      runPipeline: async (request) => {
        received.push(request.engineRegistry!);
        currentRegistry = secondRegistry;
        return succeededResult();
      },
    });

    await runtime.run({
      inputPath: "/private/input/first.pdf",
      engineId: "fake",
      outputDirectory: "/private/output/first",
    });
    await runtime.run({
      inputPath: "/private/input/second.pdf",
      engineId: "fake",
      outputDirectory: "/private/output/second",
    });

    expect(received).toEqual([firstRegistry, secondRegistry]);
  });

  it("cancels the active pipeline and returns to idle", async () => {
    const runtime = new DesktopPdfOmrRuntime({
      runPipeline: async (request) =>
        new Promise((_resolve, reject) => {
          const interrupted = () => reject(new PdfOmrError("INTERRUPTED", "pipeline interrupted"));
          if (request.signal?.aborted) interrupted();
          else request.signal?.addEventListener("abort", interrupted, { once: true });
        }),
    });

    const operation = runtime.run({
      inputPath: "/private/input/score.pdf",
      engineId: "fake",
      outputDirectory: "/private/output/run",
    });
    expect(runtime.isRunning()).toBe(true);

    runtime.cancel();

    await expect(operation).rejects.toMatchObject({ code: "INTERRUPTED" });
    expect(runtime.isRunning()).toBe(false);
  });

  it("rejects a second run while one is active", async () => {
    let release: (() => void) | undefined;
    const runtime = new DesktopPdfOmrRuntime({
      runPipeline: () =>
        new Promise((resolve) => {
          release = () => resolve(succeededResult());
        }),
    });
    const first = runtime.run({
      inputPath: "/private/input/first.pdf",
      engineId: "fake",
      outputDirectory: "/private/output/first",
    });

    await expect(
      runtime.run({
        inputPath: "/private/input/second.pdf",
        engineId: "fake",
        outputDirectory: "/private/output/second",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", context: { reason: "pipeline-active" } });

    release?.();
    await expect(first).resolves.toEqual(succeededResult());
  });
});

function succeededResult(): PdfOmrPipelineResult {
  return {
    schemaVersion: "1.0.0",
    status: "succeeded",
    input: {
      fileName: "score.pdf",
      inputSha256: "a".repeat(64),
      sizeBytes: 1024,
      pageCount: 1,
      inputKind: "pdf",
    },
    engine: { id: "fake", version: "1.0.0" },
    validation: {
      readiness: { harmony: "ready", musicXml: "ready" },
      outputSha256: "b".repeat(64),
    },
    outputSha256: "c".repeat(64),
    artifacts: {
      inspect: "inspect/input.json",
      recognitionDirectory: "recognition",
      validation: "validation.json",
      musicXml: "score.mxl",
      roundTrip: "round-trip.json",
    },
  };
}
