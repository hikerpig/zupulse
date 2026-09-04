import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import { canonicalJson, sha256Bytes } from "../src/canonical-json";
import { createEngineRegistry } from "../src/engine-registry";
import { PdfOmrError } from "../src/errors";
import { sha256Schema } from "../src/schemas";
import { validateDraft } from "../src/validate-draft";

const manifestSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    detectorVersion: z.literal("learned-staff-system-v1"),
    items: z.array(
      z
        .object({
          id: z.string().min(1),
          workId: z.string().min(1),
          pageIndex: z.number().int().nonnegative(),
          systemIndex: z.number().int().nonnegative(),
          staffCount: z.union([z.literal(1), z.literal(2), z.literal(3)]),
          staffLayout: z.enum(["single-staff", "grand-staff", "three-staff"]),
          detectorCropSha256: sha256Schema,
          input: z.object({ path: z.string().min(1), sha256: sha256Schema }).strict(),
          consumerInputSha256: z.object({ legato: sha256Schema, rokot: sha256Schema }).strict(),
        })
        .strict(),
    ),
  })
  .passthrough();

const manifestPath = process.argv[2];
const engineId = process.argv[3];
const outputPath = process.argv[4];
const onlyItemIds = new Set(process.argv.slice(5));
if (manifestPath === undefined || !["legato", "rokot"].includes(engineId ?? "") || outputPath === undefined) {
  throw new Error("usage: vite-node run_shared_detector_inputs.ts <manifest.json> <legato|rokot> <output.json>");
}

const absoluteManifestPath = resolve(manifestPath);
const manifestBytes = await readFile(absoluteManifestPath);
const manifest = manifestSchema.parse(JSON.parse(new TextDecoder().decode(manifestBytes)));
const adapter = createEngineRegistry({ legatoWorkerMode: true }).get(engineId!);
const environment = await adapter.inspectEnvironment();
const items = [];
const selectedItems =
  onlyItemIds.size === 0 ? manifest.items : manifest.items.filter((item) => onlyItemIds.has(item.id));
if (selectedItems.length !== (onlyItemIds.size === 0 ? manifest.items.length : onlyItemIds.size)) {
  throw new Error("one or more requested shared detector inputs are missing");
}
try {
  for (const [index, item] of selectedItems.entries()) {
    const inputPath = resolve(dirname(absoluteManifestPath), item.input.path);
    const inputBytes = await readFile(inputPath);
    if (
      sha256Bytes(inputBytes) !== item.input.sha256 ||
      item.consumerInputSha256.legato !== item.input.sha256 ||
      item.consumerInputSha256.rokot !== item.input.sha256
    ) {
      throw new Error(`shared input hash mismatch: ${item.id}`);
    }
    const workDirectory = await mkdtemp(join(tmpdir(), `pdf-omr-${engineId}-shared-`));
    try {
      const raw = await adapter.recognize({
        inputPath,
        outputDirectory: workDirectory,
        inputScope: "system-crop",
        staffLayout: item.staffLayout,
      });
      const draft = adapter.normalize(raw);
      const validation = validateDraft(draft);
      items.push({
        itemId: item.id,
        status: "succeeded",
        detectorCropSha256: item.detectorCropSha256,
        inputSha256: item.input.sha256,
        normalizationSha256: sha256Bytes(raw.normalizationBytes),
        blockingDiagnosticCodes: draft.diagnostics
          .filter((diagnostic) => diagnostic.severity === "blocking")
          .map((diagnostic) => diagnostic.code),
        readiness: validation.readiness,
        validationBlockingDiagnosticCodes: validation.diagnostics
          .filter((diagnostic) => diagnostic.severity === "blocking")
          .map((diagnostic) => diagnostic.code),
        durationMs: raw.durationMs,
      });
    } catch (error) {
      items.push({
        itemId: item.id,
        status: "failed",
        detectorCropSha256: item.detectorCropSha256,
        inputSha256: item.input.sha256,
        error:
          error instanceof PdfOmrError
            ? {
                code: error.code,
                reason: typeof error.context?.reason === "string" ? error.context.reason : error.code,
              }
            : { code: "UNEXPECTED", reason: error instanceof Error ? error.message : String(error) },
      });
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
    console.error(JSON.stringify({ engineId, completed: index + 1, total: selectedItems.length }));
  }
} finally {
  await adapter.close?.();
}

const succeeded = items.filter((item) => item.status === "succeeded").length;
const reportBytes = new TextEncoder().encode(
  canonicalJson({
    schemaVersion: "1.0.0",
    detectorVersion: manifest.detectorVersion,
    engine: { id: environment.id, version: environment.version, modelSha256: environment.modelSha256 },
    sourceManifestSha256: sha256Bytes(manifestBytes),
    summary: { attempted: items.length, succeeded, failed: items.length - succeeded },
    items,
  }),
);
await writeFile(resolve(outputPath), reportBytes, { flag: "wx" });
console.log(JSON.stringify({ engineId, attempted: items.length, succeeded, failed: items.length - succeeded }));
