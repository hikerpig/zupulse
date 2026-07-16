export type HarmonyDatasetSplit = "train" | "tune" | "eval";

export function splitHarmonyGroup(groupId: string): HarmonyDatasetSplit {
  const bucket = [...groupId].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) % 5, 0);
  return bucket === 0 ? "eval" : bucket === 1 ? "tune" : "train";
}

export function assertTrainingGroups(groupIds: readonly string[]): void {
  const leaked = groupIds.find((groupId) => splitHarmonyGroup(groupId) === "eval");
  if (leaked !== undefined) throw new Error(`eval group cannot enter model training: ${leaked}`);
}
