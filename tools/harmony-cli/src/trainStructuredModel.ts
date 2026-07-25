import { harmonyStructuredLinearModelSchema } from "@zupulse/web-core";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { iterateHarmonyStructuredRecordPieces, readHarmonyStructuredRecordsManifest } from "./loadStructuredRecords";
import { trainHarmonyStructuredPerceptron } from "./structuredTraining";

export async function trainHarmonyStructuredModelFile(options: {
  recordsPath: string;
  outputPath: string;
  reportPath?: string;
  epochs?: number;
  learningRate?: number;
}) {
  const recordsBytes = await readFile(options.recordsPath);
  const recordsSha256 = createHash("sha256").update(recordsBytes).digest("hex");
  const manifest = await readHarmonyStructuredRecordsManifest(options.recordsPath, "train");
  const epochs = options.epochs ?? 3;
  const learningRate = options.learningRate ?? 0.1;
  const result = await trainHarmonyStructuredPerceptron({
    recordsSha256,
    groupsSha256: manifest.groupsSha256,
    epochs,
    learningRate,
    pieces: () => iterateHarmonyStructuredRecordPieces(options.recordsPath, "train"),
  });
  const model = harmonyStructuredLinearModelSchema.parse(result.model);
  const serializedModel = `${JSON.stringify(model, null, 2)}\n`;
  await writeFile(options.outputPath, serializedModel);
  const modelSha256 = createHash("sha256").update(serializedModel).digest("hex");
  const report = {
    schemaVersion: "1.0.0",
    command: "train-structured",
    records: {
      path: options.recordsPath,
      sha256: recordsSha256,
      groupsSha256: manifest.groupsSha256,
      pieces: manifest.aggregate.pieces,
      windows: manifest.aggregate.windows,
    },
    model: {
      path: options.outputPath,
      sha256: modelSha256,
      featureVersion: model.featureVersion,
      algorithmVersion: model.algorithmVersion,
      epochs,
      learningRate,
      ruleScale: model.ruleScale,
      modelScale: model.modelScale,
    },
    metrics: result.report.epochs,
  };
  const reportPath = options.reportPath ?? `${options.outputPath}.report.json`;
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return {
    command: "train-structured" as const,
    output: options.outputPath,
    report: reportPath,
    modelSha256,
    epochs,
    windows: manifest.aggregate.windows,
  };
}
