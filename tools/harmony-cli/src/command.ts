import { resolve } from "node:path";
import { evaluateHarmonyManifest } from "./evaluateManifest";
import { inspectHarmonyScore, type InspectView } from "./inspectScore";
import { evaluatePaperSemiCrfFile, trainPaperSemiCrfFile } from "./paperSemiCrfFiles";
import { exportPaperSemiCrfAuthorRecordsFile } from "./paperSemiCrfAuthorRecords";
import { importPaperSemiCrfAuthorModelFile } from "./paperSemiCrfAuthorModel";
import { exportPaperSemiCrfDcmlRecordsFile } from "./paperSemiCrfDcmlFiles";
import type { DatasetSplit } from "./evaluationProtocol";
import {
  harmonyInspectReportSchema,
  type HarmonyDatasetEvalReport,
  type HarmonyEvalReport,
  type HarmonyInspectReport,
} from "./schemas";

type HarmonyCommandReport =
  | HarmonyInspectReport
  | HarmonyEvalReport
  | HarmonyDatasetEvalReport
  | Awaited<ReturnType<typeof trainPaperSemiCrfFile>>
  | Awaited<ReturnType<typeof evaluatePaperSemiCrfFile>>
  | Awaited<ReturnType<typeof exportPaperSemiCrfAuthorRecordsFile>>
  | Awaited<ReturnType<typeof importPaperSemiCrfAuthorModelFile>>
  | Awaited<ReturnType<typeof exportPaperSemiCrfDcmlRecordsFile>>;

