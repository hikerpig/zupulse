import { readFile } from "node:fs/promises";
import type { HarmonyBoundaryClassifierModel, HarmonyBoundaryPolicy } from "@zupulse/web-core";
import { dirname, resolve } from "node:path";
import { evaluateHarmonyDatasetManifest } from "./evaluateDatasetManifest";
import type { DatasetSplit } from "./evaluationProtocol";
import { inspectHarmonyScore } from "./inspectScore";
import {
  harmonyEvalReportSchema,
  harmonyRegressionManifestSchema,
  type HarmonyEvalReport,
  type HarmonyRegressionCheck,
  type HarmonyRegressionManifest,
} from "./schemas";

type RegressionSummary = HarmonyRegressionManifest["cases"][number]["expected"] & { sha256: string };

export async function evaluateHarmonyManifest(
  path: string,
  options: {
    dataRoot?: string;
    caseId?: string;
    reportSplit?: DatasetSplit;
    decisionThreshold?: number;
    boundaryPolicy?: HarmonyBoundaryPolicy;
    boundaryClassifierModel?: HarmonyBoundaryClassifierModel;
  } = {},
): Promise<HarmonyEvalReport | import("./schemas").HarmonyDatasetEvalReport> {
  const raw = JSON.parse(await readFile(path, "utf8")) as { schemaVersion?: unknown };
  if (raw.schemaVersion === "2.0.0") {
    if (!options.dataRoot) throw new Error("dataset manifest requires --data-root <directory>");
    return evaluateHarmonyDatasetManifest(
      path,
      options.dataRoot,
      options.caseId,
      options.reportSplit,
      options.decisionThreshold,
      options.boundaryPolicy,
      options.boundaryClassifierModel,
    );
  }
  const manifest = harmonyRegressionManifestSchema.parse(raw);
  const cases = await Promise.all(
    manifest.cases.map(async (item) => {
      const inspected = await inspectHarmonyScore(resolve(dirname(path), item.score), "all");
      const checks = compareRegressionSummary(summarize(inspected), { sha256: item.sha256, ...item.expected });
      return {
        id: item.id,
        status: checks.every((check) => check.status === "passed") ? ("passed" as const) : ("failed" as const),
        checks,
      };
    }),
  );
  return harmonyEvalReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "eval",
    manifest: manifest.id,
    summary: {
      passed: cases.filter((item) => item.status === "passed").length,
      failed: cases.filter((item) => item.status === "failed").length,
    },
    cases,
  });
}

export function compareRegressionSummary(
  actual: RegressionSummary,
  expected: RegressionSummary,
): HarmonyRegressionCheck[] {
  const fields = [
    ["sha256", expected.sha256, actual.sha256],
    ["model.measures", expected.model.measures, actual.model.measures],
    ["model.tracks", expected.model.tracks, actual.model.tracks],
    ["model.staves", expected.model.staves, actual.model.staves],
    ["model.notes", expected.model.notes, actual.model.notes],
    ["result.segments", expected.result.segments, actual.result.segments],
    ["result.resolved", expected.result.resolved, actual.result.resolved],
    ["result.unresolved", expected.result.unresolved, actual.result.unresolved],
  ] as const;
  return fields.map(([field, expectedValue, actualValue]) => ({
    field,
    expected: expectedValue,
    actual: actualValue,
    status: expectedValue === actualValue ? "passed" : "failed",
  }));
}

function summarize(inspected: Awaited<ReturnType<typeof inspectHarmonyScore>>): RegressionSummary {
  return {
    sha256: inspected.source.sha256,
    model: {
      measures: inspected.model.measures.length,
      tracks: inspected.model.tracks.length,
      staves: inspected.model.tracks.reduce((sum, track) => sum + track.staves.length, 0),
      notes: inspected.model.tracks.reduce(
        (sum, track) => sum + track.staves.reduce((staffSum, staff) => staffSum + staff.notes.length, 0),
        0,
      ),
    },
    result: {
      segments: inspected.result.length,
      resolved: inspected.result.filter((segment) => segment.status === "resolved").length,
      unresolved: inspected.result.filter((segment) => segment.status === "unresolved").length,
    },
  };
}
