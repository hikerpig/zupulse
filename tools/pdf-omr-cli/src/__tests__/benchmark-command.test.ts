import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { musicXmlReadyDraft } from "./fixtures/musicxml-ready-draft";
import { runPdfOmrCommand } from "../command";
import { benchmarkCommand } from "../commands/benchmark";
import { PdfOmrError } from "../errors";
import { buildBenchmarkReport, readBenchmarkItemResults, type BenchmarkGateThresholds } from "../benchmark/report";
import { legatoPageContextModeForPreprocess, runBenchmark, type BenchmarkItemResult } from "../benchmark/run-benchmark";
import { sha256Bytes } from "../canonical-json";
import { computeSymbolicMetrics } from "../benchmark/symbolic-metrics";
import { generateMusicXml } from "../generate-musicxml";

describe("benchmark orchestrator", () => {
  it("resolves one adapter for the suite and closes it after all items", async () => {
    const setup = await corpusSetup("development", 2);
    let getCount = 0;
    let closeCount = 0;
    await runBenchmark(
      {
        manifestPath: setup.manifestPath,
        engineId: "legato",
        preprocess: "none",
        outputDirectory: setup.outputDirectory,
        mode: "development",
      },
      {
        engineRegistry: {
          get: () => {
            getCount += 1;
            return {
              inspectEnvironment: async () => ({
                id: "legato",
                version: "test",
                executable: "fake",
                commandTemplate: [],
                license: { id: "MIT", source: "https://example.test" },
              }),
              recognize: async () => {
                throw new Error("unused");
              },
              normalize: () => musicXmlReadyDraft(),
              close: async () => {
                closeCount += 1;
              },
            };
          },
        },
        runItem: async (item, context) => {
          context.engineRegistry.get("legato");
          return itemResult(item.id, item.category, true);
        },
      },
    );

    expect(getCount).toBe(1);
    expect(closeCount).toBe(1);
  });

  it("does not resolve an engine adapter when a custom item runner does not use it", async () => {
    const setup = await corpusSetup("development", 1);
    const result = await runBenchmark(
      {
        manifestPath: setup.manifestPath,
        engineId: "rokot",
        preprocess: "none",
        outputDirectory: setup.outputDirectory,
        mode: "development",
      },
      {
        engineRegistry: {
          get: () => {
            throw new Error("unused engine registry");
          },
        },
        runItem: async (item) => itemResult(item.id, item.category, true),
      },
    );

    expect(result.report.items).toEqual({ total: 1, succeeded: 1, failed: 0 });
  });

  it("configures a worker-backed adapter for an ordinary LEGATO benchmark", async () => {
    const setup = await corpusSetup("development", 2);
    const environment = {
      PDF_OMR_LEGATO_PYTHON: "/runtime/python",
      PDF_OMR_LEGATO_REPOSITORY: setup.directory,
      PDF_OMR_LEGATO_MODEL: setup.directory,
      PDF_OMR_LEGATO_BASE_MODEL: setup.directory,
    };
    const previous = Object.fromEntries(Object.keys(environment).map((name) => [name, process.env[name]]));
    Object.assign(process.env, environment);
    try {
      const result = await runBenchmark(
        {
          manifestPath: setup.manifestPath,
          engineId: "legato",
          preprocess: "none",
          outputDirectory: setup.outputDirectory,
          mode: "development",
        },
        {
          runItem: async (item, context) => {
            expect(context.engineRegistry.get("legato").close).toEqual(expect.any(Function));
            return itemResult(item.id, item.category, true);
          },
        },
      );

      expect(result.report.failures).toEqual([]);
      expect(result.report.items).toEqual({ total: 2, succeeded: 2, failed: 0 });
    } finally {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("preserves successful items when another item crashes", async () => {
    const setup = await corpusSetup("development", 2);
    const result = await runBenchmark(
      {
        manifestPath: setup.manifestPath,
        engineId: "audiveris",
        preprocess: "none",
        outputDirectory: setup.outputDirectory,
        mode: "development",
      },
      {
        runItem: async (item) => {
          if (item.id.endsWith("-2")) throw new PdfOmrError("ENGINE_EXECUTION_FAILED", "crash");
          return itemResult(item.id, item.category, true);
        },
      },
    );

    expect(result.report.items).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(result.report.overall?.symbolic.joint.f1).toBe(1);
    await expect(readFile(join(setup.outputDirectory, "items", "item-2", "error.json"), "utf8")).resolves.toContain(
      "ENGINE_EXECUTION_FAILED",
    );
  });

  it("records a ground-truth evaluation limitation without fabricating symbolic metrics", async () => {
    const readyMusicXml = new TextDecoder().decode(generateMusicXml(musicXmlReadyDraft(), { container: "xml" }));
    const blockedMusicXml = readyMusicXml.replace(/<key>[\s\S]*?<\/key>/, "");
    const setup = await corpusSetup("development", 1, undefined, undefined, new TextEncoder().encode(blockedMusicXml));

    const result = await runBenchmark(
      {
        manifestPath: setup.manifestPath,
        engineId: "audiveris",
        preprocess: "none",
        outputDirectory: setup.outputDirectory,
        mode: "development",
      },
      { runItem: async (item) => itemResult(item.id, item.category, true) },
    );

    expect(result.report.items).toEqual({ total: 1, succeeded: 0, failed: 1 });
    expect(result.report.overall).toBeUndefined();
    await expect(readFile(join(setup.outputDirectory, "items", "item-1", "error.json"), "utf8")).resolves.toContain(
      "BENCHMARK_EVALUATION_LIMITATION",
    );
    await expect(
      readFile(join(setup.outputDirectory, "items", "item-1", "ground-truth-validation.json"), "utf8"),
    ).resolves.toContain("MISSING_KEY_SIGNATURE");
  });

  it("saves a complete frozen report before returning gate failure", async () => {
    const setup = await corpusSetup("holdout", 1);

    await expect(
      benchmarkCommand(
        setup.manifestPath,
        "audiveris",
        setup.outputDirectory,
        {
          mode: "holdout",
          protocolSha256: setup.protocolSha256,
          preprocess: "none",
        },
        { runItem: async (item) => itemResult(item.id, item.category, false) },
      ),
    ).rejects.toMatchObject({ code: "BENCHMARK_GATE_FAILED" });

    const report = JSON.parse(await readFile(join(setup.outputDirectory, "report.json"), "utf8")) as {
      gate: { passed: boolean; decision: string };
    };
    expect(report.gate).toMatchObject({ passed: false, decision: "STOP" });
  });

  it("uses the frozen protocol thresholds when evaluating holdout", async () => {
    const setup = await corpusSetup("holdout", 1, {
      jointF1: 0,
      validMeasureRate: 0,
      parseRate: 0,
      structuralAgreementRate: 0,
      harmonyPrecisionDelta: -1,
      falseConfidentChordRate: 1,
      reproducibilityAgreementRate: 0,
      cancelLatencyP95Ms: 100_000,
    });

    await expect(
      benchmarkCommand(
        setup.manifestPath,
        "audiveris",
        setup.outputDirectory,
        {
          mode: "holdout",
          protocolSha256: setup.protocolSha256,
          preprocess: "none",
        },
        { runItem: async (item) => itemResult(item.id, item.category, false) },
      ),
    ).resolves.toMatchObject({ command: "benchmark", gateEvaluated: true, gatePassed: true });
  });

  it("enforces declared wall-time, RSS and GPU resource budgets", async () => {
    const setup = await corpusSetup("holdout", 1, {
      jointF1: 0,
      validMeasureRate: 0,
      parseRate: 0,
      structuralAgreementRate: 0,
      harmonyPrecisionDelta: -1,
      falseConfidentChordRate: 1,
      reproducibilityAgreementRate: 0,
      cancelLatencyP95Ms: 100_000,
      maxWallTimeP95Ms: 99,
      maxPeakRssP95Bytes: 999,
      maxGpuMemoryP95Bytes: 1_999,
    });

    const result = await runBenchmark(
      {
        manifestPath: setup.manifestPath,
        engineId: "audiveris",
        preprocess: "none",
        outputDirectory: setup.outputDirectory,
        mode: "holdout",
        protocolSha256: setup.protocolSha256,
      },
      { runItem: async (item) => itemResult(item.id, item.category, true) },
    );

    expect(result.report.gate).toMatchObject({ evaluated: true, passed: false, decision: "STOP" });
    if (result.report.gate.evaluated) {
      expect(result.report.gate.checks.wallTimeP95WithinBudget.passed).toBe(false);
      expect(result.report.gate.checks.peakRssP95WithinBudget.passed).toBe(false);
      expect(result.report.gate.checks.gpuMemoryP95WithinBudget.passed).toBe(false);
    }
  });

  it("fails the holdout gate when runtime evidence is incomplete", async () => {
    const setup = await corpusSetup("holdout", 1);
    await expect(
      benchmarkCommand(
        setup.manifestPath,
        "audiveris",
        setup.outputDirectory,
        { mode: "holdout", protocolSha256: setup.protocolSha256, preprocess: "none" },
        {
          runItem: async (item) => {
            const result = itemResult(item.id, item.category, true);
            delete result.runtime.cancelLatencyMs;
            delete result.runtime.gpuMemoryBytes;
            return result;
          },
        },
      ),
    ).rejects.toMatchObject({ code: "BENCHMARK_GATE_FAILED" });

    const report = JSON.parse(await readFile(join(setup.outputDirectory, "report.json"), "utf8")) as {
      gate: { checks: Record<string, { passed: boolean }> };
    };
    expect(report.gate.checks.cancelLatencyComplete.passed).toBe(false);
    expect(report.gate.checks.gpuMemoryComplete.passed).toBe(false);
  });

  it("records stage metrics and a neutral part map for the real item runner", async () => {
    const setup = await corpusSetup("development", 1);
    const predicted = musicXmlReadyDraft();
    predicted.parts[0]!.id = "piano";
    predicted.parts[0]!.name = "Piano";

    const result = await runBenchmark(
      {
        manifestPath: setup.manifestPath,
        engineId: "audiveris",
        preprocess: "none",
        outputDirectory: setup.outputDirectory,
        mode: "development",
      },
      {
        engineRegistry: {
          get: () => ({
            inspectEnvironment: async () => ({
              id: "audiveris",
              version: "test",
              executable: "fake",
              commandTemplate: [],
              license: { id: "MIT", source: "https://example.test/license" },
            }),
            recognize: async () => ({
              normalizationBytes: new Uint8Array(),
              nativeArtifacts: [],
              diagnostics: [],
              durationMs: 1,
              resourceUsage: {
                scope: "process-group" as const,
                sampleIntervalMs: 250,
                sampleCount: 2,
                peakRssBytes: 123_456,
                averageCpuPercent: 75,
                peakCpuPercent: 90,
              },
              decoderTelemetry: {
                schemaVersion: "1.0.0" as const,
                workerRequests: [{ warm: true, requestDurationMs: 40 }],
                pages: [
                  {
                    pageNumber: 1,
                    outputTokenCount: 64,
                    maxLength: 2048,
                    termination: "eos" as const,
                    device: "mps",
                    dtype: "float16",
                  },
                ],
              },
            }),
            normalize: () => predicted,
          }),
        },
        readGpuMemoryBytes: () => 4_096,
        measureCancelLatency: async () => 25,
      },
    );

    expect(result.report.overall?.runtime.metricsAvailability).toEqual({
      stageWallTimeMs: true,
      cancelLatencyMs: true,
      peakRssBytes: true,
      gpuMemoryBytes: true,
      processCpuPercent: true,
      decoderTelemetry: true,
    });
    expect(result.report.overall?.runtime.stageWallTimeMs).toHaveProperty("validate");
    expect(result.report.overall?.runtime).toMatchObject({
      peakRssBytes: { p50: 123_456, p95: 123_456, max: 123_456 },
      processResources: {
        scope: "process-group",
        sampleIntervalMs: 250,
        sampleCount: 4,
        averageCpuPercent: { p50: 75, p95: 75, max: 75 },
        peakCpuPercent: { p50: 90, p95: 90, max: 90 },
      },
      decoder: {
        pageCount: 2,
        outputTokens: { p50: 64, p95: 64, max: 64 },
        maxLengthHitCount: 0,
        terminationCounts: { eos: 2, "max-length": 0, other: 0 },
        worker: {
          warmRequestMs: { p50: 40, p95: 40, max: 40 },
        },
      },
    });
    await expect(
      readFile(join(setup.outputDirectory, "items", "item-1", "part-identity.json"), "utf8"),
    ).resolves.toContain('"expectedId": "P1"');
    await expect(
      readFile(join(setup.outputDirectory, "items", "item-1", "engine", "normalization-output.bin")),
    ).resolves.toHaveLength(0);
    await expect(
      readFile(join(setup.outputDirectory, "items", "item-1", "predicted-validation.json"), "utf8"),
    ).resolves.toContain('"musicXml": "ready"');
  });

  it("passes input scope to the adapter and preserves bounded development failure evidence", async () => {
    const setup = await corpusSetup("development", 1, undefined, undefined, undefined, undefined, {
      inputScope: "system-crop",
      staffLayout: "grand-staff",
    });
    let receivedInputScope: string | undefined;

    const result = await runBenchmark(
      {
        manifestPath: setup.manifestPath,
        engineId: "rokot",
        preprocess: "none",
        outputDirectory: setup.outputDirectory,
        mode: "development",
      },
      {
        engineRegistry: {
          get: () => ({
            inspectEnvironment: async () => ({
              id: "rokot",
              version: "test",
              executable: "fake",
              commandTemplate: [],
              license: { id: "MIT", source: "https://example.test/license" },
            }),
            recognize: async (request) => {
              receivedInputScope = request.inputScope;
              const debugDirectory = join(request.outputDirectory, "failure-debug");
              await mkdir(debugDirectory);
              await writeFile(join(debugDirectory, "raw-response.txt"), "bounded model output");
              throw new PdfOmrError("ENGINE_OUTPUT_INVALID", "invalid output", {
                context: { reason: "invalid-rokot-abc-envelope" },
              });
            },
            normalize: () => musicXmlReadyDraft(),
          }),
        },
      },
    );

    expect(receivedInputScope).toBe("system-crop");
    expect(result.report.items).toEqual({ total: 1, succeeded: 0, failed: 1 });
    await expect(
      readFile(join(setup.outputDirectory, "items", "item-1", "failure-debug", "raw-response.txt"), "utf8"),
    ).resolves.toBe("bounded model output");
  });

  it("accepts the materialized system-pages preprocess only for LEGATO", async () => {
    const setup = await corpusSetup("development", 1);
    const adapter = {
      inspectEnvironment: async () => ({
        id: "legato",
        version: "test",
        executable: "fake",
        commandTemplate: [],
        license: { id: "MIT", source: "https://example.test/license" },
      }),
      recognize: async () => ({
        normalizationBytes: new Uint8Array(),
        nativeArtifacts: [],
        diagnostics: [],
        durationMs: 1,
      }),
      normalize: () => musicXmlReadyDraft(),
    };

    const accepted = await runBenchmark(
      {
        manifestPath: setup.manifestPath,
        engineId: "legato",
        preprocess: "legato-system-pages-v1",
        outputDirectory: setup.outputDirectory,
        mode: "development",
      },
      { engineRegistry: { get: () => adapter } },
    );

    expect(accepted.report.items).toEqual({ total: 1, succeeded: 1, failed: 0 });

    const contextSetup = await corpusSetup("development", 1);
    const contextAccepted = await runBenchmark(
      {
        manifestPath: contextSetup.manifestPath,
        engineId: "legato",
        preprocess: "legato-system-pages-context-v1",
        outputDirectory: contextSetup.outputDirectory,
        mode: "development",
      },
      { engineRegistry: { get: () => adapter } },
    );
    expect(contextAccepted.report.items).toEqual({ total: 1, succeeded: 1, failed: 0 });
    expect(legatoPageContextModeForPreprocess("legato-system-pages-context-v1")).toBe("previous-page-abc");
    expect(legatoPageContextModeForPreprocess("legato-system-pages-v1")).toBe("none");

    const rejectedSetup = await corpusSetup("development", 1);
    const rejected = await runBenchmark(
      {
        manifestPath: rejectedSetup.manifestPath,
        engineId: "rokot",
        preprocess: "legato-system-pages-v1",
        outputDirectory: rejectedSetup.outputDirectory,
        mode: "development",
      },
      { engineRegistry: { get: () => adapter } },
    );
    expect(rejected.report.failures).toEqual([
      expect.objectContaining({ itemId: "item-1", code: "INVALID_CLI_ARGUMENT" }),
    ]);
  });

  it("repeats only the six items declared by a standard execution profile", async () => {
    const repeatItemIds = Array.from({ length: 6 }, (_, index) => `item-${index + 6}`);
    const setup = await corpusSetup("development", 45, undefined, undefined, undefined, {
      profile: "standard",
      maxTotalWallTimeMs: 3_600_000,
      repeatItemIds,
    });
    const recognitionCounts = new Map<string, number>();
    const predicted = musicXmlReadyDraft();

    await runBenchmark(
      {
        manifestPath: setup.manifestPath,
        engineId: "audiveris",
        preprocess: "none",
        outputDirectory: setup.outputDirectory,
        mode: "development",
      },
      {
        engineRegistry: {
          get: () => ({
            inspectEnvironment: async () => ({
              id: "audiveris",
              version: "test",
              executable: "fake",
              commandTemplate: [],
              license: { id: "MIT", source: "https://example.test/license" },
            }),
            recognize: async (request) => {
              const inputName = basename(request.inputPath);
              recognitionCounts.set(inputName, (recognitionCounts.get(inputName) ?? 0) + 1);
              return { normalizationBytes: new Uint8Array(), nativeArtifacts: [], diagnostics: [], durationMs: 1 };
            },
            normalize: () => predicted,
          }),
        },
      },
    );

    expect([...recognitionCounts.values()].reduce((total, count) => total + count, 0)).toBe(51);
    expect(
      Object.fromEntries(
        Array.from({ length: 45 }, (_, index) => {
          const itemNumber = index + 1;
          return [`input-${itemNumber}.pdf`, itemNumber >= 6 && itemNumber <= 11 ? 2 : 1];
        }),
      ),
    ).toEqual(Object.fromEntries(recognitionCounts));
  }, 15_000);

  it("writes Rokot joining evidence alongside the normalized Draft", async () => {
    const setup = await corpusSetup("development", 1);
    const predicted = musicXmlReadyDraft();
    const normalizationBytes = new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: "1.0.0",
        systems: [
          {
            pageIndex: 0,
            systemIndex: 0,
            source: {
              staffLayout: "single-staff",
              staffCount: 1,
              pixelBbox: { x: 0, y: 0, width: 100, height: 100 },
              pdfPointBbox: { x: 0, y: 0, width: 10, height: 10 },
              cropSha256: "a".repeat(64),
            },
            abcUtf8: "%%rokot-abc 0.1\nX:1\nM:4/4\nL:1/4\nK:C\nV:1\n[V:1] C4 |\n",
            musicXmlUtf8: new TextDecoder().decode(generateMusicXml(predicted, { container: "xml" })),
          },
        ],
      }),
    );

    await runBenchmark(
      {
        manifestPath: setup.manifestPath,
        engineId: "rokot",
        preprocess: "none",
        outputDirectory: setup.outputDirectory,
        mode: "development",
      },
      {
        engineRegistry: {
          get: () => ({
            inspectEnvironment: async () => ({
              id: "rokot",
              version: "test",
              executable: "fake",
              commandTemplate: [],
              license: { id: "MIT", source: "https://example.test/license" },
            }),
            recognize: async () => ({ normalizationBytes, nativeArtifacts: [], diagnostics: [], durationMs: 1 }),
            normalize: () => predicted,
          }),
        },
      },
    );

    await expect(readFile(join(setup.outputDirectory, "items", "item-1", "joining.json"), "utf8")).resolves.toContain(
      '"rawGlobalMeasureStart": 0',
    );
  });

  it("resolves benchmark paths against the command context cwd", async () => {
    const setup = await corpusSetup("development", 1);

    await expect(
      runPdfOmrCommand(
        ["benchmark", "--manifest", "manifest.json", "--engine", "audiveris", "--output", "relative-result"],
        {
          cwd: setup.directory,
          benchmarkDependencies: { runItem: async (item) => itemResult(item.id, item.category, true) },
        },
      ),
    ).resolves.toMatchObject({ command: "benchmark", status: "succeeded" });
    const report = JSON.parse(await readFile(join(setup.directory, "relative-result", "report.json"), "utf8")) as {
      metadata: { mode: string };
    };
    expect(report.metadata.mode).toBe("development");
  });

  it("passes the benchmark signal to environment inspection and recognition", async () => {
    const setup = await corpusSetup("development", 1);
    const controller = new AbortController();
    const receivedSignals: Array<AbortSignal | undefined> = [];
    const draft = musicXmlReadyDraft();

    await runBenchmark(
      {
        manifestPath: setup.manifestPath,
        engineId: "audiveris",
        preprocess: "none",
        outputDirectory: setup.outputDirectory,
        mode: "development",
        signal: controller.signal,
      },
      {
        engineRegistry: {
          get: () => ({
            inspectEnvironment: async (signal) => {
              receivedSignals.push(signal);
              return {
                id: "audiveris",
                version: "test",
                executable: "fake",
                commandTemplate: [],
                license: { id: "MIT", source: "https://example.test/license" },
              };
            },
            recognize: async (request) => {
              receivedSignals.push(request.signal);
              return {
                normalizationBytes: new Uint8Array(),
                nativeArtifacts: [],
                diagnostics: [],
                durationMs: 1,
              };
            },
            normalize: () => draft,
          }),
        },
      },
    );

    expect(receivedSignals).toEqual([controller.signal, controller.signal, controller.signal]);
  });

  it("stops benchmark output after the signal is aborted", async () => {
    const setup = await corpusSetup("development", 2);
    const controller = new AbortController();
    let calls = 0;

    await expect(
      runBenchmark(
        {
          manifestPath: setup.manifestPath,
          engineId: "audiveris",
          preprocess: "none",
          outputDirectory: setup.outputDirectory,
          mode: "development",
          signal: controller.signal,
        },
        {
          runItem: async (item) => {
            calls += 1;
            controller.abort();
            return itemResult(item.id, item.category, true);
          },
        },
      ),
    ).rejects.toMatchObject({ code: "INTERRUPTED" });
    expect(calls).toBe(1);
    await expect(readFile(join(setup.outputDirectory, "report.json"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("aborts owned work and writes an incomplete report when the total budget expires", async () => {
    const repeatItemIds = Array.from({ length: 6 }, (_, index) => `item-${index + 6}`);
    const setup = await corpusSetup("development", 45, undefined, undefined, undefined, {
      profile: "standard",
      maxTotalWallTimeMs: 3_600_000,
      repeatItemIds,
    });
    let expireBudget: (() => void) | undefined;
    let calls = 0;

    await expect(
      runBenchmark(
        {
          manifestPath: setup.manifestPath,
          engineId: "audiveris",
          preprocess: "none",
          outputDirectory: setup.outputDirectory,
          mode: "development",
        },
        {
          scheduleBudgetExpiration: (expire) => {
            expireBudget = expire;
            return () => undefined;
          },
          runItem: async (_item, context) => {
            calls += 1;
            expect(context.signal?.aborted).toBe(false);
            expireBudget?.();
            expect(context.signal?.aborted).toBe(true);
            throw new PdfOmrError("INTERRUPTED", "engine execution was interrupted");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "BENCHMARK_RESOURCE_BUDGET_EXCEEDED" });

    expect(calls).toBe(1);
    const report = JSON.parse(await readFile(join(setup.outputDirectory, "report.json"), "utf8")) as {
      completion: { complete: boolean; reason: string };
      items: { total: number; succeeded: number; failed: number };
      failures: Array<{ code: string }>;
    };
    expect(report.completion).toEqual({ complete: false, reason: "total-wall-time-budget-exceeded" });
    expect(report.items).toEqual({ total: 45, succeeded: 0, failed: 45 });
    expect(new Set(report.failures.map((failure) => failure.code))).toEqual(
      new Set(["BENCHMARK_RESOURCE_BUDGET_EXCEEDED"]),
    );
  });

  it("uses only oracle-system items for profiled quality gates", () => {
    const metadata = {
      corpusId: "public-pianoform-v1",
      protocolVersion: "1.0.0",
      manifestSha256: "a".repeat(64),
      mode: "holdout" as const,
      engineId: "audiveris",
      preprocess: "none",
      execution: { profile: "standard" as const, maxTotalWallTimeMs: 3_600_000, repeatItemCount: 6 },
    };
    const records: BenchmarkItemResult[] = [
      { ...itemResult("contract", "contract", true), benchmarkSuite: "contract" },
      { ...itemResult("oracle", "oracle", false), benchmarkSuite: "oracle-system" },
      { ...itemResult("full-page", "full-page", true), benchmarkSuite: "full-page" },
    ];

    const report = buildBenchmarkReport(metadata, records, {
      jointF1: 0.9,
      validMeasureRate: 0.9,
      parseRate: 0.9,
      structuralAgreementRate: 0.9,
      harmonyPrecisionDelta: -0.1,
      falseConfidentChordRate: 0.1,
      reproducibilityAgreementRate: 0.9,
      cancelLatencyP95Ms: 2_000,
    });

    expect(report.overall?.symbolic.joint.f1).toBeGreaterThan(0);
    expect(report.quality?.symbolic.joint.f1).toBe(0);
    expect(report.gate).toMatchObject({ evaluated: true, passed: false, decision: "STOP" });
  });

  it("does not fail a profiled quality gate for non-oracle failures", () => {
    const oracle = { ...itemResult("oracle", "oracle", true), benchmarkSuite: "oracle-system" as const };
    const failure = {
      schemaVersion: "1.0.0" as const,
      itemId: "full-page",
      category: "full-page",
      benchmarkSuite: "full-page" as const,
      status: "failed" as const,
      error: { code: "ENGINE_EXECUTION_FAILED", message: "failed" },
    };
    const report = buildBenchmarkReport(
      {
        corpusId: "public-pianoform-v1",
        protocolVersion: "1.0.0",
        manifestSha256: "a".repeat(64),
        mode: "holdout",
        engineId: "audiveris",
        preprocess: "none",
        execution: { profile: "standard", maxTotalWallTimeMs: 3_600_000, repeatItemCount: 6 },
      },
      [oracle, failure],
      {
        jointF1: 0.9,
        validMeasureRate: 0.9,
        parseRate: 0.9,
        structuralAgreementRate: 0.9,
        harmonyPrecisionDelta: -0.1,
        falseConfidentChordRate: 0.1,
        reproducibilityAgreementRate: 0.9,
        cancelLatencyP95Ms: 2_000,
      },
    );

    expect(report.items.failed).toBe(1);
    expect(report.gate).toMatchObject({ evaluated: true, passed: true, decision: "CONTINUE_TO_APP_DISCOVERY" });
  });

  it("summarizes safe failure stage and reason for diagnosis", () => {
    const report = buildBenchmarkReport(
      {
        corpusId: "corpus",
        protocolVersion: "1.0.0",
        manifestSha256: "a".repeat(64),
        mode: "development",
        engineId: "rokot",
        preprocess: "none",
      },
      [
        {
          schemaVersion: "1.0.0",
          itemId: "single-staff",
          category: "melody",
          status: "failed",
          error: {
            code: "ENGINE_OUTPUT_INVALID",
            message: "engine output is invalid",
            context: { stage: "staff-system-topology", reason: "ambiguous-system-segmentation", path: "/private" },
          },
        },
      ],
    );

    expect(report.failures).toEqual([
      {
        itemId: "single-staff",
        category: "melody",
        code: "ENGINE_OUTPUT_INVALID",
        stage: "staff-system-topology",
        reason: "ambiguous-system-segmentation",
      },
    ]);
  });

  it("rebuilds aggregate output from item artifacts with the same canonical hash", async () => {
    const setup = await corpusSetup("development", 2);
    const run = await runBenchmark(
      {
        manifestPath: setup.manifestPath,
        engineId: "audiveris",
        preprocess: "none",
        outputDirectory: setup.outputDirectory,
        mode: "development",
      },
      { runItem: async (item) => itemResult(item.id, item.category, true) },
    );

    const items = await readBenchmarkItemResults(setup.outputDirectory);
    const rebuilt = buildBenchmarkReport(run.report.metadata, items);

    expect(sha256Bytes(new TextEncoder().encode(JSON.stringify(rebuilt)))).toBe(
      sha256Bytes(new TextEncoder().encode(JSON.stringify(run.report))),
    );
  });
});

async function corpusSetup(
  split: "development" | "holdout",
  count: number,
  gates: BenchmarkGateThresholds = {
    jointF1: 0.9,
    validMeasureRate: 0.95,
    parseRate: 0.95,
    structuralAgreementRate: 0.9,
    harmonyPrecisionDelta: -0.05,
    falseConfidentChordRate: 0.03,
    reproducibilityAgreementRate: 1,
    cancelLatencyP95Ms: 2000,
  },
  groundTruthDraft = musicXmlReadyDraft(),
  groundTruthBytesOverride?: Uint8Array,
  execution?: {
    profile: "quick" | "standard";
    maxTotalWallTimeMs: number;
    repeatItemIds: string[];
  },
  itemMetadata?: { inputScope: "system-crop" | "full-page"; staffLayout: "single-staff" | "grand-staff" },
) {
  const directory = await mkdtemp(join(tmpdir(), "pdf-omr-benchmark-"));
  const inputBytes = new TextEncoder().encode("pdf");
  const groundTruthBytes = groundTruthBytesOverride ?? generateMusicXml(groundTruthDraft, { container: "mxl" });
  const groundTruthPath = groundTruthBytesOverride === undefined ? "truth.mxl" : "truth.musicxml";
  const groundTruthFormat = groundTruthBytesOverride === undefined ? "mxl" : "musicxml";
  await Promise.all(
    Array.from({ length: count }, (_, index) => writeFile(join(directory, `input-${index + 1}.pdf`), inputBytes)),
  );
  await writeFile(join(directory, groundTruthPath), groundTruthBytes);
  const manifest = {
    schemaVersion: "1.0.0",
    corpusId: "smoke",
    protocolVersion: "1.0.0",
    ...(execution === undefined ? {} : { execution }),
    items: Array.from({ length: count }, (_, index) => ({
      id: `item-${index + 1}`,
      workId: `work-${index + 1}`,
      variantId: "render",
      split,
      category: index === 0 ? "digital-vector" : "degraded-scan",
      ...(itemMetadata === undefined ? {} : itemMetadata),
      ...(execution === undefined
        ? {}
        : {
            benchmarkSuite:
              index < (execution.profile === "quick" ? 2 : 5)
                ? ("contract" as const)
                : index < (execution.profile === "quick" ? 8 : 41)
                  ? ("oracle-system" as const)
                  : ("full-page" as const),
          }),
      input: { path: `input-${index + 1}.pdf`, sha256: sha256Bytes(inputBytes) },
      groundTruth: { path: groundTruthPath, sha256: sha256Bytes(groundTruthBytes), format: groundTruthFormat },
      license: { id: "CC0-1.0", source: "https://example.test/license" },
    })),
  };
  const manifestPath = join(directory, "manifest.json");
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  await writeFile(manifestPath, manifestBytes);
  const protocolBytes = new TextEncoder().encode(
    JSON.stringify({
      schemaVersion: "1.0.0",
      status: "frozen",
      frozenAt: "2026-07-28T12:00:00.000Z",
      manifestSha256: sha256Bytes(manifestBytes),
      benchmarkCommit: "9bbff5b",
      engines: [{ id: "audiveris", version: "5.10.2", parameters: {} }],
      preprocessVariants: ["none"],
      gates,
    }),
  );
  await writeFile(join(directory, "protocol.json"), protocolBytes);
  return {
    directory,
    manifestPath,
    outputDirectory: join(directory, "result"),
    protocolSha256: sha256Bytes(protocolBytes),
  };
}

function itemResult(itemId: string, category: string, passing: boolean): BenchmarkItemResult {
  const draft = musicXmlReadyDraft();
  const symbolic = computeSymbolicMetrics(passing ? draft : { ...draft, parts: [] }, draft);
  return {
    schemaVersion: "1.0.0",
    itemId,
    category,
    status: "succeeded",
    symbolic,
    harmony: {
      overlap: {
        mappedDurationTicks: 100,
        correctDurationTicks: passing ? 100 : 0,
        wrongDurationTicks: passing ? 0 : 100,
        unresolvedDurationTicks: 0,
        accuracy: passing ? 1 : 0,
        resolvedPrecision: passing ? 1 : 0,
        resolvedCoverage: 1,
      },
      boundaries: {
        expected: 0,
        predicted: 0,
        truePositive: 0,
        overSegmented: 0,
        underSegmented: 0,
        f1: 0,
      },
      falseConfidentChord: { wrong: passing ? 0 : 1, resolved: 1, rate: passing ? 0 : 1 },
      status: { omrBlocked: 0, harmonyUnresolved: 0, unsupportedGold: 0 },
    },
    runtime: {
      generation: passing,
      parse: passing,
      view: passing,
      playback: passing,
      structural: passing,
      wallTimeMs: 100,
      peakRssBytes: 1_000,
      stageWallTimeMs: { inspect: 10, recognize: 20, normalize: 30, validate: 40, export: 50 },
      gpuMemoryBytes: 2_000,
      cancelLatencyMs: 100,
    },
    reproducibility: {
      comparisons: 1,
      agreements: passing ? 1 : 0,
      agreementRate: passing ? 1 : 0,
      mismatches: [],
    },
  };
}
