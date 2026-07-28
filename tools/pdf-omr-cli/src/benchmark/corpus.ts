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
    input: z.object({ path: relativeCorpusPathSchema, sha256: sha256Schema }).strict(),
    groundTruth: z
      .object({
        path: relativeCorpusPathSchema,
        sha256: sha256Schema,
        format: z.enum(["musicxml", "mxl"]),
      })
      .strict(),
    license: z.object({ id: z.string().min(1), source: z.url() }).strict(),
  })
  .strict();

export const corpusManifestSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    corpusId: z.string().min(1),
    protocolVersion: z.string().min(1),
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
    const splits = workSplits.get(item.workId) ?? new Set<CorpusItem["split"]>();
    splits.add(item.split);
    workSplits.set(item.workId, splits);
    if (splits.size > 1) {
      throw new PdfOmrError("INVALID_INPUT", "corpus work variants cannot cross splits", {
        context: { reason: "work-split-leakage", workId: item.workId },
      });
    }
  }
  return manifest;
}
