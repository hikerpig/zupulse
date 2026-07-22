import { readFile, writeFile } from "node:fs/promises";
import {
  linearHarmonyRerankerModelSchema,
  mlpHarmonyCalibrationAssetSchema,
  mlpHarmonyRerankerModelSchema,
} from "../packages/web-core/src";
import { harmonyRankingRecordsReportSchema } from "../tools/harmony-cli/src/schemas";
import {
  evaluateLinearHarmonyReranker,
  evaluateLinearHarmonyRerankerTrainingFit,
  evaluateMlpHarmonyReranker,
  trainLinearHarmonyReranker,
} from "./harmonyLinearRerankerTraining";
import {
  evaluateMlpHarmonyCalibration,
  fitMlpHarmonyCalibration,
  selectMlpHarmonyDecisionThreshold,
} from "./harmonyMlpCalibration";

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
  if (command === "evaluate-mlp") {
    const modelPath = args[1];
    const reportPaths = args.slice(2);
    if (!modelPath || reportPaths.length === 0)
      throw new Error("usage: harmony:reranker evaluate-mlp <model.json> <tune-records.json...>");
    const model = mlpHarmonyRerankerModelSchema.parse(JSON.parse(await readFile(modelPath, "utf8")));
    return {
      command: "evaluate-mlp-reranker" as const,
      ...evaluateMlpHarmonyReranker(model, await readReports(reportPaths)),
    };
  }
  if (command === "calibrate-mlp") {
    const output = args[1];
    const modelPath = args[2];
    const reportPaths = args.slice(3);
    if (!output || !modelPath || reportPaths.length === 0)
      throw new Error("usage: harmony:reranker calibrate-mlp <asset.json> <model.json> <train-records.json...>");
    const model = mlpHarmonyRerankerModelSchema.parse(JSON.parse(await readFile(modelPath, "utf8")));
    const asset = fitMlpHarmonyCalibration(model, await readReports(reportPaths));
    await writeFile(output, `${JSON.stringify(asset, null, 2)}\n`);
    return { command: "calibrate-mlp-confidence" as const, output, reports: reportPaths.length };
  }
  if (command === "evaluate-calibration") {
    const assetPath = args[1];
    const modelPath = args[2];
    const floorIndex = args.indexOf("--precision-floor");
    const reportPaths = args.slice(3, floorIndex < 0 ? undefined : floorIndex);
    const precisionFloor = floorIndex < 0 ? 0.7 : Number(args[floorIndex + 1]);
    if (
      !assetPath ||
      !modelPath ||
      reportPaths.length === 0 ||
      !Number.isFinite(precisionFloor) ||
      precisionFloor < 0 ||
      precisionFloor > 1
    )
      throw new Error(
        "usage: harmony:reranker evaluate-calibration <asset.json> <model.json> <tune-records.json...> [--precision-floor 0..1]",
      );
    const model = mlpHarmonyRerankerModelSchema.parse(JSON.parse(await readFile(modelPath, "utf8")));
    const asset = mlpHarmonyCalibrationAssetSchema.parse(JSON.parse(await readFile(assetPath, "utf8")));
    const evaluation = evaluateMlpHarmonyCalibration(model, asset, await readReports(reportPaths));
    const summarize = ({ curve: _, ...metrics }: (typeof evaluation)["aggregate"]) => metrics;
    const recommendedThreshold = selectMlpHarmonyDecisionThreshold(evaluation, precisionFloor);
    const thresholdMetrics = (metrics: (typeof evaluation)["aggregate"]) =>
      recommendedThreshold === undefined
        ? undefined
        : metrics.curve.find((point) => point.threshold === recommendedThreshold);
    return {
      command: "evaluate-mlp-calibration" as const,
      precisionFloor,
      recommendedThreshold,
      aggregate: summarize(evaluation.aggregate),
      corpora: Object.fromEntries(
        Object.entries(evaluation.corpora).map(([corpus, metrics]) => [corpus, summarize(metrics)]),
      ),
      atRecommendedThreshold: {
        aggregate: thresholdMetrics(evaluation.aggregate),
        corpora: Object.fromEntries(
          Object.entries(evaluation.corpora).map(([corpus, metrics]) => [corpus, thresholdMetrics(metrics)]),
        ),
      },
    };
  }
  throw new Error(
    "usage: harmony:reranker <train|evaluate|evaluate-train|evaluate-mlp|calibrate-mlp|evaluate-calibration> ...",
  );
}

async function readReports(paths: readonly string[]) {
  return Promise.all(
    paths.map(async (path) => harmonyRankingRecordsReportSchema.parse(JSON.parse(await readFile(path, "utf8")))),
  );
}
