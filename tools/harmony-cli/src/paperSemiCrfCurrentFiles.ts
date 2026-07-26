import {
  analyzeHarmonyRules,
  compareMoments,
  normalizePaperSemiCrfLabel,
  paperSemiCrfChordToLabel,
  parsePaperSemiCrfLinearModel,
  type HarmonySegment,
  type PaperSemiCrfSegment,
} from "@zupulse/web-core";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { z } from "zod";
import { parseDcmlPiece } from "./adapters/dcml";
import { dcmlGroupId } from "./adapters/dcmlEvaluation";
import { assignV3DatasetRole, assertV3CorpusGroups } from "./evaluationProtocol";
import {
  calculatePaperSemiCrfWindowMetrics,
  type PaperSemiCrfWindowMetricRecord,
} from "./paperSemiCrfCurrentComparison";
import { evaluatePaperSemiCrfRecords } from "./paperSemiCrfEvaluation";
import { parsePaperSemiCrfEvaluationRecords } from "./paperSemiCrfRecords";
import { harmonyDatasetManifestSchema, harmonyEvaluationProtocolV3Schema } from "./schemas";

const ratioSchema = z
  .object({ correct: z.number().int().nonnegative(), total: z.number().int().nonnegative(), accuracy: z.number() })
  .strict();
const precisionRecallSchema = z
  .object({
    correct: z.number().int().nonnegative(),
    predicted: z.number().int().nonnegative(),
    gold: z.number().int().nonnegative(),
    precision: z.number(),
    recall: z.number(),
    f1: z.number(),
  })
  .strict();
const metricsSchema = z
  .object({
    events: ratioSchema,
    duration: z
      .object({
        correctTicks: z.number().int().nonnegative(),
        totalTicks: z.number().int().nonnegative(),
        accuracy: z.number(),
      })
      .strict(),
    segments: precisionRecallSchema,
    boundaries: precisionRecallSchema,
    density: z
      .object({ predicted: z.number().int().nonnegative(), gold: z.number().int().nonnegative(), ratio: z.number() })
      .strict(),
  })
  .strict();
