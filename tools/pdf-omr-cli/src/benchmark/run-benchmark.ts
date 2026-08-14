import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { canonicalJson, sha256Bytes } from "../canonical-json";
import { writeBytesNew, writeCanonicalNew } from "../commands/draft-io";
import { createEngineRegistry, type EngineRegistry } from "../engine-registry";
import { PdfOmrError } from "../errors";
import { generateMusicXml } from "../generate-musicxml";
import { compareDraftMusicXml } from "../musicxml-structural-compare";
import { normalizeAudiverisMusicXml } from "../normalizers/audiveris";
import { omrScoreDraftSchema } from "../schemas";
import { validateDraft } from "../validate-draft";
import { analyzeHarmonyImpactDrafts } from "./harmony-ground-truth";
import { verifyCorpusManifest, type CorpusItem } from "./corpus";
import { createCorpusView } from "./protocol";
import { calculateReproducibilityMetrics } from "./reproducibility-metrics";
import {
  buildBenchmarkReport,
  type BenchmarkItemFailure,
  type BenchmarkItemRecord,
  type BenchmarkItemResult,
  type BenchmarkGateThresholds,
  type BenchmarkMetadata,
  type BenchmarkReport,
} from "./report";
import { computeSymbolicMetrics } from "./symbolic-metrics";
import { alignDraftParts } from "./part-identity";
import { benchmarkStages, type BenchmarkStage } from "./runtime-metrics";
import { verifyFrozenProtocol } from "./verify-protocol";
import { buildRokotJoiningEvidence } from "./rokot-joining-evidence";
import { parseRokotSystemBundle } from "../normalizers/rokot";

export type { BenchmarkItemResult } from "./report";

export type RunBenchmarkRequest = {
  manifestPath: string;
  engineId: string;
  preprocess: string;
  outputDirectory: string;
  mode: "development" | "holdout";
  protocolSha256?: string;
  signal?: AbortSignal;
};

export type RunBenchmarkDependencies = {
  engineRegistry?: EngineRegistry;
  readGpuMemoryBytes?: () => number | undefined;
  measureCancelLatency?: (item: CorpusItem) => Promise<number | undefined>;
  scheduleBudgetExpiration?: (expire: () => void, timeoutMs: number) => () => void;
  runItem?: (
    item: CorpusItem,
    context: {
      corpusRoot: string;
      itemOutputDirectory: string;
      engineId: string;
      preprocess: string;
      repetitions: number;
      engineRegistry: EngineRegistry;
      groundTruth: GroundTruthEvaluation;
      readGpuMemoryBytes?: () => number | undefined;
      measureCancelLatency?: (item: CorpusItem) => Promise<number | undefined>;
      preserveFailureEvidence: boolean;
      signal?: AbortSignal;
    },
  ) => Promise<BenchmarkItemResult>;
};

