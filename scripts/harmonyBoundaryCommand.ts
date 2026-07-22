import { readFile, writeFile } from "node:fs/promises";
import { harmonyBoundaryClassifierModelSchema } from "../packages/web-core/src";
import { harmonyBoundaryRecordsReportSchema } from "../tools/harmony-cli/src/schemas";
import {
  evaluateHarmonyBoundaryClassifier,
  selectHarmonyBoundaryThreshold,
  trainHarmonyBoundaryClassifier,
} from "./harmonyBoundaryTraining";

export async function runHarmonyBoundaryCommand(args: readonly string[]) {
  const command = args[0];
  if (command === "train") {
    const output = args[1];
    const paths = args.slice(2);
    if (!output || paths.length === 0)
      throw new Error("usage: harmony:boundary train <model.json> <train-records.json...>");
    const model = trainHarmonyBoundaryClassifier(await readReports(paths));
    await writeFile(output, `${JSON.stringify(model, null, 2)}\n`);
    return { command: "train-boundary-classifier" as const, output, reports: paths.length };
  }
  if (command === "tune") {
    const output = args[1];
    const modelPath = args[2];
    const paths = args.slice(3);
    if (!output || !modelPath || paths.length === 0)
      throw new Error("usage: harmony:boundary tune <model.json> <train-model.json> <tune-records.json...>");
    const model = harmonyBoundaryClassifierModelSchema.parse(JSON.parse(await readFile(modelPath, "utf8")));
    const tuned = selectHarmonyBoundaryThreshold(model, await readReports(paths));
    await writeFile(output, `${JSON.stringify(tuned, null, 2)}\n`);
    return { command: "tune-boundary-threshold" as const, output, threshold: tuned.threshold };
  }
  if (command === "evaluate") {
    const modelPath = args[1];
    const paths = args.slice(2);
    if (!modelPath || paths.length === 0)
      throw new Error("usage: harmony:boundary evaluate <model.json> <records.json...>");
    const model = harmonyBoundaryClassifierModelSchema.parse(JSON.parse(await readFile(modelPath, "utf8")));
    return {
      command: "evaluate-boundary-classifier" as const,
      ...evaluateHarmonyBoundaryClassifier(model, await readReports(paths)),
    };
  }
  throw new Error("usage: harmony:boundary <train|tune|evaluate> ...");
}

async function readReports(paths: readonly string[]) {
  return Promise.all(
    paths.map(async (path) => harmonyBoundaryRecordsReportSchema.parse(JSON.parse(await readFile(path, "utf8")))),
  );
}
