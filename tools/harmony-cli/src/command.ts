import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { harmonyBoundaryClassifierModelSchema, type HarmonyBoundaryPolicy } from "@zupulse/web-core";
import { compareBaselineFiles } from "./compareBaselineFiles";
import { buildHarmonyCalibrationAssetFile, type HarmonyCalibrationAsset } from "./confidenceCalibration";
import { evaluateHarmonyManifest } from "./evaluateManifest";
import { evaluateHarmonyV3FinalHoldoutFile } from "./evaluateV3FinalHoldout";
import { exportHarmonyRankingRecordsFile } from "./exportRankingRecords";
import { exportHarmonyBoundaryRecordsFile } from "./exportBoundaryRecords";
import { exportHarmonyStructuredOracleFile } from "./exportStructuredOracle";
import { inspectHarmonyScore, type InspectView } from "./inspectScore";
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
  | Awaited<ReturnType<typeof evaluateHarmonyV3FinalHoldoutFile>>
> {
  const normalized = args[0] === "--" ? args.slice(1) : args;
  const cwd = context.cwd ?? process.env.INIT_CWD ?? process.cwd();
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
    const topKIndex = normalized.indexOf("--top-k");
    const protocol = protocolIndex < 0 ? undefined : normalized[protocolIndex + 1];
    const dataRoot = dataRootIndex < 0 ? undefined : normalized[dataRootIndex + 1];
    const caseId = caseIndex < 0 ? undefined : normalized[caseIndex + 1];
    const output = outputIndex < 0 ? undefined : normalized[outputIndex + 1];
    const split = splitIndex < 0 ? "train" : normalized[splitIndex + 1];
    const maxSpan = maxSpanIndex < 0 ? 16 : Number(normalized[maxSpanIndex + 1]);
    const topK = topKIndex < 0 ? 8 : Number(normalized[topKIndex + 1]);
    if (!manifest || !protocol || !dataRoot || !caseId || !output)
      throw new Error(
        "usage: harmony:cli structured-oracle <manifest.json> --protocol <protocol.json> --data-root <directory> --case <id> --output <report.json> [--split train|tune] [--max-span <n>] [--top-k <1..8>]",
      );
    if (split !== "train" && split !== "tune") throw new Error("structured oracle --split must be train or tune");
    if (!Number.isInteger(maxSpan) || maxSpan < 1) throw new Error("--max-span must be a positive integer");
    if (!Number.isInteger(topK) || topK < 1 || topK > 8) throw new Error("--top-k must be an integer from 1 to 8");
    return exportHarmonyStructuredOracleFile({
      manifestPath: resolve(cwd, manifest),
      protocolPath: resolve(cwd, protocol),
      dataRoot: resolve(cwd, dataRoot),
      caseId,
      outputPath: resolve(cwd, output),
      split,
      maxSpan,
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
    const boundaryClassifierModel =
      boundaryModelPath === undefined
        ? undefined
        : harmonyBoundaryClassifierModelSchema.parse(
            JSON.parse(await readFile(resolve(cwd, boundaryModelPath), "utf8")),
          );
    return evaluateHarmonyManifest(resolve(cwd, path), {
      ...(dataRoot === undefined ? {} : { dataRoot: resolve(cwd, dataRoot) }),
      ...(caseId === undefined ? {} : { caseId }),
      ...(reportSplit === undefined ? {} : { reportSplit: reportSplit as DatasetSplit }),
      ...(decisionThreshold === undefined ? {} : { decisionThreshold }),
      ...(boundaryPolicy === undefined ? {} : { boundaryPolicy: boundaryPolicy as HarmonyBoundaryPolicy }),
      ...(boundaryClassifierModel === undefined ? {} : { boundaryClassifierModel }),
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