const comparisonReportSchema = z
  .object({
    schemaVersion: z.literal("paper-semi-crf-current-comparison-v1"),
    command: z.literal("paper-semi-crf-current-compare"),
    caseId: z.string().min(1),
    sourceRevision: z.string().min(1),
    split: z.literal("tune"),
    records: z
      .object({
        path: z.string().min(1),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        windows: z.number().int().positive(),
        events: z.number().int().positive(),
      })
      .strict(),
    model: z.object({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
    paperSemiCrf: z
      .object({
        metrics: metricsSchema,
        windowRuntimeMs: z.number().nonnegative(),
        p95WindowRuntimeMs: z.number().nonnegative(),
      })
      .strict(),
    productionBaseline: z
      .object({
        analyzer: z.literal("analyzeHarmonyRules"),
        decisionThreshold: z.literal(0),
        metrics: metricsSchema,
        fullPieceRuntimeMs: z.number().nonnegative(),
      })
      .strict(),
  })
  .strict();

export async function evaluatePaperSemiCrfCurrentComparisonFile(options: {
  manifestPath: string;
  protocolPath: string;
  dataRoot: string;
  caseId: string;
  recordsPath: string;
  modelPath: string;
  outputPath: string;
}) {
  const manifest = harmonyDatasetManifestSchema.parse(JSON.parse(await readFile(options.manifestPath, "utf8")));
  const protocol = harmonyEvaluationProtocolV3Schema.parse(JSON.parse(await readFile(options.protocolPath, "utf8")));
  const item = manifest.cases.find((candidate) => candidate.id === options.caseId);
  const policy = protocol.corpora.find((candidate) => candidate.caseId === options.caseId);
  if (!item || item.kind !== "accuracy-corpus") throw new Error(`accuracy dataset case not found: ${options.caseId}`);
  if (item.adapter !== "dcml") throw new Error(`paper comparison adapter not implemented: ${item.adapter}`);
  if (!policy) throw new Error(`v3 protocol case not found: ${options.caseId}`);
  if (item.source.revision !== policy.sourceRevision) throw new Error(`${options.caseId} protocol revision mismatch`);
  const archiveSha256 = sha256(await readFile(resolveInside(options.dataRoot, item.archivePath)));
  if (archiveSha256 !== item.source.sha256) throw new Error(`${item.id} archive checksum mismatch: ${archiveSha256}`);
  const recordsBytes = await readFile(options.recordsPath);
  const records = parsePaperSemiCrfEvaluationRecords(JSON.parse(recordsBytes.toString("utf8")));
  const modelBytes = await readFile(options.modelPath);
  const model = parsePaperSemiCrfLinearModel(JSON.parse(modelBytes.toString("utf8")));
  const labelIds = new Map(model.labels.map((label, index) => [label, index]));
  const metricRecords: PaperSemiCrfWindowMetricRecord[] = records.records.map((record) => ({
    id: record.id,
    eventDurationTicks: record.events.map((event) => event.durationTicks),
    goldSegments: record.targetSegments.map((segment) => ({
      startEvent: segment.startEvent,
      endEvent: segment.endEvent,
      labelId: labelIds.get(segment.label)!,
    })),
  }));
  const paperStartedAt = performance.now();
  const paperEvaluation = evaluatePaperSemiCrfRecords({ records, model });
  const paperRuntimeMs = performance.now() - paperStartedAt;
  const sortedWindowRuntimes = paperEvaluation.recordPerformance
    .map((record) => record.runtimeMs)
    .sort((a, b) => a - b);
  const p95WindowRuntimeMs = sortedWindowRuntimes[Math.max(0, Math.ceil(sortedWindowRuntimes.length * 0.95) - 1)] ?? 0;

  const root = resolveInside(options.dataRoot, item.datasetPath);
  const allPieceIds = (await readdir(resolve(root, "harmonies")))
    .filter((name) => name.endsWith(".harmonies.tsv"))
    .map((name) => name.slice(0, -".harmonies.tsv".length))
    .sort();
  const groupMode = item.groupBy ?? "prefix-before-hyphen";
  const allGroups = [...new Set(allPieceIds.map((id) => dcmlGroupId(id, groupMode, item.id)))].sort();
  assertV3CorpusGroups(policy, allGroups);
  const recordIdsByPiece = new Map<string, string[]>();
  for (const record of records.records) {
    const pieceId = record.id.slice(0, record.id.lastIndexOf(":window:"));
    recordIdsByPiece.set(pieceId, [...(recordIdsByPiece.get(pieceId) ?? []), record.id]);
  }
  const baselinePredictions: Array<{ id: string; segments: PaperSemiCrfSegment[] }> = [];
  const baselineStartedAt = performance.now();
  for (const pieceId of allPieceIds) {
    const recordIds = recordIdsByPiece.get(pieceId);
    if (recordIds === undefined) continue;
    const groupId = dcmlGroupId(pieceId, groupMode, item.id);
    if (assignV3DatasetRole(groupId, policy) !== "tune") throw new Error(`non-tune paper comparison piece: ${pieceId}`);
    const piece = parseDcmlPiece({
      corpus: item.id,
      groupId,
      measures: await readFile(resolve(root, `measures/${pieceId}.measures.tsv`), "utf8"),
      notes: await readFile(resolve(root, `notes/${pieceId}.notes.tsv`), "utf8"),
      harmonies: await readFile(resolve(root, `harmonies/${pieceId}.harmonies.tsv`), "utf8"),
    });
    const production = analyzeHarmonyRules(piece.input, {
      includedTrackIds: ["dcml"],
      topK: 8,
      decisionThreshold: 0,
    });
    for (const recordId of recordIds) {
      const record = records.records.find((candidate) => candidate.id === recordId)!;
      baselinePredictions.push({
        id: record.id,
        segments: baselineSegments(record.events, production, labelIds),
      });
    }
  }
  const baselineRuntimeMs = performance.now() - baselineStartedAt;
  const report = comparisonReportSchema.parse({
    schemaVersion: "paper-semi-crf-current-comparison-v1",
    command: "paper-semi-crf-current-compare",
    caseId: item.id,
    sourceRevision: item.source.revision,
    split: "tune",
    records: {
      path: options.recordsPath,
      sha256: sha256(recordsBytes),
      windows: records.records.length,
      events: records.records.reduce((sum, record) => sum + record.events.length, 0),
    },
    model: { path: options.modelPath, sha256: sha256(modelBytes) },
    paperSemiCrf: {
      metrics: calculatePaperSemiCrfWindowMetrics(metricRecords, paperEvaluation.predictions),
      windowRuntimeMs: paperRuntimeMs,
      p95WindowRuntimeMs,
    },
    productionBaseline: {
      analyzer: "analyzeHarmonyRules",
      decisionThreshold: 0,
      metrics: calculatePaperSemiCrfWindowMetrics(metricRecords, baselinePredictions),
      fullPieceRuntimeMs: baselineRuntimeMs,
    },
  });
  await writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, output: options.outputPath };
}

function baselineSegments(
  events: readonly { range: { start: { measureIndex: number; offsetTicks: number } } }[],
  production: readonly HarmonySegment[],
  labelIds: ReadonlyMap<string, number>,
): PaperSemiCrfSegment[] {
  const eventLabels = events.map((event) => {
    const segment = production.find(
      (candidate) =>
        compareMoments(candidate.range.start, event.range.start) <= 0 &&
        compareMoments(event.range.start, candidate.range.end) < 0,
    );
    if (segment?.status !== "resolved") return -2;
    try {
      return labelIds.get(normalizePaperSemiCrfLabel(paperSemiCrfChordToLabel(segment.chord))) ?? -2;
    } catch {
      return -2;
    }
  });
  const segments: PaperSemiCrfSegment[] = [];
  let startEvent = 0;
  for (let endEvent = 1; endEvent <= eventLabels.length; endEvent += 1) {
    if (endEvent === eventLabels.length || eventLabels[endEvent] !== eventLabels[startEvent]) {
      segments.push({ startEvent, endEvent, labelId: eventLabels[startEvent]! });
      startEvent = endEvent;
    }
  }
  return segments;
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
