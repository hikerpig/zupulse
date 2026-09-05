import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { buildTopologyEvidenceReport, type TopologyEvidenceInputItem } from "../src/benchmark/topology-evidence";
import { canonicalJson, sha256Bytes } from "../src/canonical-json";
import { pdfOmrErrorCodes } from "../src/errors";
import { omrScoreDraftSchema } from "../src/schemas";

const reportSchema = z
  .object({
    failures: z.array(
      z
        .object({
          itemId: z.string().min(1),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const errorArtifactSchema = z
  .object({
    error: z
      .object({
        code: z.enum(pdfOmrErrorCodes),
        message: z.string().min(1),
        context: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
  })
  .passthrough();

const runDirectory = process.argv[2];
const outputPath = process.argv[3];
if (runDirectory === undefined || outputPath === undefined) {
  throw new Error("usage: vite-node audit_topology_failures.ts <benchmark-run-dir> <output.json>");
}

const absoluteRunDirectory = resolve(runDirectory);
const reportPath = join(absoluteRunDirectory, "report.json");
const reportBytes = await readFile(reportPath);
const report = reportSchema.parse(JSON.parse(new TextDecoder().decode(reportBytes)));
const items: TopologyEvidenceInputItem[] = [];
for (const failure of report.failures) {
  const itemDirectory = join(absoluteRunDirectory, "items", failure.itemId);
  const errorArtifact = errorArtifactSchema.parse(await readJson(join(itemDirectory, "error.json")));
  const predicted = await readOptionalDraft(join(itemDirectory, "predicted-draft.json"));
  const expected = await readOptionalDraft(join(itemDirectory, "ground-truth-draft.json"));
  items.push({
    itemId: failure.itemId,
    error: errorArtifact.error,
    ...(predicted === undefined ? {} : { predicted }),
    ...(expected === undefined ? {} : { expected }),
  });
}

const evidence = buildTopologyEvidenceReport({
  sourceReportSha256: sha256Bytes(reportBytes),
  items,
});
const outputBytes = new TextEncoder().encode(canonicalJson(evidence));
await writeFile(resolve(outputPath), outputBytes, { flag: "wx" });
console.log(JSON.stringify({ outputPath: resolve(outputPath), sha256: sha256Bytes(outputBytes) }));

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await readFile(path)));
}

async function readOptionalDraft(path: string) {
  try {
    return omrScoreDraftSchema.parse(await readJson(path));
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT"
  );
}
