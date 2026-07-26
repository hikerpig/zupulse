import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import {
  harmonyBoundaryClassifierModelSchema,
  harmonyStructuredLinearModelSchema,
  type HarmonyBoundaryPolicy,
} from "@zupulse/web-core";
import { createHash } from "node:crypto";
import { compareBaselineFiles } from "./compareBaselineFiles";
import { buildHarmonyCalibrationAssetFile, type HarmonyCalibrationAsset } from "./confidenceCalibration";
import { evaluateHarmonyManifest } from "./evaluateManifest";
import { evaluateHarmonyV3FinalHoldoutFile } from "./evaluateV3FinalHoldout";
import { exportHarmonyRankingRecordsFile } from "./exportRankingRecords";
import { exportHarmonyBoundaryRecordsFile } from "./exportBoundaryRecords";
import { exportHarmonyStructuredOracleFile } from "./exportStructuredOracle";
import { exportHarmonyStructuredRecordsFile } from "./exportStructuredRecords";
import { inspectHarmonyScore, type InspectView } from "./inspectScore";
import { trainHarmonyStructuredModelFile } from "./trainStructuredModel";
import { evaluatePaperSemiCrfFile, trainPaperSemiCrfFile } from "./paperSemiCrfFiles";
import type { DatasetSplit } from "./evaluationProtocol";
import {
  harmonyInspectReportSchema,
  type HarmonyDatasetEvalReport,
  type HarmonyBaselineComparisonReport,
  type HarmonyEvalReport,
  type HarmonyInspectReport,
} from "./schemas";

export async function runHarmonyCommand(
  args: string[],
  context: { cwd?: string } = {},
): Promise<
  | HarmonyInspectReport
  | HarmonyEvalReport
  | HarmonyDatasetEvalReport
  | HarmonyBaselineComparisonReport
  | HarmonyCalibrationAsset
  | Awaited<ReturnType<typeof exportHarmonyRankingRecordsFile>>
  | Awaited<ReturnType<typeof exportHarmonyBoundaryRecordsFile>>
  | Awaited<ReturnType<typeof exportHarmonyStructuredOracleFile>>
  | Awaited<ReturnType<typeof exportHarmonyStructuredRecordsFile>>
  | Awaited<ReturnType<typeof evaluateHarmonyV3FinalHoldoutFile>>
  | Awaited<ReturnType<typeof trainHarmonyStructuredModelFile>>
  | Awaited<ReturnType<typeof trainPaperSemiCrfFile>>
  | Awaited<ReturnType<typeof evaluatePaperSemiCrfFile>>
