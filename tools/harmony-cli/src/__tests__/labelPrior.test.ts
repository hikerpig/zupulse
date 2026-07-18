import { describe, expect, it } from "vitest";
import { buildTrainLabelPrior } from "../labelPrior";

describe("label-only prior isolation", () => {
  it("builds a deterministic versioned asset from train groups", () => {
    expect(
      buildTrainLabelPrior("choco-v1", [
        { groupId: "song-b", split: "train", label: "G:7" },
        { groupId: "song-a", split: "train", label: "C:maj" },
        { groupId: "song-a", split: "train", label: "C:maj" },
      ]),
    ).toEqual({
      schemaVersion: "1.0.0",
      sourceCase: "choco-v1",
      split: "train",
      groups: 2,
      labels: 3,
      frequencies: { "C:maj": 2, "G:7": 1 },
    });
  });

  it("rejects tune or eval labels instead of leaking them into a prior", () => {
    expect(() => buildTrainLabelPrior("choco-v1", [{ groupId: "held-out", split: "eval", label: "C:maj" }])).toThrow(
      "label prior accepts train records only",
    );
  });
});
