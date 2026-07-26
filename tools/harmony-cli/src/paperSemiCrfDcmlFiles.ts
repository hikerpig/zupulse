import {
  PAPER_SEMI_CRF_FEATURE_VERSION,
  PAPER_SEMI_CRF_LABEL_MAPPING_VERSION,
  paperSemiCrfChordToLabel,
} from "@zupulse/web-core";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { z } from "zod";
import { parseDcmlPiece, type DcmlPiece } from "./adapters/dcml";
import { dcmlGroupId } from "./adapters/dcmlEvaluation";
import { assignV3DatasetRole, assertV3CorpusGroups, hashDatasetGroups } from "./evaluationProtocol";
import { projectDcmlPieceToPaperSemiCrfWindows } from "./paperSemiCrfDcmlRecords";
import {
  paperSemiCrfRecordsFileSchema,
  parsePaperSemiCrfTrainingRecords,
  type PaperSemiCrfRecordsFile,
} from "./paperSemiCrfRecords";
import { harmonyDatasetManifestSchema, harmonyEvaluationProtocolV3Schema } from "./schemas";

const statsSchema = z
  .object({
    pieces: z.number().int().nonnegative(),
    gold: z.number().int().nonnegative(),
    supported: z.number().int().nonnegative(),
    excludedUnsupported: z.number().int().nonnegative(),
    excludedUnaligned: z.number().int().nonnegative(),
    excludedOverSpan: z.number().int().nonnegative(),
    windows: z.number().int().nonnegative(),
    events: z.number().int().nonnegative(),
  })
  .strict();

const paperSemiCrfDcmlReportSchema = z
  .object({
    schemaVersion: z.literal("paper-semi-crf-dcml-report-v1"),
    command: z.literal("paper-semi-crf-dcml-records"),
    caseId: z.string().min(1),
    sourceRevision: z.string().min(1),
    split: z.enum(["train", "tune"]),
    groupsSha256: z.string().regex(/^[a-f0-9]{64}$/),
    recordsSha256: z.string().regex(/^[a-f0-9]{64}$/),
    labelMappingVersion: z.literal(PAPER_SEMI_CRF_LABEL_MAPPING_VERSION),
    featureVersion: z.literal(PAPER_SEMI_CRF_FEATURE_VERSION),
    maxSegmentLength: z.number().int().positive(),
    labels: z.number().int().positive(),
    stats: statsSchema,
  })
  .strict();

