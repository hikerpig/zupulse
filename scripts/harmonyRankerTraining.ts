import { createHash } from "node:crypto";
import {
  createHarmonyRankerFeatures,
  harmonyChordShape,
  harmonyRankerModelSchema,
  type ChordSymbolInput,
  type HarmonyFeatureVector,
  type HarmonyRankerModel,
} from "../packages/web-core/src/index";
import { assertTrainingGroups, splitHarmonyGroup } from "./harmonyDatasetSplit";

export type HarmonyTrainingRecord = {
  corpus: string;
  groupId: string;
  expected: ChordSymbolInput;
  features: HarmonyFeatureVector;
};

export function trainHarmonyRanker(
  records: readonly HarmonyTrainingRecord[],
  trainingCorpusSha256: readonly string[],
): HarmonyRankerModel {
  assertTrainingGroups(records.map((record) => record.groupId));
  const training = records.filter((record) => splitHarmonyGroup(record.groupId) !== "eval");
  if (training.length === 0) throw new Error("harmony ranker training set is empty");
  const groupKeys = [...new Set(training.map((record) => `${record.corpus}:${record.groupId}`))].sort();
  const prototypes = training.map((record) => ({
    chordShape: harmonyChordShape(record.expected),
    features: createHarmonyRankerFeatures(record.features, record.expected),
  }));
  return harmonyRankerModelSchema.parse({
    version: 1,
    featureVersion: "relative-pc-v1",
    algorithmVersion: "prototype-ranker-v1",
    trainingCorpusSha256: [...trainingCorpusSha256].sort(),
    trainingGroupsSha256: createHash("sha256").update(groupKeys.join("\n")).digest("hex"),
    prototypes,
  });
}
