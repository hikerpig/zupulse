import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { parsePaperSemiCrfLinearModel } from "@zupulse/web-core";
import { z } from "zod";
import { evaluatePaperSemiCrfRecords } from "./paperSemiCrfEvaluation";
import { paperSemiCrfRecordsFileSchema } from "./paperSemiCrfRecords";
import { trainPaperSemiCrf } from "./paperSemiCrfTraining";

const finiteNumber = z.number().refine(Number.isFinite);
const optimizerCheckpointSchema = z
  .object({
    schemaVersion: z.literal("paper-semi-crf-lbfgs-checkpoint-v1"),
    iteration: z.number().int().nonnegative(),
    weights: z.array(finiteNumber).min(1),
    value: finiteNumber,
    gradient: z.array(finiteNumber).min(1),
    history: z.array(
      z
        .object({
          step: z.array(finiteNumber),
          gradientDelta: z.array(finiteNumber),
          inverseCurvature: finiteNumber.positive(),
        })
        .strict(),
    ),
  })
  .strict();

const trainingCheckpointSchema = z
  .object({
    schemaVersion: z.literal("paper-semi-crf-training-checkpoint-v1"),
    recordsSha256: z.string().regex(/^[a-f0-9]{64}$/),
    labels: z.array(z.string().min(1)).min(1),
    featureNames: z.array(z.string().min(1)),
    maxSegmentLength: z.number().int().positive(),
    l2: finiteNumber.nonnegative(),
    minFeatureCount: z.number().int().nonnegative(),
    optimizer: optimizerCheckpointSchema,
  })
  .strict();

export async function trainPaperSemiCrfFile(options: {
  recordsPath: string;
  outputPath: string;
  checkpointPath: string;
  reportPath: string;
  maxIterations: number;
  minFeatureCount: number;
  l2: number;
  gradientTolerance?: number;
  resumePath?: string;
}) {
  const recordsBytes = await readFile(options.recordsPath);
  const recordsSha256 = sha256(recordsBytes);
  const records = paperSemiCrfRecordsFileSchema.parse(JSON.parse(recordsBytes.toString("utf8")));
  const resume =
    options.resumePath === undefined
      ? undefined
      : trainingCheckpointSchema.parse(JSON.parse(await readFile(options.resumePath, "utf8")));
  if (
    resume !== undefined &&
    (resume.recordsSha256 !== recordsSha256 ||
      resume.l2 !== options.l2 ||
      resume.minFeatureCount !== options.minFeatureCount ||
      resume.maxSegmentLength !== records.maxSegmentLength ||
      resume.labels.length !== records.labels.length ||
      resume.labels.some((label, index) => label !== records.labels[index]))
  ) {
    throw new Error("paper Semi-CRF checkpoint does not match training records or options");
  }
  const trained = trainPaperSemiCrf({
    records,
    l2: options.l2,
    minFeatureCount: options.minFeatureCount,
    maxIterations: options.maxIterations,
    ...(options.gradientTolerance === undefined ? {} : { gradientTolerance: options.gradientTolerance }),
    ...(resume === undefined ? {} : { featureNames: resume.featureNames, resume: resume.optimizer }),
  });
  const modelText = jsonText(trained.model);
  const checkpoint = {
    schemaVersion: "paper-semi-crf-training-checkpoint-v1" as const,
    recordsSha256,
    labels: records.labels,
    featureNames: trained.model.featureNames,
    maxSegmentLength: records.maxSegmentLength,
    l2: options.l2,
    minFeatureCount: options.minFeatureCount,
    optimizer: trained.checkpoint,
  };
  trainingCheckpointSchema.parse(checkpoint);
  const report = {
    schemaVersion: "paper-semi-crf-training-report-v1",
    command: "paper-semi-crf-train",
    provenance: "fresh",
    records: { path: options.recordsPath, sha256: recordsSha256, count: records.records.length },
    model: { path: options.outputPath, sha256: sha256(modelText) },
    checkpoint: { path: options.checkpointPath, iteration: trained.checkpoint.iteration },
    optimization: trained.report,
  };
  await Promise.all([
    writeFile(options.outputPath, modelText),
    writeFile(options.checkpointPath, jsonText(checkpoint)),
    writeFile(options.reportPath, jsonText(report)),
  ]);
  return {
    command: "paper-semi-crf-train" as const,
    output: options.outputPath,
    checkpoint: options.checkpointPath,
    report: options.reportPath,
    modelSha256: report.model.sha256,
    iterations: trained.checkpoint.iteration,
    status: trained.report.status,
  };
}

export async function evaluatePaperSemiCrfFile(options: {
  recordsPath: string;
  modelPath: string;
  outputPath: string;
  allowFinal?: boolean;
}) {
  const recordsBytes = await readFile(options.recordsPath);
  const records = paperSemiCrfRecordsFileSchema.parse(JSON.parse(recordsBytes.toString("utf8")));
  if (records.role === "final" && options.allowFinal !== true) {
    throw new Error("final records require --allow-final");
  }
  const modelBytes = await readFile(options.modelPath);
  const model = parsePaperSemiCrfLinearModel(JSON.parse(modelBytes.toString("utf8")));
  const rssBefore = process.memoryUsage.rss();
  const startedAt = performance.now();
  const evaluated = evaluatePaperSemiCrfRecords({
    records,
    model,
    ...(options.allowFinal === undefined ? {} : { allowFinal: options.allowFinal }),
  });
  const runtimeMs = performance.now() - startedAt;
  const report = {
    schemaVersion: "paper-semi-crf-evaluation-report-v1",
    command: "paper-semi-crf-eval",
    provenance: "fresh" as const,
    role: records.role as "tune" | "final",
    records: { path: options.recordsPath, sha256: sha256(recordsBytes), count: records.records.length },
    model: { path: options.modelPath, sha256: sha256(modelBytes) },
    metrics: evaluated.metrics,
    performance: {
      runtimeMs,
      rssBytesBefore: rssBefore,
      rssBytesAfter: process.memoryUsage.rss(),
    },
    predictions: evaluated.predictions,
  };
  await writeFile(options.outputPath, jsonText(report));
  return { ...report, output: options.outputPath };
}

function sha256(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

function jsonText(input: unknown): string {
  return `${JSON.stringify(input, null, 2)}\n`;
}
