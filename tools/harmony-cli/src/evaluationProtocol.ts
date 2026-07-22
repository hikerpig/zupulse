import { createHash } from "node:crypto";

export type DatasetSplit = "train" | "tune" | "eval";
export type V3DatasetRole = Exclude<DatasetSplit, "eval"> | "regression" | "final-holdout";

export function assignDatasetSplit(groupId: string, forcedEvalGroups: readonly string[]): DatasetSplit {
  if (forcedEvalGroups.includes(groupId)) return "eval";
  const bucket = [...groupId].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) % 5, 0);
  return bucket === 0 ? "eval" : bucket === 1 ? "tune" : "train";
}

export function assertNoEvaluationLeakage(records: readonly { groupId: string; split: DatasetSplit }[]): void {
  const leaked = records.find((record) => record.split === "eval");
  if (leaked) throw new Error(`eval group cannot enter training: ${leaked.groupId}`);
}

export function assignV3DatasetRole(
  groupId: string,
  policy: { finalHoldoutGroups: readonly string[]; regressionGroups: readonly string[] },
): V3DatasetRole {
  if (policy.finalHoldoutGroups.includes(groupId)) return "final-holdout";
  if (policy.regressionGroups.includes(groupId)) return "regression";
  const split = assignDatasetSplit(groupId, []);
  return split === "eval" ? "regression" : split;
}

export function hashDatasetGroups(groupIds: readonly string[]): string {
  return createHash("sha256")
    .update([...new Set(groupIds)].sort().join("\n"))
    .digest("hex");
}

export function assertV3CorpusGroups(
  corpus: { caseId: string; groupsSha256: string },
  groupIds: readonly string[],
): void {
  const actual = hashDatasetGroups(groupIds);
  if (actual !== corpus.groupsSha256) throw new Error(`${corpus.caseId} group set checksum mismatch: ${actual}`);
}
