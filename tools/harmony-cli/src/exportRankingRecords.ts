import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { dcmlGroupId } from "./adapters/dcmlEvaluation";
import { parseDcmlPiece } from "./adapters/dcml";
import { parsePop909Piece } from "./adapters/pop909";
import { assignV3DatasetRole, assertV3CorpusGroups, hashDatasetGroups, type V3DatasetRole } from "./evaluationProtocol";
import { createHarmonyRankingRecords } from "./rankingRecords";
import {
  harmonyDatasetManifestSchema,
  harmonyEvaluationProtocolV3Schema,
  harmonyRankingRecordsReportSchema,
  type HarmonyRankingRecordsReport,
} from "./schemas";

export async function exportHarmonyRankingRecords(options: {
  manifestPath: string;
  protocolPath: string;
  dataRoot: string;
  caseId: string;
  maxTrainGroups?: number;
}): Promise<HarmonyRankingRecordsReport> {
  const manifest = harmonyDatasetManifestSchema.parse(JSON.parse(await readFile(options.manifestPath, "utf8")));
  const protocol = harmonyEvaluationProtocolV3Schema.parse(JSON.parse(await readFile(options.protocolPath, "utf8")));
  const item = manifest.cases.find((candidate) => candidate.id === options.caseId);
  const policy = protocol.corpora.find((candidate) => candidate.caseId === options.caseId);
  if (!item || item.kind !== "accuracy-corpus") throw new Error(`accuracy dataset case not found: ${options.caseId}`);
  if (!policy) throw new Error(`v3 protocol case not found: ${options.caseId}`);
  if (item.source.revision !== policy.sourceRevision) throw new Error(`${options.caseId} protocol revision mismatch`);
  const archive = await readFile(resolveInside(options.dataRoot, item.archivePath));
  const archiveSha256 = createHash("sha256").update(archive).digest("hex");
  if (archiveSha256 !== item.source.sha256) throw new Error(`${item.id} archive checksum mismatch: ${archiveSha256}`);
  const datasetPath = resolveInside(options.dataRoot, item.datasetPath);
  const loaded =
    item.adapter === "dcml"
      ? await loadDcmlRecords(datasetPath, item, policy, options.maxTrainGroups)
      : await loadPop909Records(datasetPath, item, policy, options.maxTrainGroups);
  const records = loaded.records.sort((a, b) => a.id.localeCompare(b.id));
  return harmonyRankingRecordsReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "ranking-records",
    featureVersion: "relative-pc-presence-v1",
    trainingGroupsSha256: hashDatasetGroups(loaded.trainingGroups.map((group) => `${item.id}:${group}`)),
    sources: [{ caseId: item.id, revision: item.source.revision, groupsSha256: policy.groupsSha256 }],
    records,
  });
}

export async function exportHarmonyRankingRecordsFile(
  options: Parameters<typeof exportHarmonyRankingRecords>[0] & { outputPath: string },
): Promise<{ command: "ranking-records"; output: string; records: number; oracleHits: number; oracleMisses: number }> {
  const report = await exportHarmonyRankingRecords(options);
  await writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return {
    command: "ranking-records",
    output: options.outputPath,
    records: report.records.length,
    oracleHits: report.records.filter((record) => record.outcome === "oracle-hit").length,
    oracleMisses: report.records.filter((record) => record.outcome === "oracle-miss").length,
  };
}

type AccuracyCase = Extract<
  ReturnType<typeof harmonyDatasetManifestSchema.parse>["cases"][number],
  { kind: "accuracy-corpus" }
>;
type ProtocolCorpus = ReturnType<typeof harmonyEvaluationProtocolV3Schema.parse>["corpora"][number];

async function loadDcmlRecords(root: string, item: AccuracyCase, policy: ProtocolCorpus, maxTrainGroups?: number) {
  const pieceIds = (await readdir(resolve(root, "harmonies")))
    .filter((name) => name.endsWith(".harmonies.tsv"))
    .map((name) => name.slice(0, -".harmonies.tsv".length))
    .sort();
  const allPieceIds = (await readdir(resolve(root, "harmonies")))
    .filter((name) => name.endsWith(".harmonies.tsv"))
    .map((name) => name.slice(0, -".harmonies.tsv".length));
  const groupMode = item.groupBy ?? "prefix-before-hyphen";
  const allGroups = [...new Set(allPieceIds.map((id) => dcmlGroupId(id, groupMode, item.id)))];
  assertV3CorpusGroups(policy, allGroups);
  const selectedGroups = selectTrainingGroups(allGroups, policy, maxTrainGroups);
  const records = [];
  const trainingGroups = new Set<string>();
  for (const pieceId of pieceIds) {
    const groupId = dcmlGroupId(pieceId, groupMode, item.id);
    const role = assignV3DatasetRole(groupId, policy);
    if (!selectedGroups.has(groupId)) continue;
    trainingGroups.add(groupId);
    const piece = parseDcmlPiece({
      corpus: item.id,
      groupId,
      measures: await readFile(resolve(root, `measures/${pieceId}.measures.tsv`), "utf8"),
      notes: await readFile(resolve(root, `notes/${pieceId}.notes.tsv`), "utf8"),
      harmonies: await readFile(resolve(root, `harmonies/${pieceId}.harmonies.tsv`), "utf8"),
    });
    records.push(
      ...createHarmonyRankingRecords({
        corpus: item.id,
        groupId,
        role,
        input: piece.input,
        includedTrackIds: ["dcml"],
        gold: piece.gold,
      }),
    );
  }
  return { records, trainingGroups: [...trainingGroups].sort() };
}

async function loadPop909Records(root: string, item: AccuracyCase, policy: ProtocolCorpus, maxTrainGroups?: number) {
  const allGroups = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d{3}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  assertV3CorpusGroups(policy, allGroups);
  const selectedGroups = selectTrainingGroups(allGroups, policy, maxTrainGroups);
  const groups = allGroups.filter((group) => selectedGroups.has(group));
  const records = [];
  const trainingGroups: string[] = [];
  for (const groupId of groups) {
    const role: V3DatasetRole = assignV3DatasetRole(groupId, policy);
    if (role !== "train") continue;
    trainingGroups.push(groupId);
    const directory = resolve(root, groupId);
    const piece = parsePop909Piece({
      corpus: item.id,
      groupId,
      midi: await readFile(resolve(directory, `${groupId}.mid`)),
      beats: await readFile(resolve(directory, "beat_midi.txt"), "utf8"),
      chords: await readFile(resolve(directory, "chord_midi.txt"), "utf8"),
    });
    records.push(
      ...createHarmonyRankingRecords({
        corpus: item.id,
        groupId,
        role,
        input: piece.input,
        includedTrackIds: ["pop909"],
        gold: piece.gold,
      }),
    );
  }
  return { records, trainingGroups };
}

function selectTrainingGroups(
  allGroups: readonly string[],
  policy: ProtocolCorpus,
  maxTrainGroups?: number,
): Set<string> {
  const train = allGroups.filter((group) => assignV3DatasetRole(group, policy) === "train").sort();
  return new Set(maxTrainGroups === undefined ? train : train.slice(0, maxTrainGroups));
}

function resolveInside(root: string, path: string): string {
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, path);
  if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${sep}`))
    throw new Error(`dataset path escapes root: ${path}`);
  return target;
}
