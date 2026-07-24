import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { parseDcmlPiece } from "./adapters/dcml";
import { dcmlGroupId } from "./adapters/dcmlEvaluation";
import { assignV3DatasetRole, assertV3CorpusGroups, hashDatasetGroups } from "./evaluationProtocol";
import {
  harmonyDatasetManifestSchema,
  harmonyEvaluationProtocolV3Schema,
  harmonyStructuredOracleReportSchema,
  type HarmonyStructuredOracleReport,
} from "./schemas";
import { evaluateStructuredTrainingOracle, evaluateStructuredTuneOracle } from "./structuredOracle";

export async function exportHarmonyStructuredOracle(options: {
  manifestPath: string;
  protocolPath: string;
  dataRoot: string;
  caseId: string;
  split?: "train" | "tune";
  maxSpan?: number;
  topK?: number;
}): Promise<HarmonyStructuredOracleReport> {
  const manifest = harmonyDatasetManifestSchema.parse(JSON.parse(await readFile(options.manifestPath, "utf8")));
  const protocol = harmonyEvaluationProtocolV3Schema.parse(JSON.parse(await readFile(options.protocolPath, "utf8")));
  const item = manifest.cases.find((candidate) => candidate.id === options.caseId);
  const policy = protocol.corpora.find((candidate) => candidate.caseId === options.caseId);
  if (!item || item.kind !== "accuracy-corpus") throw new Error(`accuracy dataset case not found: ${options.caseId}`);
  if (item.adapter !== "dcml") throw new Error(`structured oracle adapter not implemented: ${item.adapter}`);
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
  const selectedGroups = allGroups.filter((groupId) => assignV3DatasetRole(groupId, policy) === split);
  const maxSpan = options.maxSpan ?? 16;
  const topK = options.topK ?? 8;
  const pieces = [];
  for (const pieceId of pieceIds) {
    const groupId = dcmlGroupId(pieceId, groupMode, item.id);
    if (!selectedGroups.includes(groupId)) continue;
    const role = assignV3DatasetRole(groupId, policy);
    const piece = parseDcmlPiece({
      corpus: item.id,
      groupId,
      measures: await readFile(resolve(root, `measures/${pieceId}.measures.tsv`), "utf8"),
      notes: await readFile(resolve(root, `notes/${pieceId}.notes.tsv`), "utf8"),
      harmonies: await readFile(resolve(root, `harmonies/${pieceId}.harmonies.tsv`), "utf8"),
    });
    pieces.push(
      ...(split === "train" ? [evaluateStructuredTrainingOracle] : [evaluateStructuredTuneOracle]).map((evaluate) =>
        evaluate({
          corpus: item.id,
          groupId,
          role,
          input: piece.input,
          includedTrackIds: ["dcml"],
          gold: piece.gold,
          maxSpan,
          topK,
        }),
      ),
    );
  }
  return harmonyStructuredOracleReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "structured-oracle",
    split,
    groupsSha256: hashDatasetGroups(selectedGroups.map((groupId) => `${item.id}:${groupId}`)),
    searchContract: { boundaryPolicy: "dense-note-events", maxSpan, topK },
    sources: [{ caseId: item.id, revision: item.source.revision, groupsSha256: policy.groupsSha256 }],
    aggregate: aggregate(pieces),
    pieces,
  });
}

export async function exportHarmonyStructuredOracleFile(
  options: Parameters<typeof exportHarmonyStructuredOracle>[0] & { outputPath: string },
) {
  const report = await exportHarmonyStructuredOracle(options);
  await writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return {
    command: "structured-oracle" as const,
    output: options.outputPath,
    pieces: report.aggregate.pieces,
    mappedSegments: report.aggregate.mappedSegments,
    pathRatio: report.aggregate.pathRatio,
  };
}

function aggregate(pieces: HarmonyStructuredOracleReport["pieces"]): HarmonyStructuredOracleReport["aggregate"] {
  const sum = pieces.reduce(
    (total, piece) => ({
      mappedSegments: total.mappedSegments + piece.mappedSegments,
      unsupportedSegments: total.unsupportedSegments + piece.unsupportedSegments,
      boundaryRequired: total.boundaryRequired + piece.boundaries.required,
      boundaryRepresentable: total.boundaryRepresentable + piece.boundaries.representable,
      spanRequired: total.spanRequired + piece.spans.required,
      spanRepresentable: total.spanRepresentable + piece.spans.representable,
      candidateEvaluable: total.candidateEvaluable + piece.candidates.evaluable,
      oracleHits: total.oracleHits + piece.candidates.oracleHits,
      pathRepresentable: total.pathRepresentable + piece.path.representableSegments,
      completePaths: total.completePaths + Number(piece.path.complete),
      legalBoundaries: total.legalBoundaries + piece.search.legalBoundaries,
      ranges: total.ranges + piece.search.ranges,
      candidates: total.candidates + piece.search.candidates,
      estimatedBytes: total.estimatedBytes + piece.search.estimatedBytes,
    }),
    {
      mappedSegments: 0,
      unsupportedSegments: 0,
      boundaryRequired: 0,
      boundaryRepresentable: 0,
      spanRequired: 0,
      spanRepresentable: 0,
      candidateEvaluable: 0,
      oracleHits: 0,
      pathRepresentable: 0,
      completePaths: 0,
      legalBoundaries: 0,
      ranges: 0,
      candidates: 0,
      estimatedBytes: 0,
    },
  );
  return {
    pieces: pieces.length,
    mappedSegments: sum.mappedSegments,
    unsupportedSegments: sum.unsupportedSegments,
    completePaths: sum.completePaths,
    boundaryRatio: ratio(sum.boundaryRepresentable, sum.boundaryRequired),
    spanRatio: ratio(sum.spanRepresentable, sum.spanRequired),
    candidateRecall: ratio(sum.oracleHits, sum.candidateEvaluable),
    pathRatio: ratio(sum.pathRepresentable, sum.mappedSegments),
    legalBoundaries: sum.legalBoundaries,
    ranges: sum.ranges,
    candidates: sum.candidates,
    candidateCountMode: "top-k-upper-bound",
    estimatedBytes: sum.estimatedBytes,
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

function resolveInside(root: string, path: string): string {
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, path);
  if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${sep}`))
    throw new Error(`dataset path escapes root: ${path}`);
  return target;
}
