import { describe, expect, it } from "vitest";
import { assertTrainingGroups, splitHarmonyGroup } from "../harmonyDatasetSplit";

describe("harmony dataset split", () => {
  it("assigns a group deterministically", () => {
    expect(splitHarmonyGroup("chorale-12")).toBe(splitHarmonyGroup("chorale-12"));
  });

  it("rejects an eval group from model training", () => {
    const evalGroup = Array.from({ length: 100 }, (_, index) => `group-${index}`).find(
      (groupId) => splitHarmonyGroup(groupId) === "eval",
    );
    expect(evalGroup).toBeDefined();
    expect(() => assertTrainingGroups([evalGroup!])).toThrow("eval group");
  });
});
