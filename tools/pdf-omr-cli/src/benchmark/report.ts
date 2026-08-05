import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { HarmonyImpactMetrics } from "./harmony-impact-metrics";
import { aggregateRuntimeMetrics, type RuntimeMetrics, type RuntimeObservation } from "./runtime-metrics";
import type { ReproducibilityMetrics } from "./reproducibility-metrics";
import { aggregateSymbolicMetrics, type SymbolicMetrics } from "./symbolic-metrics";
import type { FrozenProtocol } from "./verify-protocol";

export type BenchmarkItemResult = {
  schemaVersion: "1.0.0";
  itemId: string;
  category: string;
  status: "succeeded";
  symbolic: SymbolicMetrics;
  harmony: HarmonyImpactMetrics;
  runtime: RuntimeObservation;
  reproducibility: ReproducibilityMetrics;
};

export type BenchmarkItemFailure = {
  schemaVersion: "1.0.0";
  itemId: string;
  category: string;
  status: "failed";
  error: { code: string; message: string; context?: Readonly<Record<string, unknown>> };
};

export type BenchmarkItemRecord = BenchmarkItemResult | BenchmarkItemFailure;

export type BenchmarkMetadata = {
  corpusId: string;
  protocolVersion: string;
  manifestSha256: string;
  mode: "development" | "holdout";
  engineId: string;
  preprocess: string;
  protocolSha256?: string;
};

export type BenchmarkGateThresholds = FrozenProtocol["gates"];

type AggregateMetrics = {
  symbolic: SymbolicMetrics;
  harmony: HarmonyImpactMetrics;
  runtime: RuntimeMetrics;
  reproducibility: ReproducibilityMetrics;
};

export type BenchmarkReport = {
  schemaVersion: "1.0.0";
  metadata: BenchmarkMetadata;
  items: { total: number; succeeded: number; failed: number };
  failures: Array<{ itemId: string; category: string; code: string }>;
  categories: Record<string, AggregateMetrics>;
  overall?: AggregateMetrics;
  gate:
    | { evaluated: false; decision: "NOT_EVALUATED" }
    | {
        evaluated: true;
        passed: boolean;
        decision: "CONTINUE_TO_APP_DISCOVERY" | "INVESTIGATE" | "STOP";
        checks: Record<string, { value?: number; passed: boolean }>;
      };
};

export function buildBenchmarkReport(
  metadata: BenchmarkMetadata,
  records: readonly BenchmarkItemRecord[],
  gateThresholds?: BenchmarkGateThresholds,
): BenchmarkReport {
  const successes = records.filter((record): record is BenchmarkItemResult => record.status === "succeeded");
  const categories = Object.fromEntries(
    [...new Set(successes.map((record) => record.category))]
      .sort()
      .map((category) => [category, aggregate(successes.filter((record) => record.category === category))]),
  );
  const overall = successes.length === 0 ? undefined : aggregate(successes);
  return {
    schemaVersion: "1.0.0",
    metadata,
    items: {
      total: records.length,
      succeeded: successes.length,
      failed: records.length - successes.length,
    },
    failures: records.flatMap((record) =>
      record.status === "failed" ? [{ itemId: record.itemId, category: record.category, code: record.error.code }] : [],
    ),
    categories,
    ...(overall === undefined ? {} : { overall }),
    gate:
      metadata.mode === "holdout"
        ? evaluateGate(overall, requireGateThresholds(gateThresholds))
        : { evaluated: false, decision: "NOT_EVALUATED" },
  };
}