export async function runBenchmark(
  request: RunBenchmarkRequest,
  dependencies: RunBenchmarkDependencies = {},
): Promise<{ report: BenchmarkReport; reportSha256: string }> {
  throwIfBenchmarkAborted(request.signal);
  const manifestPath = resolve(request.manifestPath);
  const manifestBytes = await readFile(manifestPath).catch((error: unknown) => {
    throw new PdfOmrError("INVALID_INPUT", "benchmark manifest cannot be read", { cause: error });
  });
  let manifestInput: unknown;
  try {
    manifestInput = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "benchmark manifest JSON is invalid", { cause: error });
  }
  const manifest = verifyCorpusManifest(manifestInput);
  const manifestSha256 = sha256Bytes(manifestBytes);
  let gateThresholds: BenchmarkGateThresholds | undefined;
  if (request.mode === "holdout" && request.protocolSha256 === undefined) {
    throw new PdfOmrError("INVALID_INPUT", "holdout benchmark requires a frozen protocol hash", {
      context: { reason: "missing-protocol-hash" },
    });
  }
  if (request.protocolSha256 !== undefined) {
    const protocolBytes = await readFile(resolve(dirname(manifestPath), "protocol.json")).catch((error: unknown) => {
      throw new PdfOmrError("INVALID_INPUT", "frozen benchmark protocol cannot be read", {
        context: { reason: "protocol-unreadable" },
        cause: error,
      });
    });
    const protocol = verifyFrozenProtocol(protocolBytes, {
      protocolSha256: request.protocolSha256,
      manifestSha256,
      engineId: request.engineId,
      preprocess: request.preprocess,
    });
    if (request.mode === "holdout") gateThresholds = protocol.gates;
  }
  const view = createCorpusView(
    manifest,
    request.mode === "holdout"
      ? {
          mode: "holdout",
          ...(request.protocolSha256 === undefined
            ? {}
            : { frozenEvaluation: { protocolSha256: request.protocolSha256 } }),
        }
      : { mode: "development" },
  );
  const corpusRoot = dirname(manifestPath);
  await verifyCorpusFiles(view.items, corpusRoot);
  throwIfBenchmarkAborted(request.signal);
  try {
    await mkdir(request.outputDirectory);
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "benchmark output directory already exists or cannot be created", {
      cause: error,
    });
  }
  const engineRegistry = dependencies.engineRegistry ?? createEngineRegistry();
  const runItem = dependencies.runItem ?? runBenchmarkItem;
  const repeatItemIds = new Set(manifest.execution?.repeatItemIds);
  const records: BenchmarkItemRecord[] = [];
  const budget =
    manifest.execution === undefined
      ? undefined
      : createBenchmarkBudget(
          request.signal,
          manifest.execution.maxTotalWallTimeMs,
          dependencies.scheduleBudgetExpiration,
        );
  const benchmarkSignal = budget?.signal ?? request.signal;
  let budgetExceeded = false;
  try {
    for (let itemIndex = 0; itemIndex < view.items.length; itemIndex += 1) {
      throwIfBenchmarkAborted(request.signal);
      if (budget?.hasExpired() === true) {
        await appendBudgetFailures(view.items.slice(itemIndex), request.outputDirectory, records);
        budgetExceeded = true;
        break;
      }
      const item = view.items[itemIndex]!;
      const itemOutputDirectory = join(request.outputDirectory, "items", item.id);
      await mkdir(itemOutputDirectory, { recursive: true });
      try {
        const groundTruth = await verifyGroundTruth(item, corpusRoot, itemOutputDirectory);
        const result = await runItem(item, {
          corpusRoot,
          itemOutputDirectory,
          engineId: request.engineId,
          preprocess: request.preprocess,
          repetitions: manifest.execution === undefined || repeatItemIds.has(item.id) ? 2 : 1,
          engineRegistry,
          groundTruth,
          ...(dependencies.readGpuMemoryBytes === undefined
            ? {}
            : { readGpuMemoryBytes: dependencies.readGpuMemoryBytes }),
          ...(dependencies.measureCancelLatency === undefined
            ? {}
            : { measureCancelLatency: dependencies.measureCancelLatency }),
          preserveFailureEvidence: request.mode === "development",
          ...(benchmarkSignal === undefined ? {} : { signal: benchmarkSignal }),
        });
        throwIfBenchmarkAborted(benchmarkSignal);
        const recordedResult: BenchmarkItemResult = {
          ...result,
          ...(item.benchmarkSuite === undefined ? {} : { benchmarkSuite: item.benchmarkSuite }),
        };
        records.push(recordedResult);
        await writeCanonicalNew("result.json", recordedResult, itemOutputDirectory);
      } catch (error) {
        if (request.signal?.aborted === true) {
          throw new PdfOmrError("INTERRUPTED", "benchmark interrupted", { cause: error });
        }
        if (budget?.hasExpired() === true) {
          await appendBudgetFailures(view.items.slice(itemIndex), request.outputDirectory, records);
          budgetExceeded = true;
          break;
        }
        const canonical =
          error instanceof PdfOmrError
            ? error
            : new PdfOmrError("ENGINE_EXECUTION_FAILED", "benchmark item failed", { cause: error });
        if (canonical.code === "INTERRUPTED") throw canonical;
        const failure: BenchmarkItemFailure = {
          schemaVersion: "1.0.0",
          itemId: item.id,
          category: item.category,
          ...(item.benchmarkSuite === undefined ? {} : { benchmarkSuite: item.benchmarkSuite }),
          status: "failed",
          error: canonical.toJSON(),
        };
        records.push(failure);
        await writeCanonicalNew("error.json", failure, itemOutputDirectory);
      }
    }
  } finally {
    budget?.dispose();
  }
  const metadata: BenchmarkMetadata = {
    corpusId: manifest.corpusId,
    protocolVersion: manifest.protocolVersion,
    manifestSha256,
    mode: request.mode,
    engineId: request.engineId,
    preprocess: request.preprocess,
    ...(request.protocolSha256 === undefined ? {} : { protocolSha256: request.protocolSha256 }),
    ...(manifest.execution === undefined
      ? {}
      : {
          execution: {
            profile: manifest.execution.profile,
            maxTotalWallTimeMs: manifest.execution.maxTotalWallTimeMs,
            repeatItemCount: manifest.execution.repeatItemIds.length,
          },
        }),
  };
  throwIfBenchmarkAborted(request.signal);
  const report = buildBenchmarkReport(
    metadata,
    records,
    gateThresholds,
    manifest.execution === undefined
      ? undefined
      : budgetExceeded
        ? { complete: false, reason: "total-wall-time-budget-exceeded" }
        : { complete: true },
  );
  const reportSha256 = await writeCanonicalNew("report.json", report, request.outputDirectory);
  if (budgetExceeded) {
    throw new PdfOmrError("BENCHMARK_RESOURCE_BUDGET_EXCEEDED", "benchmark total wall-time budget exceeded", {
      context: { reportSha256, maxTotalWallTimeMs: manifest.execution?.maxTotalWallTimeMs },
    });
  }
  return { report, reportSha256 };
}

