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
    primary.itemIds.map(async (itemId) => {
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
      total: comparisons.length,
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
  if (items.failed !== 0 || items.succeeded !== items.total) {
    throw invalidRun("benchmark-run-incomplete");
  }
  const itemIds = (
    await readdir(join(directory, "items"), { withFileTypes: true }).catch((error: unknown) => {
      throw invalidRun("benchmark-items-unreadable", error);
    })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (itemIds.length !== items.total) throw invalidRun("benchmark-item-count-mismatch");
  return { directory, reportSha256: sha256Bytes(reportBytes), metadata, itemIds };
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
    primary.itemIds.length === secondary.itemIds.length &&
    primary.itemIds.every((itemId, index) => itemId === secondary.itemIds[index]);
  if (!sameIdentity) throw incompatibleRuns();
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
