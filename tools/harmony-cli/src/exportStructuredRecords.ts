import { STRUCTURED_FEATURE_VERSION } from "@zupulse/web-core";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { parseDcmlPiece } from "./adapters/dcml";
import { dcmlGroupId } from "./adapters/dcmlEvaluation";
import { assignV3DatasetRole, assertV3CorpusGroups, hashDatasetGroups } from "./evaluationProtocol";
import {
  harmonyDatasetManifestSchema,
  harmonyEvaluationProtocolV3Schema,
  harmonyStructuredRecordsReportSchema,
  type HarmonyStructuredRecordsReport,
} from "./schemas";
import { createTrainingStructuredRecordPiece, createTuneStructuredRecordPiece } from "./structuredRecords";

export async function exportHarmonyStructuredRecords(options: {
  manifestPath: string;
  protocolPath: string;
  dataRoot: string;
  caseId: string;
  split?: "train" | "tune";
  maxGroups?: number;
}): Promise<HarmonyStructuredRecordsReport> {
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
  const pieces = [];
  for (const pieceId of pieceIds) {
    const groupId = dcmlGroupId(pieceId, groupMode, item.id);
    if (!selectedGroups.includes(groupId)) continue;
    const piece = parseDcmlPiece({
      corpus: item.id,
      groupId,
      measures: await readFile(resolve(root, `measures/${pieceId}.measures.tsv`), "utf8"),
      notes: await readFile(resolve(root, `notes/${pieceId}.notes.tsv`), "utf8"),
      harmonies: await readFile(resolve(root, `harmonies/${pieceId}.harmonies.tsv`), "utf8"),
    });
    const createPiece = split === "train" ? createTrainingStructuredRecordPiece : createTuneStructuredRecordPiece;
    pieces.push(
      createPiece({
        id: pieceId,
        corpus: item.id,
        groupId,
        role: assignV3DatasetRole(groupId, policy),
        input: piece.input,
        includedTrackIds: ["dcml"],
        gold: piece.gold,
      }),
    );
  }
  return harmonyStructuredRecordsReportSchema.parse({
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
    aggregate: aggregate(pieces),
    pieces,
  });
}

export async function exportHarmonyStructuredRecordsFile(
  options: Parameters<typeof exportHarmonyStructuredRecords>[0] & { outputPath: string },
) {
  const report = await exportHarmonyStructuredRecords(options);
  const serialized = `${JSON.stringify(report)}\n`;
  await writeFile(options.outputPath, serialized);
  return {
    command: "structured-records" as const,
    output: options.outputPath,
    pieces: report.aggregate.pieces,
    windows: report.aggregate.windows,
    ranges: report.aggregate.ranges,
    bytes: Buffer.byteLength(serialized),
    sha256: createHash("sha256").update(serialized).digest("hex"),
  };
}

function aggregate(pieces: HarmonyStructuredRecordsReport["pieces"]): HarmonyStructuredRecordsReport["aggregate"] {
  return pieces.reduce(
    (total, piece) => ({
      pieces: total.pieces + 1,
      windows: total.windows + piece.windows.length,
      ranges: total.ranges + piece.windows.reduce((sum, window) => sum + window.ranges.length, 0),
      candidates:
        total.candidates +
        piece.windows.reduce(
          (sum, window) => sum + window.ranges.reduce((rangeSum, range) => rangeSum + range.candidates.length, 0),
          0,
        ),
      goldSegments: total.goldSegments + piece.windows.reduce((sum, window) => sum + window.gold.length, 0),
      excludedSegments:
        total.excludedSegments +
        piece.excluded.unsupported +
        piece.excluded.missingBoundary +
        piece.excluded.excessiveDuration +
        piece.excluded.candidateMiss,
    }),
    { pieces: 0, windows: 0, ranges: 0, candidates: 0, goldSegments: 0, excludedSegments: 0 },
  );
}

function resolveInside(root: string, path: string): string {
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, path);
  if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${sep}`))
    throw new Error(`dataset path escapes root: ${path}`);
  return target;
}
