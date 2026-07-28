import { PdfOmrError } from "../errors";
import { sha256Schema } from "../schemas";

export type RepeatedRun = {
  runId: string;
  draftSha256: string;
};

export type ReproducibilityMetrics = {
  comparisons: number;
  agreements: number;
  agreementRate: number;
  mismatches: Array<{
    baselineRunId: string;
    baselineDraftSha256: string;
    runId: string;
    draftSha256: string;
  }>;
};

export function calculateReproducibilityMetrics(runs: readonly RepeatedRun[]): ReproducibilityMetrics {
  for (const run of runs) {
    if (run.runId.length === 0 || !sha256Schema.safeParse(run.draftSha256).success) {
      throw new PdfOmrError("INVALID_INPUT", "repeated run metadata is invalid", {
        context: { reason: "invalid-repeated-run" },
      });
    }
  }
  const baseline = runs[0];
  if (baseline === undefined) return { comparisons: 0, agreements: 0, agreementRate: 1, mismatches: [] };
  const comparisons = runs.slice(1);
  const mismatches = comparisons.flatMap((run) =>
    run.draftSha256 === baseline.draftSha256
      ? []
      : [
          {
            baselineRunId: baseline.runId,
            baselineDraftSha256: baseline.draftSha256,
            runId: run.runId,
            draftSha256: run.draftSha256,
          },
        ],
  );
  const agreements = comparisons.length - mismatches.length;
  return {
    comparisons: comparisons.length,
    agreements,
    agreementRate: comparisons.length === 0 ? 1 : agreements / comparisons.length,
    mismatches,
  };
}