export async function runHarmonyCommand(args: string[], context: { cwd?: string } = {}): Promise<HarmonyCommandReport> {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  const cwd = context.cwd ?? process.env.INIT_CWD ?? process.cwd();
  if (normalized[0] === "paper-semi-crf-import-author-model") {
    const input = normalized[1];
    const output = optionValue(normalized, "--output");
    if (!input || !output) {
      throw new Error("usage: harmony:cli paper-semi-crf-import-author-model <author-model.txt> --output <model.json>");
    }
    return importPaperSemiCrfAuthorModelFile({
      inputPath: resolve(cwd, input),
      outputPath: resolve(cwd, output),
    });
  }
  if (normalized[0] === "paper-semi-crf-records") {
    const split = normalized[1];
    const labels = optionValue(normalized, "--labels");
    const role = optionValue(normalized, "--role");
    const output = optionValue(normalized, "--output");
    const labelOrderRecords = optionValue(normalized, "--label-order-records");
    const maxSegmentLength = numberOption(normalized, "--max-segment-length", 20);
    if (!split || !labels || !role || !output) {
      throw new Error(
        "usage: harmony:cli paper-semi-crf-records <split.txt> --labels <labels.txt> --role <train|tune|final> --output <records.json> [--label-order-records <train-records.json>] [--max-segment-length <n>]",
      );
    }
    if (role !== "train" && role !== "tune" && role !== "final") {
      throw new Error("--role must be train, tune, or final");
    }
    if (!Number.isSafeInteger(maxSegmentLength) || maxSegmentLength < 1) {
      throw new Error("--max-segment-length must be a positive integer");
    }
    return exportPaperSemiCrfAuthorRecordsFile({
      splitPath: resolve(cwd, split),
      labelsPath: resolve(cwd, labels),
      role,
      outputPath: resolve(cwd, output),
      maxSegmentLength,
      ...(labelOrderRecords === undefined ? {} : { labelOrderRecordsPath: resolve(cwd, labelOrderRecords) }),
    });
  }
  if (normalized[0] === "paper-semi-crf-dcml-records") {
    const manifest = normalized[1];
    const protocol = optionValue(normalized, "--protocol");
    const dataRoot = optionValue(normalized, "--data-root");
    const caseId = optionValue(normalized, "--case");
    const split = optionValue(normalized, "--split");
    const output = optionValue(normalized, "--output");
    const report = optionValue(normalized, "--report");
    const labelOrderRecords = optionValue(normalized, "--label-order-records");
    const maxSegmentLength = numberOption(normalized, "--max-segment-length", 20);
    if (!manifest || !protocol || !dataRoot || !caseId || !split || !output || !report) {
      throw new Error(
        "usage: harmony:cli paper-semi-crf-dcml-records <manifest.json> --protocol <protocol.json> --data-root <directory> --case <id> --split <train|tune> --output <records.json> --report <report.json> [--label-order-records <train-records.json>] [--max-segment-length <n>]",
      );
    }
    if (split !== "train" && split !== "tune") {
      throw new Error("paper Semi-CRF DCML records --split must be train or tune");
    }
    if (!Number.isSafeInteger(maxSegmentLength) || maxSegmentLength < 1) {
      throw new Error("--max-segment-length must be a positive integer");
    }
    return exportPaperSemiCrfDcmlRecordsFile({
      manifestPath: resolve(cwd, manifest),
      protocolPath: resolve(cwd, protocol),
      dataRoot: resolve(cwd, dataRoot),
      caseId,
      split,
      outputPath: resolve(cwd, output),
      reportPath: resolve(cwd, report),
      maxSegmentLength,
      ...(labelOrderRecords === undefined ? {} : { labelOrderRecordsPath: resolve(cwd, labelOrderRecords) }),
    });
  }
  if (normalized[0] === "paper-semi-crf-train") {
    const records = normalized[1];
    const output = optionValue(normalized, "--output");
    const checkpoint = optionValue(normalized, "--checkpoint");
    const report = optionValue(normalized, "--report");
    const resume = optionValue(normalized, "--resume");
    const featureCounts = optionValue(normalized, "--feature-counts");
    const maxIterations = numberOption(normalized, "--max-iterations", 100);
    const minFeatureCount = numberOption(normalized, "--min-feature-count", 4);
    const l2 = numberOption(normalized, "--l2", 1);
    const gradientTolerance = optionalNumberOption(normalized, "--gradient-tolerance");
    if (!records || !output || !checkpoint || !report) {
      throw new Error(
        "usage: harmony:cli paper-semi-crf-train <records.json> --output <model.json> --checkpoint <checkpoint.json> --report <report.json> [--resume <checkpoint.json>] [--feature-counts <author-feature-count.txt>] [--max-iterations <n>] [--min-feature-count <n>] [--l2 <n>] [--gradient-tolerance <n>]",
      );
    }
    if (!Number.isSafeInteger(maxIterations) || maxIterations < 0) {
      throw new Error("--max-iterations must be a nonnegative integer");
    }
    if (!Number.isSafeInteger(minFeatureCount) || minFeatureCount < 0) {
      throw new Error("--min-feature-count must be a nonnegative integer");
    }
    if (!Number.isFinite(l2) || l2 < 0) throw new Error("--l2 must be nonnegative");
    if (gradientTolerance !== undefined && (!Number.isFinite(gradientTolerance) || gradientTolerance < 0)) {
      throw new Error("--gradient-tolerance must be nonnegative");
    }
    return trainPaperSemiCrfFile({
      recordsPath: resolve(cwd, records),
      outputPath: resolve(cwd, output),
      checkpointPath: resolve(cwd, checkpoint),
      reportPath: resolve(cwd, report),
      maxIterations,
      minFeatureCount,
      l2,
      ...(gradientTolerance === undefined ? {} : { gradientTolerance }),
      ...(resume === undefined ? {} : { resumePath: resolve(cwd, resume) }),
      ...(featureCounts === undefined ? {} : { featureCountsPath: resolve(cwd, featureCounts) }),
    });
  }
  if (normalized[0] === "paper-semi-crf-eval") {
    const records = normalized[1];
    const model = optionValue(normalized, "--model");
    const output = optionValue(normalized, "--output");
    if (!records || !model || !output) {
      throw new Error(
        "usage: harmony:cli paper-semi-crf-eval <records.json> --model <model.json> --output <report.json> [--allow-final]",
      );
    }
    return evaluatePaperSemiCrfFile({
      recordsPath: resolve(cwd, records),
      modelPath: resolve(cwd, model),
      outputPath: resolve(cwd, output),
      ...(normalized.includes("--allow-final") ? { allowFinal: true } : {}),
    });
  }
  if (normalized[0] === "eval") {
    const path = normalized[1] ?? "test-fixtures/harmony/regressions/manifest.json";
    const dataRoot = optionValue(normalized, "--data-root");
    const caseId = optionValue(normalized, "--case");
    const reportSplit = optionValue(normalized, "--split");
    const rawDecisionThreshold = optionValue(normalized, "--decision-threshold");
    const decisionThreshold = rawDecisionThreshold === undefined ? undefined : Number(rawDecisionThreshold);
    if (
      normalized.includes("--split") &&
      (reportSplit === undefined || !["train", "tune", "eval"].includes(reportSplit))
    )
      throw new Error("--split must be train, tune, or eval");
    if (
      normalized.includes("--decision-threshold") &&
      (decisionThreshold === undefined ||
        !Number.isFinite(decisionThreshold) ||
        decisionThreshold < 0 ||
        decisionThreshold > 1)
    ) {
      throw new Error("--decision-threshold must be between 0 and 1");
    }
    return evaluateHarmonyManifest(resolve(cwd, path), {
      ...(dataRoot === undefined ? {} : { dataRoot: resolve(cwd, dataRoot) }),
      ...(caseId === undefined ? {} : { caseId }),
      ...(reportSplit === undefined ? {} : { reportSplit: reportSplit as DatasetSplit }),
      ...(decisionThreshold === undefined ? {} : { decisionThreshold }),
    });
  }
  const positional = normalized[0] === "inspect" ? normalized.slice(1) : normalized;
  const path = positional[0];
  const viewIndex = positional.indexOf("--view");
  const view = (viewIndex < 0 ? "all" : positional[viewIndex + 1]) as InspectView | undefined;
  if (!path || !view || !["all", "model", "result"].includes(view)) {
    throw new Error("usage: harmony:cli inspect <score.musicxml|score.mxl> [--view all|model|result]");
  }
  const inspected = await inspectHarmonyScore(resolve(cwd, path), view);
  return harmonyInspectReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "inspect",
    source: inspected.source,
    ...(view === "result" ? {} : { model: inspected.model }),
    ...(view === "model" ? {} : { result: inspected.result }),
  });
}

function optionValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function numberOption(args: readonly string[], name: string, fallback: number): number {
  const value = optionValue(args, name);
  return value === undefined && !args.includes(name) ? fallback : Number(value);
}

function optionalNumberOption(args: readonly string[], name: string): number | undefined {
  const value = optionValue(args, name);
  return value === undefined && !args.includes(name) ? undefined : Number(value);
}
