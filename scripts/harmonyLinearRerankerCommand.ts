import { readFile, writeFile } from "node:fs/promises";
import { linearHarmonyRerankerModelSchema } from "../packages/web-core/src";
import { harmonyRankingRecordsReportSchema } from "../tools/harmony-cli/src/schemas";
import {
  evaluateLinearHarmonyReranker,
  evaluateLinearHarmonyRerankerTrainingFit,
  trainLinearHarmonyReranker,
} from "./harmonyLinearRerankerTraining";

export async function runLinearHarmonyRerankerCommand(args: readonly string[]) {
  const command = args[0];
  if (command === "train") {
    const output = args[1];
    const reportPaths = args.slice(2);
    if (!output || reportPaths.length === 0)
      throw new Error("usage: harmony:reranker train <model.json> <train-records.json...>");
    const reports = await readReports(reportPaths);
    const model = trainLinearHarmonyReranker(reports);
    await writeFile(output, `${JSON.stringify(model, null, 2)}\n`);
    return { command: "train-linear-reranker" as const, output, reports: reports.length };
  }
  if (command === "evaluate") {
    const modelPath = args[1];
    const reportPaths = args.slice(2);
    if (!modelPath || reportPaths.length === 0)
      throw new Error("usage: harmony:reranker evaluate <model.json> <tune-records.json...>");
    const model = linearHarmonyRerankerModelSchema.parse(JSON.parse(await readFile(modelPath, "utf8")));
    return {
      command: "evaluate-linear-reranker" as const,
      ...evaluateLinearHarmonyReranker(model, await readReports(reportPaths)),
    };
  }
  if (command === "evaluate-train") {
    const modelPath = args[1];
    const reportPaths = args.slice(2);
    if (!modelPath || reportPaths.length === 0)
      throw new Error("usage: harmony:reranker evaluate-train <model.json> <train-records.json...>");
    const model = linearHarmonyRerankerModelSchema.parse(JSON.parse(await readFile(modelPath, "utf8")));
    return {
      command: "evaluate-linear-reranker-training-fit" as const,
      ...evaluateLinearHarmonyRerankerTrainingFit(model, await readReports(reportPaths)),
    };
  }
  throw new Error("usage: harmony:reranker <train|evaluate|evaluate-train> ...");
}

async function readReports(paths: readonly string[]) {
  return Promise.all(
    paths.map(async (path) => harmonyRankingRecordsReportSchema.parse(JSON.parse(await readFile(path, "utf8")))),
  );
}