> {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  const cwd = context.cwd ?? process.env.INIT_CWD ?? process.cwd();
  if (normalized[0] === "paper-semi-crf-train") {
    const records = normalized[1];
    const output = optionValue(normalized, "--output");
    const checkpoint = optionValue(normalized, "--checkpoint");
    const report = optionValue(normalized, "--report");
    const resume = optionValue(normalized, "--resume");
    const maxIterations = numberOption(normalized, "--max-iterations", 100);
    const minFeatureCount = numberOption(normalized, "--min-feature-count", 4);
    const l2 = numberOption(normalized, "--l2", 1);
    const gradientTolerance = optionalNumberOption(normalized, "--gradient-tolerance");
    if (!records || !output || !checkpoint || !report) {
      throw new Error(
        "usage: harmony:cli paper-semi-crf-train <records.json> --output <model.json> --checkpoint <checkpoint.json> --report <report.json> [--resume <checkpoint.json>] [--max-iterations <n>] [--min-feature-count <n>] [--l2 <n>] [--gradient-tolerance <n>]",
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
  if (normalized[0] === "train-structured") {
    const records = normalized[1];
    const outputIndex = normalized.indexOf("--output");
    const reportIndex = normalized.indexOf("--report");
    const epochsIndex = normalized.indexOf("--epochs");
    const learningRateIndex = normalized.indexOf("--learning-rate");
    const output = outputIndex < 0 ? undefined : normalized[outputIndex + 1];
    const report = reportIndex < 0 ? undefined : normalized[reportIndex + 1];
    const epochs = epochsIndex < 0 ? 3 : Number(normalized[epochsIndex + 1]);
    const learningRate = learningRateIndex < 0 ? 0.1 : Number(normalized[learningRateIndex + 1]);
    if (!records || !output)
      throw new Error(
        "usage: harmony:cli train-structured <records.json> --output <model.json> [--report <report.json>] [--epochs <n>] [--learning-rate <n>]",
      );
    if (!Number.isInteger(epochs) || epochs < 0) throw new Error("--epochs must be a nonnegative integer");
    if (!Number.isFinite(learningRate) || learningRate < 0) throw new Error("--learning-rate must be nonnegative");
    return trainHarmonyStructuredModelFile({
      recordsPath: resolve(cwd, records),
      outputPath: resolve(cwd, output),
      ...(report === undefined ? {} : { reportPath: resolve(cwd, report) }),
      epochs,
      learningRate,
    });
  }
  if (normalized[0] === "structured-records") {
    const manifest = normalized[1];
    const protocolIndex = normalized.indexOf("--protocol");
    const dataRootIndex = normalized.indexOf("--data-root");
    const caseIndex = normalized.indexOf("--case");
    const outputIndex = normalized.indexOf("--output");
    const splitIndex = normalized.indexOf("--split");
    const maxGroupsIndex = normalized.indexOf("--max-groups");
    const protocol = protocolIndex < 0 ? undefined : normalized[protocolIndex + 1];
    const dataRoot = dataRootIndex < 0 ? undefined : normalized[dataRootIndex + 1];
    const caseId = caseIndex < 0 ? undefined : normalized[caseIndex + 1];
    const output = outputIndex < 0 ? undefined : normalized[outputIndex + 1];
    const split = splitIndex < 0 ? "train" : normalized[splitIndex + 1];
    const maxGroups = maxGroupsIndex < 0 ? undefined : Number(normalized[maxGroupsIndex + 1]);
    if (!manifest || !protocol || !dataRoot || !caseId || !output)
      throw new Error(
        "usage: harmony:cli structured-records <manifest.json> --protocol <protocol.json> --data-root <directory> --case <id> --output <records.json> [--split train|tune] [--max-groups <n>]",
      );
    if (split !== "train" && split !== "tune") throw new Error("structured records --split must be train or tune");
    if (maxGroups !== undefined && (!Number.isInteger(maxGroups) || maxGroups < 1))
      throw new Error("--max-groups must be a positive integer");
    return exportHarmonyStructuredRecordsFile({
      manifestPath: resolve(cwd, manifest),
      protocolPath: resolve(cwd, protocol),
      dataRoot: resolve(cwd, dataRoot),
      caseId,
      outputPath: resolve(cwd, output),
      split,
      ...(maxGroups === undefined ? {} : { maxGroups }),
    });
  }
  if (normalized[0] === "eval-v3-final") {
    const manifest = normalized[1];
    const protocolIndex = normalized.indexOf("--protocol");
    const dataRootIndex = normalized.indexOf("--data-root");
    const outputIndex = normalized.indexOf("--output");
    const protocol = protocolIndex < 0 ? undefined : normalized[protocolIndex + 1];
    const dataRoot = dataRootIndex < 0 ? undefined : normalized[dataRootIndex + 1];
    const output = outputIndex < 0 ? undefined : normalized[outputIndex + 1];
    if (!manifest || !protocol || !dataRoot || !output)
      throw new Error(
        "usage: harmony:cli eval-v3-final <manifest.json> --protocol <protocol.json> --data-root <directory> --output <report.json>",
      );
    return evaluateHarmonyV3FinalHoldoutFile(
      resolve(cwd, manifest),
      resolve(cwd, protocol),
      resolve(cwd, dataRoot),
      resolve(cwd, output),
    );
  }
  if (normalized[0] === "ranking-records") {
    const manifest = normalized[1];
    const protocolIndex = normalized.indexOf("--protocol");
    const dataRootIndex = normalized.indexOf("--data-root");
    const caseIndex = normalized.indexOf("--case");
    const outputIndex = normalized.indexOf("--output");
    const maxGroupsIndex = normalized.indexOf("--max-train-groups");
    const splitIndex = normalized.indexOf("--split");
    const protocol = protocolIndex < 0 ? undefined : normalized[protocolIndex + 1];
    const dataRoot = dataRootIndex < 0 ? undefined : normalized[dataRootIndex + 1];
    const caseId = caseIndex < 0 ? undefined : normalized[caseIndex + 1];
    const output = outputIndex < 0 ? undefined : normalized[outputIndex + 1];
    const maxTrainGroups = maxGroupsIndex < 0 ? undefined : Number(normalized[maxGroupsIndex + 1]);
    const split = splitIndex < 0 ? "train" : normalized[splitIndex + 1];
    if (!manifest || !protocol || !dataRoot || !caseId || !output)
      throw new Error(
        "usage: harmony:cli ranking-records <manifest.json> --protocol <protocol.json> --data-root <directory> --case <id> --output <records.json> [--max-train-groups <n>]",
      );
    if (maxGroupsIndex >= 0 && (!Number.isInteger(maxTrainGroups) || maxTrainGroups! < 1))
      throw new Error("--max-train-groups must be a positive integer");
    if (split !== "train" && split !== "tune") throw new Error("ranking records --split must be train or tune");
    return exportHarmonyRankingRecordsFile({
      manifestPath: resolve(cwd, manifest),
      protocolPath: resolve(cwd, protocol),
      dataRoot: resolve(cwd, dataRoot),
      caseId,
      outputPath: resolve(cwd, output),
      ...(maxTrainGroups === undefined ? {} : { maxTrainGroups }),
      split,
    });
  }
  if (normalized[0] === "structured-oracle") {
    const manifest = normalized[1];
    const protocolIndex = normalized.indexOf("--protocol");
    const dataRootIndex = normalized.indexOf("--data-root");
    const caseIndex = normalized.indexOf("--case");
    const outputIndex = normalized.indexOf("--output");
    const splitIndex = normalized.indexOf("--split");
    const maxSpanIndex = normalized.indexOf("--max-span");
    const maxQuarterNotesIndex = normalized.indexOf("--max-quarter-notes");
    const topKIndex = normalized.indexOf("--top-k");
    const protocol = protocolIndex < 0 ? undefined : normalized[protocolIndex + 1];
    const dataRoot = dataRootIndex < 0 ? undefined : normalized[dataRootIndex + 1];
    const caseId = caseIndex < 0 ? undefined : normalized[caseIndex + 1];
    const output = outputIndex < 0 ? undefined : normalized[outputIndex + 1];
    const split = splitIndex < 0 ? "train" : normalized[splitIndex + 1];
    const maxSpan =
      maxSpanIndex < 0 && maxQuarterNotesIndex >= 0
        ? undefined
        : maxSpanIndex < 0
          ? 16
          : Number(normalized[maxSpanIndex + 1]);
    const maxQuarterNotes = maxQuarterNotesIndex < 0 ? undefined : Number(normalized[maxQuarterNotesIndex + 1]);
    const topK = topKIndex < 0 ? 8 : Number(normalized[topKIndex + 1]);
    if (!manifest || !protocol || !dataRoot || !caseId || !output)
      throw new Error(
        "usage: harmony:cli structured-oracle <manifest.json> --protocol <protocol.json> --data-root <directory> --case <id> --output <report.json> [--split train|tune] [--max-span <n>|--max-quarter-notes <n>] [--top-k <1..8>]",
      );
    if (split !== "train" && split !== "tune") throw new Error("structured oracle --split must be train or tune");
    if (maxSpanIndex >= 0 && maxQuarterNotesIndex >= 0)
      throw new Error("--max-span and --max-quarter-notes are mutually exclusive");
    if (maxSpan !== undefined && (!Number.isInteger(maxSpan) || maxSpan < 1))
      throw new Error("--max-span must be a positive integer");
    if (maxQuarterNotes !== undefined && (!Number.isFinite(maxQuarterNotes) || maxQuarterNotes <= 0))
      throw new Error("--max-quarter-notes must be positive");
    if (!Number.isInteger(topK) || topK < 1 || topK > 8) throw new Error("--top-k must be an integer from 1 to 8");
    return exportHarmonyStructuredOracleFile({
      manifestPath: resolve(cwd, manifest),
      protocolPath: resolve(cwd, protocol),
      dataRoot: resolve(cwd, dataRoot),
      caseId,
      outputPath: resolve(cwd, output),
      split,
      ...(maxSpan === undefined ? {} : { maxSpan }),
      ...(maxQuarterNotes === undefined ? {} : { maxQuarterNotes }),
      topK,
    });
  }
  if (normalized[0] === "boundary-records") {
    const manifest = normalized[1];
    const protocolIndex = normalized.indexOf("--protocol");
    const dataRootIndex = normalized.indexOf("--data-root");
    const caseIndex = normalized.indexOf("--case");
    const outputIndex = normalized.indexOf("--output");
    const maxGroupsIndex = normalized.indexOf("--max-train-groups");
    const splitIndex = normalized.indexOf("--split");
    const protocol = protocolIndex < 0 ? undefined : normalized[protocolIndex + 1];
    const dataRoot = dataRootIndex < 0 ? undefined : normalized[dataRootIndex + 1];
    const caseId = caseIndex < 0 ? undefined : normalized[caseIndex + 1];
    const output = outputIndex < 0 ? undefined : normalized[outputIndex + 1];
    const maxTrainGroups = maxGroupsIndex < 0 ? undefined : Number(normalized[maxGroupsIndex + 1]);
    const split = splitIndex < 0 ? "train" : normalized[splitIndex + 1];
    if (!manifest || !protocol || !dataRoot || !caseId || !output)
      throw new Error(
        "usage: harmony:cli boundary-records <manifest.json> --protocol <protocol.json> --data-root <directory> --case <id> --output <records.json> [--max-train-groups <n>] [--split train|tune]",
      );
    if (maxGroupsIndex >= 0 && (!Number.isInteger(maxTrainGroups) || maxTrainGroups! < 1))
      throw new Error("--max-train-groups must be a positive integer");
    if (split !== "train" && split !== "tune") throw new Error("boundary records --split must be train or tune");
    return exportHarmonyBoundaryRecordsFile({
      manifestPath: resolve(cwd, manifest),
      protocolPath: resolve(cwd, protocol),
      dataRoot: resolve(cwd, dataRoot),
      caseId,
      outputPath: resolve(cwd, output),
      ...(maxTrainGroups === undefined ? {} : { maxTrainGroups }),
      split,
    });
  }
  if (normalized[0] === "calibrate") {
    const report = normalized[1];
    if (!report) throw new Error("usage: harmony:cli calibrate <train-report.json> [--case <id>]");
    const caseIndex = normalized.indexOf("--case");
    return buildHarmonyCalibrationAssetFile(
      resolve(cwd, report),
      caseIndex < 0 ? undefined : normalized[caseIndex + 1],
    );
  }
  if (normalized[0] === "compare") {
    const baseline = normalized[1];
    const report = normalized[2];
    if (!baseline || !report) throw new Error("usage: harmony:cli compare <baseline.json> <eval-report.json>");
    return compareBaselineFiles(resolve(cwd, baseline), resolve(cwd, report));
  }
  if (normalized[0] === "eval") {
    const path = normalized[1] ?? "test-fixtures/harmony/regressions/manifest.json";
    const dataRootIndex = normalized.indexOf("--data-root");
    const dataRoot = dataRootIndex < 0 ? undefined : normalized[dataRootIndex + 1];
    const caseIndex = normalized.indexOf("--case");
    const caseId = caseIndex < 0 ? undefined : normalized[caseIndex + 1];
    const splitIndex = normalized.indexOf("--split");
    const reportSplit = splitIndex < 0 ? undefined : normalized[splitIndex + 1];
    const thresholdIndex = normalized.indexOf("--decision-threshold");
    const rawDecisionThreshold = thresholdIndex < 0 ? undefined : normalized[thresholdIndex + 1];
    const decisionThreshold = rawDecisionThreshold === undefined ? undefined : Number(rawDecisionThreshold);
    const boundaryPolicyIndex = normalized.indexOf("--boundary-policy");
    const boundaryPolicy = boundaryPolicyIndex < 0 ? undefined : normalized[boundaryPolicyIndex + 1];
    const boundaryModelIndex = normalized.indexOf("--boundary-model");
    const boundaryModelPath = boundaryModelIndex < 0 ? undefined : normalized[boundaryModelIndex + 1];
    const structuredModelIndex = normalized.indexOf("--structured-model");
    const structuredModelPath = structuredModelIndex < 0 ? undefined : normalized[structuredModelIndex + 1];
    if (splitIndex >= 0 && (reportSplit === undefined || !["train", "tune", "eval"].includes(reportSplit)))
      throw new Error("--split must be train, tune, or eval");
    if (
      thresholdIndex >= 0 &&
      (decisionThreshold === undefined ||
        !Number.isFinite(decisionThreshold) ||
        decisionThreshold < 0 ||
        decisionThreshold > 1)
    )
      throw new Error("--decision-threshold must be between 0 and 1");
    if (
      boundaryPolicyIndex >= 0 &&
      boundaryPolicy !== "dense-note-events" &&
      boundaryPolicy !== "metric-beats" &&
      boundaryPolicy !== "metric-half-beats" &&
      boundaryPolicy !== "metric-strong-onsets" &&
      boundaryPolicy !== "learned-evidence"
    )
      throw new Error(
        "--boundary-policy must be dense-note-events, metric-beats, metric-half-beats, metric-strong-onsets, or learned-evidence",
      );
    if (boundaryPolicy === "learned-evidence" && boundaryModelPath === undefined)
      throw new Error("--boundary-model is required for learned-evidence policy");
    if (boundaryModelPath !== undefined && boundaryPolicy !== "learned-evidence")
      throw new Error("--boundary-model requires learned-evidence policy");
    if (structuredModelPath !== undefined && boundaryPolicy !== undefined && boundaryPolicy !== "dense-note-events")
      throw new Error("--structured-model requires dense-note-events boundary policy");
    const boundaryClassifierModel =
      boundaryModelPath === undefined
        ? undefined
        : harmonyBoundaryClassifierModelSchema.parse(
            JSON.parse(await readFile(resolve(cwd, boundaryModelPath), "utf8")),
          );
    const structuredModelBytes =
      structuredModelPath === undefined ? undefined : await readFile(resolve(cwd, structuredModelPath));
    const structuredModel =
      structuredModelBytes === undefined
        ? undefined
        : harmonyStructuredLinearModelSchema.parse(JSON.parse(structuredModelBytes.toString("utf8")));
    return evaluateHarmonyManifest(resolve(cwd, path), {
      ...(dataRoot === undefined ? {} : { dataRoot: resolve(cwd, dataRoot) }),
      ...(caseId === undefined ? {} : { caseId }),
      ...(reportSplit === undefined ? {} : { reportSplit: reportSplit as DatasetSplit }),
      ...(decisionThreshold === undefined ? {} : { decisionThreshold }),
      ...(boundaryPolicy === undefined ? {} : { boundaryPolicy: boundaryPolicy as HarmonyBoundaryPolicy }),
      ...(boundaryClassifierModel === undefined ? {} : { boundaryClassifierModel }),
      ...(structuredModel === undefined
        ? {}
        : {
            structuredModel,
            structuredModelSha256: createHash("sha256").update(structuredModelBytes!).digest("hex"),
          }),
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
