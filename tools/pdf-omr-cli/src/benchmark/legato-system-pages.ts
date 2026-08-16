import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { z } from "zod";
import { canonicalJson, sha256Bytes } from "../canonical-json";
import { PdfOmrError } from "../errors";
import { encodeRgbaPagesAsPdf } from "../raster-pdf";
import { renderPdfPages } from "../render-pdf-pages";
import { sha256Schema } from "../schemas";
import {
  STAFF_SYSTEM_SEGMENTATION_PARAMETERS,
  segmentStaffSystems,
  type StaffSystem,
} from "../staff-system-segmentation";
import { verifyCorpusManifest, type CorpusItem, type CorpusManifest } from "./corpus";

const systemEvidenceSchema = z
  .object({
    pageIndex: z.number().int().nonnegative(),
    systemIndex: z.number().int().nonnegative(),
    staffLayout: z.enum(["single-staff", "grand-staff"]),
    cropSha256: sha256Schema,
    pixelBBox: z
      .object({
        x: z.number().int().nonnegative(),
        y: z.number().int().nonnegative(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

export const legatoSystemPagesMaterializationSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    preprocess: z
      .object({
        id: z.literal("legato-system-pages"),
        version: z.literal(STAFF_SYSTEM_SEGMENTATION_PARAMETERS.detectorVersion),
        parametersSha256: sha256Schema,
      })
      .strict(),
    source: z
      .object({
        corpusId: z.string().min(1),
        manifestSha256: sha256Schema,
      })
      .strict(),
    output: z
      .object({
        corpusId: z.string().min(1),
        manifestSha256: sha256Schema,
      })
      .strict(),
    items: z.array(
      z
        .object({
          itemId: z.string().min(1),
          sourceInputSha256: sha256Schema,
          materializedInputSha256: sha256Schema,
          systems: z.array(systemEvidenceSchema).min(1),
        })
        .strict(),
    ),
  })
  .strict();

export async function materializeLegatoSystemPages(input: {
  manifestPath: string;
  outputDirectory: string;
}): Promise<{ manifestPath: string; materializationPath: string; manifestSha256: string; itemCount: number }> {
  const manifestPath = resolve(input.manifestPath);
  const outputDirectory = resolve(input.outputDirectory);
  const sourceManifestBytes = await readFile(manifestPath).catch((error: unknown) => {
    throw invalidMaterialization("source-manifest-unreadable", error);
  });
  let sourceManifest: CorpusManifest;
  try {
    sourceManifest = verifyCorpusManifest(JSON.parse(new TextDecoder().decode(sourceManifestBytes)));
  } catch (error) {
    throw invalidMaterialization("source-manifest-invalid", error);
  }
  if (sourceManifest.execution !== undefined) {
    throw invalidMaterialization("profiled-manifest-not-supported");
  }
  const items = sourceManifest.items
    .filter((item) => item.split === "development")
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  if (items.length === 0) throw invalidMaterialization("development-items-missing");
  const unsupported = items.find((item) => item.inputScope === "system-crop");
  if (unsupported !== undefined) {
    throw invalidMaterialization("source-system-crop-not-supported", undefined, { itemId: unsupported.id });
  }
  try {
    await mkdir(outputDirectory);
    await Promise.all([mkdir(join(outputDirectory, "inputs")), mkdir(join(outputDirectory, "ground-truth"))]);
  } catch (error) {
    throw invalidMaterialization("output-exists-or-unwritable", error);
  }

  const corpusRoot = dirname(manifestPath);
  const copiedGroundTruth = new Set<string>();
  const materializationItems: Array<{
    itemId: string;
    sourceInputSha256: string;
    materializedInputSha256: string;
    systems: ReturnType<typeof systemEvidence>[];
  }> = [];
  const outputItems: CorpusItem[] = [];
  for (const item of items) {
    const sourceInputBytes = await readVerified(corpusRoot, item.input.path, item.input.sha256, item.id, "input");
    const groundTruthBytes = await readVerified(
      corpusRoot,
      item.groundTruth.path,
      item.groundTruth.sha256,
      item.id,
      "ground-truth",
    );
    const pages = await renderPdfPages(sourceInputBytes, { targetWidth: 1400, allowLandscape: true });
    const segmentation = segmentStaffSystems(pages, {
      allowFragmentedRuns: true,
      staffLayout: item.staffLayout ?? "auto",
    });
    const systems = [...segmentation.systems].sort(
      (left, right) => left.pageIndex - right.pageIndex || left.systemIndex - right.systemIndex,
    );
    if (systems.length > 32) {
      throw invalidMaterialization("legato-page-limit-exceeded", undefined, {
        itemId: item.id,
        systemCount: systems.length,
      });
    }
    const materializedInputBytes = encodeRgbaPagesAsPdf(
      systems.map((system) => ({
        width: system.pixelBBox.width,
        height: system.pixelBBox.height,
        pixels: system.cropPixels,
      })),
    );
    const materializedInputSha256 = sha256Bytes(materializedInputBytes);
    const inputPath = `inputs/${item.id}.pdf`;
    await writeFile(join(outputDirectory, inputPath), materializedInputBytes, { flag: "wx" });

    const extension = extname(item.groundTruth.path).toLowerCase();
    const groundTruthPath = `ground-truth/${item.groundTruth.sha256}${extension}`;
    if (!copiedGroundTruth.has(groundTruthPath)) {
      await writeFile(join(outputDirectory, groundTruthPath), groundTruthBytes, { flag: "wx" });
      copiedGroundTruth.add(groundTruthPath);
    }
    const {
      input: _sourceInput,
      groundTruth: _sourceGroundTruth,
      inputScope: _inputScope,
      staffLayout: _staffLayout,
      ...identity
    } = item;
    outputItems.push({
      ...identity,
      input: { path: inputPath, sha256: materializedInputSha256 },
      groundTruth: { ...item.groundTruth, path: groundTruthPath },
    });
    materializationItems.push({
      itemId: item.id,
      sourceInputSha256: item.input.sha256,
      materializedInputSha256,
      systems: systems.map(systemEvidence),
    });
  }

  const outputManifest = verifyCorpusManifest({
    schemaVersion: "1.0.0",
    corpusId: `${sourceManifest.corpusId}-legato-system-pages-v1`,
    protocolVersion: sourceManifest.protocolVersion,
    items: outputItems,
  });
  const outputManifestBytes = new TextEncoder().encode(canonicalJson(outputManifest));
  const manifestSha256 = sha256Bytes(outputManifestBytes);
  const outputManifestPath = join(outputDirectory, "manifest.json");
  await writeFile(outputManifestPath, outputManifestBytes, { flag: "wx" });
  const materialization = legatoSystemPagesMaterializationSchema.parse({
    schemaVersion: "1.0.0",
    preprocess: {
      id: "legato-system-pages",
      version: STAFF_SYSTEM_SEGMENTATION_PARAMETERS.detectorVersion,
      parametersSha256: sha256Bytes(new TextEncoder().encode(canonicalJson(STAFF_SYSTEM_SEGMENTATION_PARAMETERS))),
    },
    source: {
      corpusId: sourceManifest.corpusId,
      manifestSha256: sha256Bytes(sourceManifestBytes),
    },
    output: {
      corpusId: outputManifest.corpusId,
      manifestSha256,
    },
    items: materializationItems,
  });
  const materializationPath = join(outputDirectory, "materialization.json");
  await writeFile(materializationPath, canonicalJson(materialization), { flag: "wx" });
  return {
    manifestPath: outputManifestPath,
    materializationPath,
    manifestSha256,
    itemCount: outputItems.length,
  };
}

async function readVerified(
  corpusRoot: string,
  relativePath: string,
  expectedSha256: string,
  itemId: string,
  role: "input" | "ground-truth",
): Promise<Uint8Array> {
  const bytes = await readFile(join(corpusRoot, relativePath)).catch((error: unknown) => {
    throw invalidMaterialization(`${role}-unreadable`, error, { itemId });
  });
  if (sha256Bytes(bytes) !== expectedSha256) {
    throw invalidMaterialization(`${role}-hash-mismatch`, undefined, { itemId });
  }
  return bytes;
}

function systemEvidence(system: StaffSystem) {
  return {
    pageIndex: system.pageIndex,
    systemIndex: system.systemIndex,
    staffLayout: system.staffLayout,
    cropSha256: system.cropSha256,
    pixelBBox: system.pixelBBox,
  };
}

function invalidMaterialization(
  reason: string,
  cause?: unknown,
  context: Readonly<Record<string, unknown>> = {},
): PdfOmrError {
  return new PdfOmrError("INVALID_INPUT", "LEGATO system pages cannot be materialized", {
    context: { reason, ...context },
    ...(cause === undefined ? {} : { cause }),
  });
}
