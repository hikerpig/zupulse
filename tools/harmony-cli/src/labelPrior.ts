import type { DatasetSplit } from "./evaluationProtocol";

export function buildTrainLabelPrior(
  sourceCase: string,
  records: readonly { groupId: string; split: DatasetSplit; label: string }[],
) {
  if (records.some((record) => record.split !== "train")) {
    throw new Error("label prior accepts train records only");
  }
  const frequencies = Object.fromEntries(
    [...new Set(records.map((record) => record.label))]
      .sort()
      .map((label) => [label, records.filter((record) => record.label === label).length]),
  );
  return {
    schemaVersion: "1.0.0" as const,
    sourceCase,
    split: "train" as const,
    groups: new Set(records.map((record) => record.groupId)).size,
    labels: records.length,
    frequencies,
  };
}
