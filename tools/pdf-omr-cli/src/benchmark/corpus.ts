import { z } from "zod";
import { PdfOmrError } from "../errors";
import { sha256Schema } from "../schemas";

const relativeCorpusPathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.startsWith("\\") &&
      !/^[A-Za-z]:[\\/]/.test(value) &&
      !value.replaceAll("\\", "/").split("/").includes(".."),
    "corpus paths must be relative and cannot escape the corpus root",
  );

export const corpusItemSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
    workId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
    variantId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
    split: z.enum(["development", "holdout"]),
    category: z.string().min(1),
    inputScope: z.enum(["system-crop", "full-page"]).optional(),
    staffLayout: z.enum(["auto", "single-staff", "grand-staff", "three-staff"]).optional(),
    benchmarkSuite: z.enum(["contract", "oracle-system", "full-page"]).optional(),
    input: z.object({ path: relativeCorpusPathSchema, sha256: sha256Schema }).strict(),
    groundTruth: z
      .object({
        path: relativeCorpusPathSchema,
        sha256: sha256Schema,
        format: z.enum(["musicxml", "mxl"]),
      })
      .strict(),
    license: z.object({ id: z.string().min(1), source: z.url() }).strict(),
    provenance: z
      .object({
        dataset: z.string().min(1),
        release: z.string().min(1),
        sampleId: z.string().min(1),
        sourceSplit: z.string().min(1),
        archiveSha256: sha256Schema,
      })
      .strict()
      .optional(),
  })
  .strict();

export const corpusManifestSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    corpusId: z.string().min(1),
    protocolVersion: z.string().min(1),
    execution: z
      .object({
        profile: z.enum(["quick", "standard"]),
        maxTotalWallTimeMs: z.number().int().positive(),
        repeatItemIds: z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)),
      })
      .strict()
      .optional(),
    items: z.array(corpusItemSchema).min(1),
  })
  .strict();

export type CorpusManifest = z.infer<typeof corpusManifestSchema>;
export type CorpusItem = z.infer<typeof corpusItemSchema>;

export function verifyCorpusManifest(input: unknown): CorpusManifest {
  let manifest: CorpusManifest;
  try {
    manifest = corpusManifestSchema.parse(input);
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "corpus manifest is invalid", {
      context: { reason: "invalid-corpus-manifest" },
      cause: error,
    });
  }
  const itemIds = new Set<string>();
  const workSplits = new Map<string, Set<CorpusItem["split"]>>();
  for (const item of manifest.items) {
    if (itemIds.has(item.id)) {
      throw new PdfOmrError("INVALID_INPUT", "corpus item IDs must be unique", {
        context: { reason: "duplicate-item-id", itemId: item.id },
      });
    }
    itemIds.add(item.id);
    if (item.inputScope === "system-crop" && (item.staffLayout === undefined || item.staffLayout === "auto")) {
      throw corpusError("system-crop-requires-staff-layout", { itemId: item.id });
    }
    const splits = workSplits.get(item.workId) ?? new Set<CorpusItem["split"]>();
    splits.add(item.split);
    workSplits.set(item.workId, splits);
    if (splits.size > 1) {
      throw new PdfOmrError("INVALID_INPUT", "corpus work variants cannot cross splits", {
        context: { reason: "work-split-leakage", workId: item.workId },
      });
    }
  }
  verifyExecutionProfile(manifest, itemIds);
  return manifest;
}

function verifyExecutionProfile(manifest: CorpusManifest, itemIds: ReadonlySet<string>): void {
  const execution = manifest.execution;
  if (execution === undefined) return;
  const repeatItemIds = new Set(execution.repeatItemIds);
  if (repeatItemIds.size !== execution.repeatItemIds.length) {
    throw corpusError("duplicate-repeat-item");
  }
  const unknownRepeatItem = execution.repeatItemIds.find((itemId) => !itemIds.has(itemId));
  if (unknownRepeatItem !== undefined) {
    throw corpusError("unknown-repeat-item", { itemId: unknownRepeatItem });
  }
  if (execution.profile === "quick") {
    if (manifest.items.length !== 10) throw corpusError("quick-item-count", { itemCount: manifest.items.length });
    if (manifest.items.some((item) => item.split !== "development")) {
      throw corpusError("quick-split");
    }
    if (execution.repeatItemIds.length !== 0) {
      throw corpusError("quick-repeat-items", { repeatItemCount: execution.repeatItemIds.length });
    }
    verifySuiteComposition(manifest, { contract: 2, "oracle-system": 6, "full-page": 2 }, "quick");
    return;
  }
  if (manifest.items.length !== 45) throw corpusError("standard-item-count", { itemCount: manifest.items.length });
  if (new Set(manifest.items.map((item) => item.split)).size !== 1) {
    throw corpusError("standard-mixed-splits");
  }
  if (execution.repeatItemIds.length !== 6) {
    throw corpusError("standard-repeat-items", { repeatItemCount: execution.repeatItemIds.length });
  }
  if (execution.maxTotalWallTimeMs !== 3_600_000) {
    throw corpusError("standard-time-budget", { maxTotalWallTimeMs: execution.maxTotalWallTimeMs });
  }
  verifySuiteComposition(manifest, { contract: 5, "oracle-system": 36, "full-page": 4 }, "standard");
  const invalidRepeatItem = manifest.items.find(
    (item) => repeatItemIds.has(item.id) && item.benchmarkSuite !== "oracle-system",
  );
  if (invalidRepeatItem !== undefined) {
    throw corpusError("repeat-item-suite", {
      itemId: invalidRepeatItem.id,
      benchmarkSuite: invalidRepeatItem.benchmarkSuite,
    });
  }
}

function verifySuiteComposition(
  manifest: CorpusManifest,
  expected: Record<"contract" | "oracle-system" | "full-page", number>,
  profile: "quick" | "standard",
): void {
  const actual = { contract: 0, "oracle-system": 0, "full-page": 0 };
  for (const item of manifest.items) {
    if (item.benchmarkSuite !== undefined) actual[item.benchmarkSuite] += 1;
  }
  if (Object.entries(expected).some(([suite, count]) => actual[suite as keyof typeof actual] !== count)) {
    throw corpusError(`${profile}-suite-composition`, { expected, actual });
  }
}

function corpusError(reason: string, context: Readonly<Record<string, unknown>> = {}): PdfOmrError {
  return new PdfOmrError("INVALID_INPUT", "corpus manifest execution profile is invalid", {
    context: { reason, ...context },
  });
}
