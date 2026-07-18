export type DatasetSplit = "train" | "tune" | "eval";

export function assignDatasetSplit(groupId: string, forcedEvalGroups: readonly string[]): DatasetSplit {
  if (forcedEvalGroups.includes(groupId)) return "eval";
  const bucket = [...groupId].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) % 5, 0);
  return bucket === 0 ? "eval" : bucket === 1 ? "tune" : "train";
}

export function assertNoEvaluationLeakage(records: readonly { groupId: string; split: DatasetSplit }[]): void {
  const leaked = records.find((record) => record.split === "eval");
  if (leaked) throw new Error(`eval group cannot enter training: ${leaked.groupId}`);
}
