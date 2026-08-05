import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
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
import { verifyFrozenProtocol } from "./verify-protocol";

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
  runItem?: (
    item: CorpusItem,
    context: {
      corpusRoot: string;
      itemOutputDirectory: string;
      engineId: string;
      preprocess: string;
      engineRegistry: EngineRegistry;
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
  if (request.mode === "holdout") {
    if (request.protocolSha256 === undefined) {
      throw new PdfOmrError("INVALID_INPUT", "holdout benchmark requires a frozen protocol hash", {
        context: { reason: "missing-protocol-hash" },
      });
    }
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
    gateThresholds = protocol.gates;
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
  const records: BenchmarkItemRecord[] = [];
  for (const item of view.items) {
    throwIfBenchmarkAborted(request.signal);
    const itemOutputDirectory = join(request.outputDirectory, "items", item.id);
    await mkdir(itemOutputDirectory, { recursive: true });
    try {
      const result = await runItem(item, {
        corpusRoot,
        itemOutputDirectory,
        engineId: request.engineId,
        preprocess: request.preprocess,
        engineRegistry,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
      throwIfBenchmarkAborted(request.signal);
      records.push(result);
      await writeCanonicalNew("result.json", result, itemOutputDirectory);
    } catch (error) {
      const canonical =
        error instanceof PdfOmrError
          ? error
          : new PdfOmrError("ENGINE_EXECUTION_FAILED", "benchmark item failed", { cause: error });
      if (request.signal?.aborted === true) {
        throw new PdfOmrError("INTERRUPTED", "benchmark interrupted", { cause: error });
      }
      if (canonical.code === "INTERRUPTED") throw canonical;
      const failure: BenchmarkItemFailure = {
        schemaVersion: "1.0.0",
        itemId: item.id,
        category: item.category,
        status: "failed",
        error: canonical.toJSON(),
      };
      records.push(failure);
      await writeCanonicalNew("error.json", failure, itemOutputDirectory);
    }
  }
  const metadata: BenchmarkMetadata = {
    corpusId: manifest.corpusId,
    protocolVersion: manifest.protocolVersion,
    manifestSha256,
    mode: request.mode,
    engineId: request.engineId,
    preprocess: request.preprocess,
    ...(request.protocolSha256 === undefined ? {} : { protocolSha256: request.protocolSha256 }),
  };
  throwIfBenchmarkAborted(request.signal);
  const report = buildBenchmarkReport(metadata, records, gateThresholds);
  const reportSha256 = await writeCanonicalNew("report.json", report, request.outputDirectory);
  return { report, reportSha256 };
}

async function runBenchmarkItem(
  item: CorpusItem,
  context: {
    corpusRoot: string;
    itemOutputDirectory: string;
    engineId: string;
    preprocess: string;
    engineRegistry: EngineRegistry;
    signal?: AbortSignal;
  },
): Promise<BenchmarkItemResult> {
  if (context.preprocess !== "none") {
    throw new PdfOmrError("INVALID_CLI_ARGUMENT", "unknown preprocessing variant", {
      context: { preprocess: context.preprocess },
    });
  }
  const started = performance.now();
  const adapter = context.engineRegistry.get(context.engineId);
  const environment = await adapter.inspectEnvironment(context.signal);
  const inputPath = resolve(context.corpusRoot, item.input.path);
  const expectedBytes = await readFile(resolve(context.corpusRoot, item.groundTruth.path));
  const expected = normalizeAudiverisMusicXml(expectedBytes);
  const predictedDrafts = [];
  for (let repetition = 0; repetition < 2; repetition += 1) {
    const workDirectory = await mkdtemp(join(tmpdir(), "pdf-omr-benchmark-engine-"));
    try {
      const raw = await adapter.recognize({
        inputPath,
        outputDirectory: workDirectory,
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      });
      const normalized = adapter.normalize(raw);
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
        await writeCanonicalNew("engine/environment.json", environment, context.itemOutputDirectory);
        await writeCanonicalNew("predicted-draft.json", draft, context.itemOutputDirectory);
        await writeCanonicalNew("ground-truth-draft.json", expected, context.itemOutputDirectory);
      }
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
  }
  const predicted = predictedDrafts[0]!;
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
    const generated = generateMusicXml(predicted, { container: "mxl" });
    generation = true;
    const roundTrip = await compareDraftMusicXml(predicted, generated);
    ({ parse, view, playback, structural } = roundTrip);
    await writeBytesNew("generated.mxl", generated, context.itemOutputDirectory);
    await writeCanonicalNew("round-trip.json", roundTrip, context.itemOutputDirectory);
  } catch {
    // Capability failures remain metrics; engine and normalization failures are handled by the outer item boundary.
  }
  return {
    schemaVersion: "1.0.0",
    itemId: item.id,
    category: item.category,
    status: "succeeded",
    symbolic: computeSymbolicMetrics(predicted, expected),
    harmony: analyzeHarmonyImpactDrafts(expected, predicted, {
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
      peakRssBytes: process.memoryUsage().rss,
    },
    reproducibility: calculateReproducibilityMetrics(hashes),
  };
}

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
