import { HARMONY_BOUNDARY_FEATURE_VERSION } from "@zupulse/web-core";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { parseDcmlPiece } from "./adapters/dcml";
import { dcmlGroupId } from "./adapters/dcmlEvaluation";
import { parsePop909Piece } from "./adapters/pop909";
import { createBoundaryEvaluationRecords, createBoundaryTrainingRecords } from "./boundaryRecords";
import { assignV3DatasetRole, assertV3CorpusGroups, hashDatasetGroups } from "./evaluationProtocol";
import {
  harmonyBoundaryRecordsReportSchema,
  harmonyDatasetManifestSchema,
  harmonyEvaluationProtocolV3Schema,
  type HarmonyBoundaryRecordsReport,
} from "./schemas";

export async function exportHarmonyBoundaryRecords(options: {
  manifestPath: string;
  protocolPath: string;
  dataRoot: string;
  caseId: string;
  maxTrainGroups?: number;
  split?: "train" | "tune";
}): Promise<HarmonyBoundaryRecordsReport> {
  const manifest = harmonyDatasetManifestSchema.parse(JSON.parse(await readFile(options.manifestPath, "utf8")));
  const protocol = harmonyEvaluationProtocolV3Schema.parse(JSON.parse(await readFile(options.protocolPath, "utf8")));
  const item = manifest.cases.find((candidate) => candidate.id === options.caseId);
  const policy = protocol.corpora.find((candidate) => candidate.caseId === options.caseId);
  if (!item || item.kind !== "accuracy-corpus") throw new Error(`accuracy dataset case not found: ${options.caseId}`);
  if (!policy) throw new Error(`v3 protocol case not found: ${options.caseId}`);
  if (item.source.revision !== policy.sourceRevision) throw new Error(`${options.caseId} protocol revision mismatch`);
  const archiveSha256 = createHash("sha256")
    .update(await readFile(resolveInside(options.dataRoot, item.archivePath)))
    .digest("hex");
  if (archiveSha256 !== item.source.sha256) throw new Error(`${item.id} archive checksum mismatch: ${archiveSha256}`);
  const root = resolveInside(options.dataRoot, item.datasetPath);
  const split = options.split ?? "train";
  const allGroups = await listGroups(root, item);
  assertV3CorpusGroups(policy, allGroups);
  const selected = allGroups
    .filter((group) => assignV3DatasetRole(group, policy) === split)
    .sort()
    .slice(0, options.maxTrainGroups);
  const records = [];
  if (item.adapter === "dcml") {
    const pieceIds = (await readdir(resolve(root, "harmonies")))
      .filter((name) => name.endsWith(".harmonies.tsv"))
      .map((name) => name.slice(0, -".harmonies.tsv".length))
      .sort();
    for (const pieceId of pieceIds) {
      const groupId = dcmlGroupId(pieceId, item.groupBy ?? "prefix-before-hyphen", item.id);
      if (!selected.includes(groupId)) continue;
      const piece = parseDcmlPiece({
        corpus: item.id,
        groupId,
        measures: await readFile(resolve(root, `measures/${pieceId}.measures.tsv`), "utf8"),
        notes: await readFile(resolve(root, `notes/${pieceId}.notes.tsv`), "utf8"),
        harmonies: await readFile(resolve(root, `harmonies/${pieceId}.harmonies.tsv`), "utf8"),
      });
      records.push(
        ...(split === "train" ? createBoundaryTrainingRecords : createBoundaryEvaluationRecords)({
          corpus: item.id,
          groupId,
          role: assignV3DatasetRole(groupId, policy),
          input: piece.input,
          includedTrackIds: ["dcml"],
          gold: piece.gold,
        }),
      );
    }
  } else {
    for (const groupId of selected) {
      const directory = resolve(root, groupId);
      const piece = parsePop909Piece({
        corpus: item.id,
        groupId,
        midi: await readFile(resolve(directory, `${groupId}.mid`)),
        beats: await readFile(resolve(directory, "beat_midi.txt"), "utf8"),
        chords: await readFile(resolve(directory, "chord_midi.txt"), "utf8"),
      });
      records.push(
        ...(split === "train" ? createBoundaryTrainingRecords : createBoundaryEvaluationRecords)({
          corpus: item.id,
          groupId,
          role: assignV3DatasetRole(groupId, policy),
          input: piece.input,
          includedTrackIds: ["pop909"],
          gold: piece.gold,
        }),
      );
    }
  }
  return harmonyBoundaryRecordsReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "boundary-records",
    split,
    featureVersion: HARMONY_BOUNDARY_FEATURE_VERSION,
    groupsSha256: hashDatasetGroups(selected.map((group) => `${item.id}:${group}`)),
    sources: [{ caseId: item.id, revision: item.source.revision, groupsSha256: policy.groupsSha256 }],
    records: records.sort((a, b) => a.id.localeCompare(b.id)),
  });
}

export async function exportHarmonyBoundaryRecordsFile(
  options: Parameters<typeof exportHarmonyBoundaryRecords>[0] & { outputPath: string },
) {
  const report = await exportHarmonyBoundaryRecords(options);
  await writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return {
    command: "boundary-records" as const,
    output: options.outputPath,
    records: report.records.length,
    positives: report.records.filter((record) => record.target === 1).length,
  };
}

type AccuracyCase = Extract<
  ReturnType<typeof harmonyDatasetManifestSchema.parse>["cases"][number],
  { kind: "accuracy-corpus" }
>;

async function listGroups(root: string, item: AccuracyCase): Promise<string[]> {
  if (item.adapter === "pop909")
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^\d{3}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  const pieceIds = (await readdir(resolve(root, "harmonies")))
    .filter((name) => name.endsWith(".harmonies.tsv"))
    .map((name) => name.slice(0, -".harmonies.tsv".length));
  return [...new Set(pieceIds.map((id) => dcmlGroupId(id, item.groupBy ?? "prefix-before-hyphen", item.id)))].sort();
}

function resolveInside(root: string, path: string): string {
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, path);
  if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${sep}`))
    throw new Error(`dataset path escapes root: ${path}`);
  return target;
}