export async function exportPaperSemiCrfDcmlRecordsFile(options: {
  manifestPath: string;
  protocolPath: string;
  dataRoot: string;
  caseId: string;
  split: "train" | "tune";
  outputPath: string;
  reportPath: string;
  maxSegmentLength: number;
  labelOrderRecordsPath?: string;
}) {
  const manifest = harmonyDatasetManifestSchema.parse(JSON.parse(await readFile(options.manifestPath, "utf8")));
  const protocol = harmonyEvaluationProtocolV3Schema.parse(JSON.parse(await readFile(options.protocolPath, "utf8")));
  const item = manifest.cases.find((candidate) => candidate.id === options.caseId);
  const policy = protocol.corpora.find((candidate) => candidate.caseId === options.caseId);
  if (!item || item.kind !== "accuracy-corpus") throw new Error(`accuracy dataset case not found: ${options.caseId}`);
  if (item.adapter !== "dcml") throw new Error(`paper Semi-CRF records adapter not implemented: ${item.adapter}`);
  if (!policy) throw new Error(`v3 protocol case not found: ${options.caseId}`);
  if (item.source.revision !== policy.sourceRevision) throw new Error(`${options.caseId} protocol revision mismatch`);
  const archiveSha256 = sha256(await readFile(resolveInside(options.dataRoot, item.archivePath)));
  if (archiveSha256 !== item.source.sha256) throw new Error(`${item.id} archive checksum mismatch: ${archiveSha256}`);
  const root = resolveInside(options.dataRoot, item.datasetPath);
  const pieceIds = (await readdir(resolve(root, "harmonies")))
    .filter((name) => name.endsWith(".harmonies.tsv"))
    .map((name) => name.slice(0, -".harmonies.tsv".length))
    .sort();
  const groupMode = item.groupBy ?? "prefix-before-hyphen";
  const allGroups = [...new Set(pieceIds.map((id) => dcmlGroupId(id, groupMode, item.id)))].sort();
  assertV3CorpusGroups(policy, allGroups);
  const selectedGroups = allGroups.filter((groupId) => assignV3DatasetRole(groupId, policy) === options.split);
  const pieces: Array<{ pieceId: string; piece: DcmlPiece }> = [];
  for (const pieceId of pieceIds) {
    const groupId = dcmlGroupId(pieceId, groupMode, item.id);
    if (!selectedGroups.includes(groupId)) continue;
    pieces.push({
      pieceId,
      piece: parseDcmlPiece({
        corpus: item.id,
        groupId,
        measures: await readFile(resolve(root, `measures/${pieceId}.measures.tsv`), "utf8"),
        notes: await readFile(resolve(root, `notes/${pieceId}.notes.tsv`), "utf8"),
        harmonies: await readFile(resolve(root, `harmonies/${pieceId}.harmonies.tsv`), "utf8"),
      }),
    });
  }
  const labels = await labelInventory(options, pieces);
  const stats = {
    pieces: pieces.length,
    gold: 0,
    supported: 0,
    excludedUnsupported: 0,
    excludedUnaligned: 0,
    excludedOverSpan: 0,
    windows: 0,
    events: 0,
  };
  const records = pieces.flatMap(({ pieceId, piece }) => {
    const projected = projectDcmlPieceToPaperSemiCrfWindows({
      pieceId,
      piece,
      labels,
      maxSegmentLength: options.maxSegmentLength,
    });
    for (const key of [
      "gold",
      "supported",
      "excludedUnsupported",
      "excludedUnaligned",
      "excludedOverSpan",
      "windows",
      "events",
    ] as const) {
      stats[key] += projected.stats[key];
    }
    return projected.records;
  });
  const recordsFile = paperSemiCrfRecordsFileSchema.parse({
    schemaVersion: "paper-semi-crf-records-v1",
    command: "paper-semi-crf-records",
    role: options.split,
    labelMappingVersion: PAPER_SEMI_CRF_LABEL_MAPPING_VERSION,
    featureVersion: PAPER_SEMI_CRF_FEATURE_VERSION,
    labels,
    maxSegmentLength: options.maxSegmentLength,
    records,
  });
  const recordsText = `${JSON.stringify(recordsFile)}\n`;
  const report = paperSemiCrfDcmlReportSchema.parse({
    schemaVersion: "paper-semi-crf-dcml-report-v1",
    command: "paper-semi-crf-dcml-records",
    caseId: item.id,
    sourceRevision: item.source.revision,
    split: options.split,
    groupsSha256: hashDatasetGroups(selectedGroups.map((groupId) => `${item.id}:${groupId}`)),
    recordsSha256: sha256(recordsText),
    labelMappingVersion: PAPER_SEMI_CRF_LABEL_MAPPING_VERSION,
    featureVersion: PAPER_SEMI_CRF_FEATURE_VERSION,
    maxSegmentLength: options.maxSegmentLength,
    labels: labels.length,
    stats,
  });
  await Promise.all([
    writeFile(options.outputPath, recordsText),
    writeFile(options.reportPath, `${JSON.stringify(report, null, 2)}\n`),
  ]);
  return { ...report, output: options.outputPath, report: options.reportPath };
}

async function labelInventory(
  options: Parameters<typeof exportPaperSemiCrfDcmlRecordsFile>[0],
  pieces: readonly { piece: DcmlPiece }[],
): Promise<string[]> {
  if (options.split === "tune") {
    if (options.labelOrderRecordsPath === undefined) {
      throw new Error("tune paper Semi-CRF DCML records require --label-order-records");
    }
    return parsePaperSemiCrfTrainingRecords(JSON.parse(await readFile(options.labelOrderRecordsPath, "utf8"))).labels;
  }
  if (options.labelOrderRecordsPath !== undefined) {
    throw new Error("train paper Semi-CRF DCML records cannot use --label-order-records");
  }
  const labels = new Set<string>();
  for (const { piece } of pieces) {
    for (const gold of piece.gold) {
      try {
        if (gold.chord !== undefined) labels.add(paperSemiCrfChordToLabel(gold.chord));
      } catch {
        // Unsupported gold is reported and splits representable windows.
      }
    }
  }
  return [...labels];
}

function sha256(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

function resolveInside(root: string, path: string): string {
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, path);
  if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${sep}`)) {
    throw new Error(`dataset path escapes root: ${path}`);
  }
  return target;
}
