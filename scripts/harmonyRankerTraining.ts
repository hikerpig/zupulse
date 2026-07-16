import { createHash } from "node:crypto";
import {
  createHarmonyRankerFeatures,
  harmonyChordShape,
  harmonyRankerModelSchema,
  type HarmonyRankerModel,
} from "../packages/web-core/src/harmony/learnedRanker";
import type { HarmonyFeatureVector } from "../packages/web-core/src/harmony/features";
import type { ChordSymbolInput } from "../packages/web-core/src/harmony/schemas";
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
  const prototypeCounts = new Map<string, { chordShape: string; features: number[]; frequency: number }>();
  for (const record of training) {
    const chordShape = harmonyChordShape(record.expected);
    const features = createHarmonyRankerFeatures(record.features, record.expected);
    const key = `${chordShape}:${features.join("")}`;
    const existing = prototypeCounts.get(key);
    prototypeCounts.set(key, { chordShape, features, frequency: (existing?.frequency ?? 0) + 1 });
  }
  const prototypes = [...prototypeCounts.values()];
  return harmonyRankerModelSchema.parse({
    version: 1,
    featureVersion: "relative-pc-presence-v1",
    algorithmVersion: "frequency-ranker-v2",
    trainingCorpusSha256: [...trainingCorpusSha256].sort(),
    trainingGroupsSha256: createHash("sha256").update(groupKeys.join("\n")).digest("hex"),
    prototypes,
  });
}
