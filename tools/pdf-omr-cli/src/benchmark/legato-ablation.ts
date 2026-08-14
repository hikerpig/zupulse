import type { BenchmarkReport } from "./report";
import type { OmrEngineEnvironment } from "../engines/types";

export const legatoBeamCandidates = [1, 2, 4] as const;
const baselineNumBeams = 1;

export type LegatoAblationVariant = {
  numBeams: number;
  reportSha256: string;
  report: BenchmarkReport;
  environment: OmrEngineEnvironment;
};

export function buildLegatoAblationComparison(variants: readonly LegatoAblationVariant[]) {
  const baseline = variants.find((variant) => variant.numBeams === baselineNumBeams);
  if (baseline?.report.overall === undefined) throw new Error("beam=1 baseline report is incomplete");
  return {
    schemaVersion: "1.0.0" as const,
    baselineNumBeams,
    experiment: { maxLength: 2048, repetitionPenalty: 1.1, dtype: "float16", mode: "development" as const },
    identity: {
      corpusSha256: baseline.report.metadata.manifestSha256,
      engineVersion: baseline.environment.version,
      modelSha256: baseline.environment.modelSha256 ?? "unavailable",
      device: baseline.report.overall.runtime.decoder === undefined ? "unavailable" : "reported-per-page",
      workerMode: true,
    },
    candidates: variants.map((variant) => summarizeVariant(baseline.report, variant)),
  };
}

function summarizeVariant(baseline: BenchmarkReport, variant: LegatoAblationVariant) {
  const metrics = variant.report.overall;
  if (metrics === undefined) {
    return {
      numBeams: variant.numBeams,
      reportSha256: variant.reportSha256,
      complete: false,
      evaluationSetStable: false,
    };
  }
  return {
    numBeams: variant.numBeams,
    reportSha256: variant.reportSha256,
    complete: true,
    evaluationSetStable: hasSameEvaluationSet(baseline, variant.report),
    items: variant.report.items,
    symbolic: {
      jointF1: metrics.symbolic.joint.f1,
      pitchF1: metrics.symbolic.pitch.f1,
      onsetF1: metrics.symbolic.onset.f1,
    },
    reproducibilityRate: metrics.reproducibility.agreementRate,
    runtime: {
      recognitionP50Ms: metrics.runtime.stageWallTimeMs.recognize.p50,
      wallTimeP50Ms: metrics.runtime.wallTimeMs.p50,
      ...(metrics.runtime.peakRssBytes === undefined ? {} : { peakRssBytes: metrics.runtime.peakRssBytes.p50 }),
      ...(metrics.runtime.processResources?.averageCpuPercent === undefined
        ? {}
        : { averageCpuPercent: metrics.runtime.processResources.averageCpuPercent.p50 }),
      ...(metrics.runtime.decoder === undefined ? {} : { outputTokens: metrics.runtime.decoder.outputTokens }),
    },
  };
}

function hasSameEvaluationSet(reference: BenchmarkReport, candidate: BenchmarkReport): boolean {
  if (
    candidate.items.total !== reference.items.total ||
    candidate.items.succeeded !== reference.items.succeeded ||
    candidate.items.failed !== reference.items.failed
  ) {
    return false;
  }
  const failedItemIds = (report: BenchmarkReport) => report.failures.map((failure) => failure.itemId).sort();
  return JSON.stringify(failedItemIds(candidate)) === JSON.stringify(failedItemIds(reference));
}
