import { describe, expect, it } from "vitest";
import type { HarmonyTrainingRecord } from "../harmonyRankerTraining";
import { trainHarmonyRanker } from "../harmonyRankerTraining";
import { splitHarmonyGroup } from "../harmonyDatasetSplit";

const features = {
  durationByPitchClass: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
  onsetCountByPitchClass: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
  bassPitchClass: 0,
};
const expected = { root: { step: "C", alter: 0 }, kind: "major", degrees: [] } as const;

describe("harmony ranker training", () => {
  it("rejects eval records before model training", () => {
    const ids = Array.from({ length: 100 }, (_, index) => `group-${index}`);
    const trainId = ids.find((id) => splitHarmonyGroup(id) === "train")!;
    const evalId = ids.find((id) => splitHarmonyGroup(id) === "eval")!;
    const records: HarmonyTrainingRecord[] = [
      { corpus: "fixture", groupId: trainId, expected, features },
      { corpus: "fixture", groupId: evalId, expected, features: { ...features, bassPitchClass: 7 } },
    ];

    expect(() => trainHarmonyRanker(records, ["1".repeat(64)])).toThrow("eval group");
  });
});
