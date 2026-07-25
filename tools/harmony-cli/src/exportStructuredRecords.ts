import { STRUCTURED_FEATURE_VERSION, type ChordSymbolInput, type ScoreWrittenRange } from "@zupulse/web-core";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve, sep } from "node:path";
import { parseDcmlPiece } from "./adapters/dcml";
import { dcmlGroupId } from "./adapters/dcmlEvaluation";
import { assignV3DatasetRole, assertV3CorpusGroups, hashDatasetGroups } from "./evaluationProtocol";
import {
  harmonyDatasetManifestSchema,
  harmonyEvaluationProtocolV3Schema,
  harmonyStructuredRecordsReportSchema,
  type HarmonyStructuredRecordPiece,
  type HarmonyStructuredRecordsReport,
} from "./schemas";
import { createTrainingStructuredRecordPiece, createTuneStructuredRecordPiece } from "./structuredRecords";

export async function exportHarmonyStructuredRecords(options: {
  manifestPath: string;
  protocolPath: string;
  dataRoot: string;
  caseId: string;
  outputPath: string;
  split?: "train" | "tune";
  maxGroups?: number;
}): Promise<{ report: HarmonyStructuredRecordsReport; bytes: number; sha256: string }> {
  const manifest = harmonyDatasetManifestSchema.parse(JSON.parse(await readFile(options.manifestPath, "utf8")));
  const protocol = harmonyEvaluationProtocolV3Schema.parse(JSON.parse(await readFile(options.protocolPath, "utf8")));
  const item = manifest.cases.find((candidate) => candidate.id === options.caseId);
  const policy = protocol.corpora.find((candidate) => candidate.caseId === options.caseId);
  if (!item || item.kind !== "accuracy-corpus") throw new Error(`accuracy dataset case not found: ${options.caseId}`);
  if (item.adapter !== "dcml") throw new Error(`structured records adapter not implemented: ${item.adapter}`);
  if (!policy) throw new Error(`v3 protocol case not found: ${options.caseId}`);
  if (item.source.revision !== policy.sourceRevision) throw new Error(`${options.caseId} protocol revision mismatch`);
  const archiveSha256 = createHash("sha256")
    .update(await readFile(resolveInside(options.dataRoot, item.archivePath)))
    .digest("hex");
  if (archiveSha256 !== item.source.sha256) throw new Error(`${item.id} archive checksum mismatch: ${archiveSha256}`);
  const root = resolveInside(options.dataRoot, item.datasetPath);
  const pieceIds = (await readdir(resolve(root, "harmonies")))
    .filter((name) => name.endsWith(".harmonies.tsv"))
    .map((name) => name.slice(0, -".harmonies.tsv".length))
    .sort();
  const groupMode = item.groupBy ?? "prefix-before-hyphen";
  const allGroups = [...new Set(pieceIds.map((id) => dcmlGroupId(id, groupMode, item.id)))].sort();
  assertV3CorpusGroups(policy, allGroups);
  const split = options.split ?? "train";
  const selectedGroups = allGroups
    .filter((groupId) => assignV3DatasetRole(groupId, policy) === split)
    .slice(0, options.maxGroups);
  const assetDirectoryName = `${basename(options.outputPath)}.pieces`;
  const assetDirectory = resolve(dirname(options.outputPath), assetDirectoryName);
  await mkdir(assetDirectory, { recursive: true });
  const pieces: HarmonyStructuredRecordsReport["pieces"] = [];
  let aggregate = emptyAggregate();
  for (const pieceId of pieceIds) {
    const groupId = dcmlGroupId(pieceId, groupMode, item.id);
    if (!selectedGroups.includes(groupId)) continue;
    if (!/^[A-Za-z0-9._-]+$/.test(pieceId)) throw new Error(`unsafe structured record piece id: ${pieceId}`);
    const piece = parseDcmlPiece({
      corpus: item.id,
      groupId,
      measures: await readFile(resolve(root, `measures/${pieceId}.measures.tsv`), "utf8"),
      notes: await readFile(resolve(root, `notes/${pieceId}.notes.tsv`), "utf8"),
      harmonies: await readFile(resolve(root, `harmonies/${pieceId}.harmonies.tsv`), "utf8"),
    });
    const createPiece = split === "train" ? createTrainingStructuredRecordPiece : createTuneStructuredRecordPiece;
    const recordPiece = createPiece({
      id: pieceId,
      corpus: item.id,
      groupId,
      role: assignV3DatasetRole(groupId, policy),
      input: piece.input,
      includedTrackIds: ["dcml"],
      gold: piece.gold,
    });
    const serialized = `${JSON.stringify(recordPiece)}\n`;
    const fileName = `${pieceId}.json`;
    await writeFile(resolve(assetDirectory, fileName), serialized);
    const summary = summarize(recordPiece);
    pieces.push({
      id: pieceId,
      corpus: item.id,
      groupId,
      path: `${assetDirectoryName}/${fileName}`,
      sha256: createHash("sha256").update(serialized).digest("hex"),
      bytes: Buffer.byteLength(serialized),
      ...summary,
    });
    aggregate = addAggregate(aggregate, summary);
  }
  const report = harmonyStructuredRecordsReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "structured-records",
    split,
    featureVersion: STRUCTURED_FEATURE_VERSION,
    transitionFeatureVersion: STRUCTURED_FEATURE_VERSION,
    groupsSha256: hashDatasetGroups(selectedGroups.map((groupId) => `${item.id}:${groupId}`)),
    searchContract: {
      boundaryPolicy: "dense-note-events",
      spanMode: "quarter-notes",
      maxQuarterNotes: 8,
      topK: 8,
      supervision: "contiguous-representable-subpaths-v1",
    },
    sources: [{ caseId: item.id, revision: item.source.revision, groupsSha256: policy.groupsSha256 }],
    aggregate,
    pieces,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(options.outputPath, serialized);
  return {
    report,
    bytes: Buffer.byteLength(serialized) + pieces.reduce((sum, piece) => sum + piece.bytes, 0),
    sha256: createHash("sha256").update(serialized).digest("hex"),
  };
}

