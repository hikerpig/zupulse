import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { musicXmlReadyDraft } from "./fixtures/musicxml-ready-draft";
import { benchmarkCommand } from "../commands/benchmark";
import { PdfOmrError } from "../errors";
import { buildBenchmarkReport, readBenchmarkItemResults } from "../benchmark/report";
import { runBenchmark, type BenchmarkItemResult } from "../benchmark/run-benchmark";
import { sha256Bytes } from "../canonical-json";
import { computeSymbolicMetrics } from "../benchmark/symbolic-metrics";

describe("benchmark orchestrator", () => {
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

async function corpusSetup(split: "development" | "holdout", count: number) {
  const directory = await mkdtemp(join(tmpdir(), "pdf-omr-benchmark-"));
  const inputBytes = new TextEncoder().encode("pdf");
  const groundTruthBytes = new TextEncoder().encode("musicxml");
  await writeFile(join(directory, "input.pdf"), inputBytes);
  await writeFile(join(directory, "truth.mxl"), groundTruthBytes);
  const manifest = {
    schemaVersion: "1.0.0",
    corpusId: "smoke",
    protocolVersion: "1.0.0",
    items: Array.from({ length: count }, (_, index) => ({
      id: `item-${index + 1}`,
      workId: `work-${index + 1}`,
      variantId: "render",
      split,
      category: index === 0 ? "digital-vector" : "degraded-scan",
      input: { path: "input.pdf", sha256: sha256Bytes(inputBytes) },
      groundTruth: { path: "truth.mxl", sha256: sha256Bytes(groundTruthBytes), format: "mxl" },
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
      gates: {
        jointF1: 0.9,
        validMeasureRate: 0.95,
        parseRate: 0.95,
        structuralAgreementRate: 0.9,
        harmonyPrecisionDelta: -0.05,
        falseConfidentChordRate: 0.03,
        reproducibilityAgreementRate: 1,
        cancelLatencyP95Ms: 2000,
      },
    }),
  );
  await writeFile(join(directory, "protocol.json"), protocolBytes);
  return {
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
