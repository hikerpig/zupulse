import { createHash } from "node:crypto";
import {
  createLinearHarmonyFeatures,
  LINEAR_HARMONY_FEATURE_LENGTH,
  linearHarmonyRerankerModelSchema,
  rankHarmonyCandidatesLinear,
  type LinearHarmonyCandidateInput,
  type LinearHarmonyRerankerModel,
} from "../packages/web-core/src";
import { harmonyRankingRecordsReportSchema, type HarmonyRankingRecordsReport } from "../tools/harmony-cli/src/schemas";

type RankingRecord = HarmonyRankingRecordsReport["records"][number];
type WeightedExample = { record: RankingRecord; weight: number };
type Top1Metrics = { records: number; weight: number; baselineTop1: number; modelTop1: number; delta: number };

export type LinearHarmonyEvaluation = {
  aggregate: Top1Metrics;
  corpora: Record<string, Top1Metrics>;
};

export function trainLinearHarmonyReranker(
  reportInputs: readonly HarmonyRankingRecordsReport[],
): LinearHarmonyRerankerModel {
  const reports = reportInputs.map((report) => harmonyRankingRecordsReportSchema.parse(report));
  if (reports.length === 0) throw new Error("linear reranker training reports are empty");
  if (reports.some((report) => report.split !== "train")) throw new Error("training requires train reports");
  const examples = balancedExamples(reports.flatMap((report) => report.records));
  if (examples.length === 0) throw new Error("linear reranker training has no oracle-hit records");

  const weights = Array<number>(LINEAR_HARMONY_FEATURE_LENGTH).fill(0);
  for (let epoch = 0; epoch < 160; epoch += 1) {
    const learningRate = 0.8 / Math.sqrt(epoch + 1);
    for (const example of examples) updateListwise(weights, example, learningRate);
  }

  return linearHarmonyRerankerModelSchema.parse({
    version: 1,
    featureVersion: "candidate-linear-v1",
    algorithmVersion: "listwise-sgd-v1",
    trainingSourcesSha256: sourceHashes(reports),
    trainingGroupsSha256: hashLines(reports.map((report) => report.groupsSha256).sort()),
    weights: weights.map((weight) => Number(weight.toFixed(2))),
  });
}

export function evaluateLinearHarmonyReranker(
  modelInput: LinearHarmonyRerankerModel,
  reportInputs: readonly HarmonyRankingRecordsReport[],
): LinearHarmonyEvaluation {
  const model = linearHarmonyRerankerModelSchema.parse(modelInput);
  const reports = reportInputs.map((report) => harmonyRankingRecordsReportSchema.parse(report));
  if (reports.length === 0) throw new Error("linear reranker evaluation reports are empty");
  if (reports.some((report) => report.split !== "tune")) throw new Error("evaluation requires tune reports");
  const records = reports.flatMap((report) => report.records).filter(isOracleHit);
  const corpusNames = [...new Set(records.map((record) => record.corpus))].sort();
  return {
    aggregate: top1Metrics(model, records),
    corpora: Object.fromEntries(
      corpusNames.map((corpus) => [
        corpus,
        top1Metrics(
          model,
          records.filter((record) => record.corpus === corpus),
        ),
      ]),
    ),
  };
}

function balancedExamples(records: readonly RankingRecord[]): WeightedExample[] {
  const hits = records.filter(isOracleHit).sort((a, b) => a.id.localeCompare(b.id));
  const corpusGroups = new Map<string, Set<string>>();
  const groupWeights = new Map<string, number>();
  for (const record of hits) {
    const groupKey = `${record.corpus}:${record.groupId}`;
    (corpusGroups.get(record.corpus) ?? corpusGroups.set(record.corpus, new Set()).get(record.corpus)!).add(
      record.groupId,
    );
    groupWeights.set(groupKey, (groupWeights.get(groupKey) ?? 0) + record.weight);
  }
  const corpusCount = corpusGroups.size;
  return hits.map((record) => ({
    record,
    // Each corpus, then each complete work, contributes equal total gradient weight.
    weight:
      record.weight /
      groupWeights.get(`${record.corpus}:${record.groupId}`)! /
      corpusGroups.get(record.corpus)!.size /
      corpusCount,
  }));
}

function updateListwise(weights: number[], example: WeightedExample, learningRate: number): void {
  const candidates = example.record.candidates;
  const features = candidates.map((_, index) => createLinearHarmonyFeatures(candidates, index));
  const logits = features.map((candidate) => dot(weights, candidate));
  const maxLogit = Math.max(...logits);
  const exponentials = logits.map((logit) => Math.exp(logit - maxLogit));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  for (let featureIndex = 0; featureIndex < weights.length; featureIndex += 1) {
    let gradient = 0;
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const expected = candidateIndex === example.record.targetIndex ? 1 : 0;
      gradient += (exponentials[candidateIndex]! / total - expected) * features[candidateIndex]![featureIndex]!;
    }
    weights[featureIndex] = weights[featureIndex]! - learningRate * example.weight * gradient;
  }
}

function top1Metrics(model: LinearHarmonyRerankerModel, records: readonly RankingRecord[]): Top1Metrics {
  let totalWeight = 0;
  let baselineWeight = 0;
  let modelWeight = 0;
  for (const record of records) {
    totalWeight += record.weight;
    if (record.primaryIndex === record.targetIndex) baselineWeight += record.weight;
    if (rankHarmonyCandidatesLinear(model, record.candidates)[0]?.index === record.targetIndex)
      modelWeight += record.weight;
  }
  const baselineTop1 = totalWeight === 0 ? 0 : baselineWeight / totalWeight;
  const modelTop1 = totalWeight === 0 ? 0 : modelWeight / totalWeight;
  return {
    records: records.length,
    weight: totalWeight,
    baselineTop1: roundMetric(baselineTop1),
    modelTop1: roundMetric(modelTop1),
    delta: roundMetric(modelTop1 - baselineTop1),
  };
}

function isOracleHit(record: RankingRecord): record is RankingRecord & { targetIndex: number } {
  return record.outcome === "oracle-hit" && record.targetIndex !== undefined;
}

function sourceHashes(reports: readonly HarmonyRankingRecordsReport[]): string[] {
  return [
    ...new Set(
      reports.flatMap((report) =>
        report.sources.map((source) => hashLines([source.caseId, source.revision, source.groupsSha256])),
      ),
    ),
  ].sort();
}

function hashLines(lines: readonly string[]): string {
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

function dot(weights: readonly number[], features: readonly number[]): number {
  return features.reduce((sum, value, index) => sum + value * weights[index]!, 0);
}

function roundMetric(value: number): number {
  return Number(value.toFixed(4));
}