export async function exportHarmonyStructuredRecordsFile(
  options: Parameters<typeof exportHarmonyStructuredRecords>[0],
) {
  const result = await exportHarmonyStructuredRecords(options);
  return {
    command: "structured-records" as const,
    output: options.outputPath,
    pieces: result.report.aggregate.pieces,
    windows: result.report.aggregate.windows,
    ranges: result.report.aggregate.ranges,
    bytes: result.bytes,
    sha256: result.sha256,
  };
}

function summarize(piece: HarmonyStructuredRecordPiece) {
  const windows = piece.windows.length;
  const ranges = piece.windows.reduce((sum, window) => sum + window.ranges.length, 0);
  const candidates = piece.windows.reduce(
    (sum, window) => sum + window.ranges.reduce((rangeSum, range) => rangeSum + range.candidates.length, 0),
    0,
  );
  const goldSegments = piece.windows.reduce((sum, window) => sum + window.gold.length, 0);
  const excludedSegments =
    piece.excluded.unsupported +
    piece.excluded.missingBoundary +
    piece.excluded.excessiveDuration +
    piece.excluded.candidateMiss;
  return { windows, ranges, candidates, goldSegments, excludedSegments };
}

function emptyAggregate(): HarmonyStructuredRecordsReport["aggregate"] {
  return { pieces: 0, windows: 0, ranges: 0, candidates: 0, goldSegments: 0, excludedSegments: 0 };
}

function addAggregate(
  total: HarmonyStructuredRecordsReport["aggregate"],
  piece: ReturnType<typeof summarize>,
): HarmonyStructuredRecordsReport["aggregate"] {
  return {
    pieces: total.pieces + 1,
    windows: total.windows + piece.windows,
    ranges: total.ranges + piece.ranges,
    candidates: total.candidates + piece.candidates,
    goldSegments: total.goldSegments + piece.goldSegments,
    excludedSegments: total.excludedSegments + piece.excludedSegments,
  };
}

function resolveInside(root: string, path: string): string {
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, path);
  if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${sep}`))
    throw new Error(`dataset path escapes root: ${path}`);
  return target;
}