type BenchmarkBudget = {
  signal: AbortSignal;
  hasExpired: () => boolean;
  dispose: () => void;
};

function createBenchmarkBudget(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
  schedule: RunBenchmarkDependencies["scheduleBudgetExpiration"] = scheduleBudgetExpiration,
): BenchmarkBudget {
  const controller = new AbortController();
  let expired = false;
  const expire = () => {
    expired = true;
    controller.abort();
  };
  const cancelExpiration = schedule(expire, timeoutMs);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
  return {
    signal: controller.signal,
    hasExpired: () => expired,
    dispose: () => {
      cancelExpiration();
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
}

function scheduleBudgetExpiration(expire: () => void, timeoutMs: number): () => void {
  const timeout = setTimeout(expire, timeoutMs);
  return () => clearTimeout(timeout);
}

async function appendBudgetFailures(
  items: readonly CorpusItem[],
  outputDirectory: string,
  records: BenchmarkItemRecord[],
): Promise<void> {
  for (const item of items) {
    const failure: BenchmarkItemFailure = {
      schemaVersion: "1.0.0",
      itemId: item.id,
      category: item.category,
      ...(item.benchmarkSuite === undefined ? {} : { benchmarkSuite: item.benchmarkSuite }),
      status: "failed",
      error: new PdfOmrError(
        "BENCHMARK_RESOURCE_BUDGET_EXCEEDED",
        "benchmark item was not completed within the total wall-time budget",
        { context: { reason: "total-wall-time-budget-exceeded" } },
      ).toJSON(),
    };
    records.push(failure);
    const itemOutputDirectory = join(outputDirectory, "items", item.id);
    await mkdir(itemOutputDirectory, { recursive: true });
    await writeCanonicalNew("error.json", failure, itemOutputDirectory);
  }
}

async function runBenchmarkItem(
  item: CorpusItem,
  context: {
    corpusRoot: string;
    itemOutputDirectory: string;
    engineId: string;
    preprocess: string;
    repetitions: number;
    engineRegistry: EngineRegistry;
    groundTruth: GroundTruthEvaluation;
    readGpuMemoryBytes?: () => number | undefined;
    measureCancelLatency?: (item: CorpusItem) => Promise<number | undefined>;
    preserveFailureEvidence: boolean;
    signal?: AbortSignal;
  },
): Promise<BenchmarkItemResult> {
  if (context.preprocess !== "none") {
    throw new PdfOmrError("INVALID_CLI_ARGUMENT", "unknown preprocessing variant", {
      context: { preprocess: context.preprocess },
    });
  }
  const started = performance.now();
  const stageWallTimeMs = Object.fromEntries(benchmarkStages.map((stage) => [stage, 0])) as Record<
    BenchmarkStage,
    number
  >;
  stageWallTimeMs.validate = context.groundTruth.validationDurationMs;
  let peakRssBytes = process.memoryUsage().rss;
  const measureStage = async <T>(stage: BenchmarkStage, operation: () => Promise<T>): Promise<T> => {
    const stageStarted = performance.now();
    try {
      return await operation();
    } finally {
      stageWallTimeMs[stage] += Math.max(0, performance.now() - stageStarted);
      peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
    }
  };
  const adapter = context.engineRegistry.get(context.engineId);
  const environment = await measureStage("inspect", () => adapter.inspectEnvironment(context.signal));
  const inputPath = resolve(context.corpusRoot, item.input.path);
  const expected = context.groundTruth.draft;
  const predictedDrafts = [];
  for (let repetition = 0; repetition < context.repetitions; repetition += 1) {
    const workDirectory = await mkdtemp(join(tmpdir(), "pdf-omr-benchmark-engine-"));
    try {
      const raw = await measureStage("recognize", () =>
        adapter.recognize({
          inputPath,
          outputDirectory: workDirectory,
          ...(item.inputScope === undefined ? {} : { inputScope: item.inputScope }),
          ...(item.staffLayout === undefined ? {} : { staffLayout: item.staffLayout }),
          ...(context.signal === undefined ? {} : { signal: context.signal }),
        }),
      );
      const normalized = await measureStage("normalize", async () => adapter.normalize(raw));
      const draft = omrScoreDraftSchema.parse({
        ...normalized,
        provenance: {
          engine: {
            id: environment.id,
            version: environment.version,
            ...(environment.modelSha256 === undefined ? {} : { modelSha256: environment.modelSha256 }),
          },
          inputSha256: item.input.sha256,
        },
      });
      predictedDrafts.push(draft);
      if (repetition === 0) {
        for (const artifact of raw.nativeArtifacts) {
          await writeBytesNew(`engine/${artifact.relativePath}`, artifact.bytes, context.itemOutputDirectory);
        }
        // Keep the adapter's canonical normalization payload next to native artifacts.
        // For Rokot this is the ordered system bundle; retaining it makes cross-system
        // joining, measure identities, and source boundaries independently auditable.
        await writeBytesNew("engine/normalization-output.bin", raw.normalizationBytes, context.itemOutputDirectory);
        if (context.engineId === "rokot") {
          await writeCanonicalNew(
            "joining.json",
            buildRokotJoiningEvidence(parseRokotSystemBundle(raw.normalizationBytes), draft),
            context.itemOutputDirectory,
          );
        }
        await writeCanonicalNew("engine/environment.json", environment, context.itemOutputDirectory);
        await writeCanonicalNew("predicted-draft.json", draft, context.itemOutputDirectory);
        await writeCanonicalNew("ground-truth-draft.json", expected, context.itemOutputDirectory);
      }
    } catch (error) {
      if (context.preserveFailureEvidence) {
        await preserveFailureEvidence(workDirectory, context.itemOutputDirectory);
      }
      throw error;
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
  }
  const validationReports = predictedDrafts.map((draft) => {
    const validationStarted = performance.now();
    const validation = validateDraft(draft);
    stageWallTimeMs.validate += Math.max(0, performance.now() - validationStarted);
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
    return validation;
  });
  await writeCanonicalNew("predicted-validation.json", validationReports[0]!, context.itemOutputDirectory);
  const alignedDrafts = predictedDrafts.map((draft) => alignDraftParts(draft, expected));
  const predicted = predictedDrafts[0]!;
  const alignedPredicted = alignedDrafts[0]!.draft;
  await writeCanonicalNew("part-identity.json", { mapping: alignedDrafts[0]!.mapping }, context.itemOutputDirectory);
  const hashes = predictedDrafts.map((draft, index) => ({
    runId: `${item.id}-${index + 1}`,
    draftSha256: sha256Bytes(new TextEncoder().encode(canonicalJson(draft))),
  }));
  let generation = false;
  let parse = false;
  let view = false;
  let playback = false;
  let structural = false;
  try {
    const exported = await measureStage("export", async () => {
      const generated = generateMusicXml(predicted, { container: "mxl" });
      const roundTrip = await compareDraftMusicXml(predicted, generated);
      return { generated, roundTrip };
    });
    const { generated, roundTrip } = exported;
    generation = true;
    ({ parse, view, playback, structural } = roundTrip);
    await writeBytesNew("generated.mxl", generated, context.itemOutputDirectory);
    await writeCanonicalNew("round-trip.json", roundTrip, context.itemOutputDirectory);
  } catch {
    // Capability failures remain metrics; engine and normalization failures are handled by the outer item boundary.
  }
  const cancelLatencyMs = await context.measureCancelLatency?.(item);
  const gpuMemoryBytes = context.readGpuMemoryBytes?.();
  return {
    schemaVersion: "1.0.0",
    itemId: item.id,
    category: item.category,
    status: "succeeded",
    symbolic: computeSymbolicMetrics(alignedPredicted, expected),
    harmony: analyzeHarmonyImpactDrafts(expected, alignedPredicted, {
      decisionThreshold: 0.6,
      confidenceThreshold: 0.8,
    }).metrics,
    runtime: {
      generation,
      parse,
      view,
      playback,
      structural,
      wallTimeMs: performance.now() - started,
      peakRssBytes,
      stageWallTimeMs,
      ...(gpuMemoryBytes === undefined ? {} : { gpuMemoryBytes }),
      ...(cancelLatencyMs === undefined ? {} : { cancelLatencyMs }),
    },
    reproducibility: calculateReproducibilityMetrics(hashes),
  };
}

async function preserveFailureEvidence(workDirectory: string, itemOutputDirectory: string): Promise<void> {
  const sourceDirectory = join(workDirectory, "failure-debug");
  const entries = await readdir(sourceDirectory, { withFileTypes: true }).catch(() => []);
  let totalBytes = 0;
  for (const entry of entries
    .filter((candidate) => candidate.isFile())
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, 16)) {
    const bytes = await readFile(join(sourceDirectory, entry.name));
    if (bytes.byteLength > 1024 * 1024 || totalBytes + bytes.byteLength > 2 * 1024 * 1024) continue;
    totalBytes += bytes.byteLength;
    await writeBytesNew(`failure-debug/${entry.name}`, bytes, itemOutputDirectory);
  }
}

async function verifyGroundTruth(
  item: CorpusItem,
  corpusRoot: string,
  itemOutputDirectory: string,
): Promise<GroundTruthEvaluation> {
  const started = performance.now();
  const expectedBytes = await readFile(resolve(corpusRoot, item.groundTruth.path));
  const expected = normalizeAudiverisMusicXml(expectedBytes);
  const validation = validateDraft(expected);
  await writeCanonicalNew("ground-truth-validation.json", validation, itemOutputDirectory);
  if (validation.readiness.harmony === "blocked" || validation.readiness.musicXml === "blocked") {
    await writeCanonicalNew(
      "evaluation-limitation.json",
      {
        schemaVersion: "1.0.0",
        reason: "ground-truth-readiness-blocked",
        readiness: validation.readiness,
        diagnostics: validation.diagnostics.map(({ code, severity }) => ({ code, severity })),
      },
      itemOutputDirectory,
    );
    throw new PdfOmrError("BENCHMARK_EVALUATION_LIMITATION", "ground truth is not evaluation-ready", {
      context: {
        reason: "ground-truth-readiness-blocked",
        readiness: validation.readiness,
        diagnosticCodes: validation.diagnostics.map((diagnostic) => diagnostic.code),
      },
    });
  }
  return { draft: expected, validationDurationMs: Math.max(0, performance.now() - started) };
}

type GroundTruthEvaluation = {
  draft: ReturnType<typeof normalizeAudiverisMusicXml>;
  validationDurationMs: number;
};

function throwIfBenchmarkAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new PdfOmrError("INTERRUPTED", "benchmark interrupted");
}

async function verifyCorpusFiles(items: readonly CorpusItem[], corpusRoot: string): Promise<void> {
  for (const item of items) {
    const [inputBytes, groundTruthBytes] = await Promise.all([
      readFile(resolve(corpusRoot, item.input.path)),
      readFile(resolve(corpusRoot, item.groundTruth.path)),
    ]);
    if (sha256Bytes(inputBytes) !== item.input.sha256 || sha256Bytes(groundTruthBytes) !== item.groundTruth.sha256) {
      throw new PdfOmrError("INVALID_INPUT", "corpus artifact hash mismatch", {
        context: { reason: "corpus-hash-mismatch", itemId: item.id },
      });
    }
  }
}
