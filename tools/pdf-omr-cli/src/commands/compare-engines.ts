import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { compareEngineDrafts, engineComparisonReportSchema } from "../benchmark/engine-comparison";
import { sha256Bytes } from "../canonical-json";
import { PdfOmrError } from "../errors";
import {
  omrScoreDraftSchema,
  pdfOmrCompareEnginesReportSchema,
  sha256Schema,
  type PdfOmrCompareEnginesReport,
} from "../schemas";
import { writeCanonicalNew } from "./draft-io";

const benchmarkMetadataSchema = z
  .object({
    corpusId: z.string().min(1),
    protocolVersion: z.string().min(1),
    manifestSha256: sha256Schema,
    mode: z.enum(["development", "holdout"]),
    engineId: z.string().min(1),
    preprocess: z.string().min(1),
    protocolSha256: sha256Schema.optional(),
    execution: z
      .object({
        profile: z.enum(["quick", "standard"]),
        maxTotalWallTimeMs: z.number().int().positive(),
        repeatItemCount: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict();

const benchmarkItemSummarySchema = z
  .object({
    total: z.number().int().nonnegative(),
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  })
  .strict();

type RunFacts = {
  directory: string;
  reportSha256: string;
  metadata: z.infer<typeof benchmarkMetadataSchema>;
  attempted: number;
  itemIds: string[];
};

export async function compareEnginesCommand(input: {
  primaryDirectory: string;
  secondaryDirectory: string;
  output: string;
  topologyMode?: "strict" | "ordered-staves";
  cwd?: string;
}): Promise<PdfOmrCompareEnginesReport> {
  const cwd = input.cwd ?? process.cwd();
  const [primary, secondary] = await Promise.all([
    readRun(resolve(cwd, input.primaryDirectory)),
    readRun(resolve(cwd, input.secondaryDirectory)),
  ]);
  requireCompatibleRuns(primary, secondary);
  const comparisons = await Promise.all(
    comparableItemIds(primary, secondary).map(async (itemId) => {
      const [primaryDraft, secondaryDraft] = await Promise.all([
        readPredictedDraft(primary.directory, itemId),
        readPredictedDraft(secondary.directory, itemId),
      ]);
      return {
        itemId,
        ...compareEngineDrafts(primaryDraft, secondaryDraft, { topologyMode: input.topologyMode ?? "strict" }),
      };
    }),
  );
  const report = engineComparisonReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "compare-engines",
    identity: {
      corpusId: primary.metadata.corpusId,
      protocolVersion: primary.metadata.protocolVersion,
      manifestSha256: primary.metadata.manifestSha256,
      mode: "development",
    },
    primary: {
      engineId: primary.metadata.engineId,
      preprocess: primary.metadata.preprocess,
      reportSha256: primary.reportSha256,
    },
    secondary: {
      engineId: secondary.metadata.engineId,
      preprocess: secondary.metadata.preprocess,
      reportSha256: secondary.reportSha256,
    },
    items: {
      attempted: primary.attempted,
      primarySucceeded: primary.itemIds.length,
      secondarySucceeded: secondary.itemIds.length,
      comparable: comparisons.length,
      agreements: comparisons.filter((comparison) => comparison.agreement).length,
      disagreements: comparisons.filter((comparison) => !comparison.agreement).length,
      ambiguousAlignments: comparisons.filter((comparison) => comparison.alignmentAmbiguous).length,
      repairCandidates: comparisons.reduce(
        (count, comparison) =>
          count + comparison.proposals.filter((proposal) => proposal.repairCandidate !== undefined).length,
        0,
      ),
    },
    comparisons,
  });
  const outputSha256 = await writeCanonicalNew(join(input.output, "comparison.json"), report, cwd);
  return pdfOmrCompareEnginesReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "compare-engines",
    status: "succeeded",
    outputSha256,
  });
}

async function readRun(directory: string): Promise<RunFacts> {
  const reportBytes = await readFile(join(directory, "report.json")).catch((error: unknown) => {
    throw invalidRun("benchmark-report-unreadable", error);
  });
  let report: unknown;
  try {
    report = JSON.parse(new TextDecoder().decode(reportBytes));
  } catch (error) {
    throw invalidRun("benchmark-report-invalid", error);
  }
  if (typeof report !== "object" || report === null || Array.isArray(report)) {
    throw invalidRun("benchmark-report-invalid");
  }
  const record = report as Record<string, unknown>;
  let metadata: z.infer<typeof benchmarkMetadataSchema>;
  let items: z.infer<typeof benchmarkItemSummarySchema>;
  try {
    metadata = benchmarkMetadataSchema.parse(record.metadata);
    items = benchmarkItemSummarySchema.parse(record.items);
  } catch (error) {
    throw invalidRun("benchmark-report-invalid", error);
  }
  if (metadata.mode !== "development") throw incompatibleRuns();
  const failures = Array.isArray(record.failures) ? record.failures : [];
  const failedItemIds = new Set(
    failures.flatMap((failure) => {
      if (typeof failure !== "object" || failure === null || Array.isArray(failure)) return [];
      const itemId = (failure as Record<string, unknown>).itemId;
      return typeof itemId === "string" ? [itemId] : [];
    }),
  );
  if (failedItemIds.size !== items.failed) throw invalidRun("benchmark-failure-count-mismatch");
  const itemIds = (
    await readdir(join(directory, "items"), { withFileTypes: true }).catch((error: unknown) => {
      throw invalidRun("benchmark-items-unreadable", error);
    })
  )
    .filter((entry) => entry.isDirectory() && !failedItemIds.has(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (itemIds.length !== items.succeeded) throw invalidRun("benchmark-item-count-mismatch");
  return { directory, reportSha256: sha256Bytes(reportBytes), metadata, attempted: items.total, itemIds };
}

async function readPredictedDraft(directory: string, itemId: string) {
  const bytes = await readFile(join(directory, "items", itemId, "predicted-draft.json")).catch((error: unknown) => {
    throw invalidRun("predicted-draft-unreadable", error);
  });
  try {
    return omrScoreDraftSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (error) {
    throw invalidRun("predicted-draft-invalid", error);
  }
}

function requireCompatibleRuns(primary: RunFacts, secondary: RunFacts): void {
  const sameIdentity =
    primary.metadata.corpusId === secondary.metadata.corpusId &&
    primary.metadata.protocolVersion === secondary.metadata.protocolVersion &&
    primary.metadata.manifestSha256 === secondary.metadata.manifestSha256 &&
    primary.metadata.mode === secondary.metadata.mode &&
    primary.attempted === secondary.attempted;
  if (!sameIdentity) throw incompatibleRuns();
}

function comparableItemIds(primary: RunFacts, secondary: RunFacts): string[] {
  const secondaryItems = new Set(secondary.itemIds);
  return primary.itemIds.filter((itemId) => secondaryItems.has(itemId));
}

function incompatibleRuns(): PdfOmrError {
  return new PdfOmrError("BENCHMARK_EVALUATION_LIMITATION", "benchmark runs are not comparable", {
    context: { reason: "incompatible-benchmark-runs" },
  });
}

function invalidRun(reason: string, cause?: unknown): PdfOmrError {
  return new PdfOmrError("INVALID_INPUT", "benchmark run cannot be compared", {
    context: { reason },
    ...(cause === undefined ? {} : { cause }),
  });
}