export async function readBenchmarkItemResults(outputDirectory: string): Promise<BenchmarkItemRecord[]> {
  const itemsDirectory = join(outputDirectory, "items");
  const names = (await readdir(itemsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    names.map(async (name) => {
      try {
        return JSON.parse(await readFile(join(itemsDirectory, name, "result.json"), "utf8")) as BenchmarkItemResult;
      } catch {
        return JSON.parse(await readFile(join(itemsDirectory, name, "error.json"), "utf8")) as BenchmarkItemFailure;
      }
    }),
  );
}

function aggregate(items: readonly BenchmarkItemResult[]): AggregateMetrics {
  return {
    symbolic: aggregateSymbolicMetrics(items.map((item) => item.symbolic)),
    harmony: aggregateHarmony(items.map((item) => item.harmony)),
    runtime: aggregateRuntimeMetrics(items.map((item) => item.runtime)),
    reproducibility: aggregateReproducibility(items.map((item) => item.reproducibility)),
  };
}

function aggregateHarmony(items: readonly HarmonyImpactMetrics[]): HarmonyImpactMetrics {
  const mapped = sum(items, (item) => item.overlap.mappedDurationTicks);
  const correct = sum(items, (item) => item.overlap.correctDurationTicks);
  const wrong = sum(items, (item) => item.overlap.wrongDurationTicks);
  const unresolved = sum(items, (item) => item.overlap.unresolvedDurationTicks);
  const resolved = correct + wrong;
  const expected = sum(items, (item) => item.boundaries.expected);
  const predicted = sum(items, (item) => item.boundaries.predicted);
  const truePositive = sum(items, (item) => item.boundaries.truePositive);
  const boundaryPrecision = ratio(truePositive, predicted);
  const boundaryRecall = ratio(truePositive, expected);
  const falseWrong = sum(items, (item) => item.falseConfidentChord.wrong);
  const falseResolved = sum(items, (item) => item.falseConfidentChord.resolved);
  return {
    overlap: {
      mappedDurationTicks: mapped,
      correctDurationTicks: correct,
      wrongDurationTicks: wrong,
      unresolvedDurationTicks: unresolved,
      accuracy: ratio(correct, mapped),
      resolvedPrecision: ratio(correct, resolved),
      resolvedCoverage: ratio(resolved, mapped),
    },
    boundaries: {
      expected,
      predicted,
      truePositive,
      overSegmented: predicted - truePositive,
      underSegmented: expected - truePositive,
      f1:
        boundaryPrecision + boundaryRecall === 0
          ? 0
          : (2 * boundaryPrecision * boundaryRecall) / (boundaryPrecision + boundaryRecall),
    },
    falseConfidentChord: {
      wrong: falseWrong,
      resolved: falseResolved,
      rate: ratio(falseWrong, falseResolved),
    },
    status: {
      omrBlocked: sum(items, (item) => item.status.omrBlocked),
      harmonyUnresolved: sum(items, (item) => item.status.harmonyUnresolved),
      unsupportedGold: sum(items, (item) => item.status.unsupportedGold),
    },
  };
}

function aggregateReproducibility(items: readonly ReproducibilityMetrics[]): ReproducibilityMetrics {
  const comparisons = sum(items, (item) => item.comparisons);
  const agreements = sum(items, (item) => item.agreements);
  return {
    comparisons,
    agreements,
    agreementRate: comparisons === 0 ? 1 : agreements / comparisons,
    mismatches: items.flatMap((item) => item.mismatches),
  };
}

function evaluateGate(
  overall: AggregateMetrics | undefined,
  thresholds: BenchmarkGateThresholds,
): Extract<BenchmarkReport["gate"], { evaluated: true }> {
  const values = {
    noteJointF1: overall?.symbolic.joint.f1,
    validMeasureRate: overall?.symbolic.validMeasure.rate,
    generatedMxlParseRate: overall?.runtime.capabilities.parseRate,
    roundTripStructuralAgreementRate: overall?.runtime.capabilities.structuralAgreementRate,
    harmonyResolvedPrecisionDelta: overall === undefined ? undefined : overall.harmony.overlap.resolvedPrecision - 1,
    falseConfidentChordRate: overall?.harmony.falseConfidentChord.rate,
    repeatedRunDraftHashAgreement: overall?.reproducibility.agreementRate,
    cancelLatencyP95Seconds:
      overall?.runtime.cancelLatencyMs === undefined ? undefined : overall.runtime.cancelLatencyMs.p95 / 1_000,
  };
  const checks = {
    noteJointF1: check(values.noteJointF1, (value) => value >= thresholds.jointF1),
    validMeasureRate: check(values.validMeasureRate, (value) => value >= thresholds.validMeasureRate),
    generatedMxlParseRate: check(values.generatedMxlParseRate, (value) => value >= thresholds.parseRate),
    roundTripStructuralAgreementRate: check(
      values.roundTripStructuralAgreementRate,
      (value) => value >= thresholds.structuralAgreementRate,
    ),
    harmonyResolvedPrecisionDelta: check(
      values.harmonyResolvedPrecisionDelta,
      (value) => value >= thresholds.harmonyPrecisionDelta,
    ),
    falseConfidentChordRate: check(
      values.falseConfidentChordRate,
      (value) => value <= thresholds.falseConfidentChordRate,
    ),
    repeatedRunDraftHashAgreement: check(
      values.repeatedRunDraftHashAgreement,
      (value) => value >= thresholds.reproducibilityAgreementRate,
    ),
    cancelLatencyP95Seconds: check(
      values.cancelLatencyP95Seconds,
      (value) => value <= thresholds.cancelLatencyP95Ms / 1_000,
    ),
  };
  const failed = Object.values(checks).filter((item) => !item.passed).length;
  return {
    evaluated: true,
    passed: failed === 0,
    decision: failed === 0 ? "CONTINUE_TO_APP_DISCOVERY" : failed === 1 ? "INVESTIGATE" : "STOP",
    checks,
  };
}

function requireGateThresholds(thresholds: BenchmarkGateThresholds | undefined): BenchmarkGateThresholds {
  if (thresholds === undefined) throw new Error("holdout-gate-thresholds-required");
  return thresholds;
}

function check(value: number | undefined, predicate: (value: number) => boolean): { value?: number; passed: boolean } {
  return value === undefined ? { passed: false } : { value, passed: predicate(value) };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function sum<T>(items: readonly T[], select: (item: T) => number): number {
  return items.reduce((total, item) => total + select(item), 0);
}
