import { describe, expect, it } from "vitest";
import {
  createHarmonyRankerFeatures,
  harmonyRankerModelSchema,
  scoreHarmonyCandidate,
} from "../paper-semi-crf-alternative-ranker";

const featureVector = {
  durationByPitchClass: [480, 0, 0, 0, 480, 0, 0, 480, 0, 0, 0, 0],
  onsetCountByPitchClass: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
  bassPitchClass: 0,
};
const cMajor = { root: { step: "C", alter: 0 }, kind: "major", degrees: [] } as const;

describe("learned harmony ranker", () => {
  it("creates transposition-relative, scale-invariant features", () => {
    const original = createHarmonyRankerFeatures(featureVector, cMajor);
    const scaled = createHarmonyRankerFeatures(
      {
        ...featureVector,
        durationByPitchClass: featureVector.durationByPitchClass.map((duration) => duration * 3),
      },
      cMajor,
    );
    expect(scaled).toEqual(original);
    expect(original).toHaveLength(37);
  });

  it("rejects corrupt model assets", () => {
    expect(() => harmonyRankerModelSchema.parse({ version: 1, featureVersion: "wrong", prototypes: [] })).toThrow();
  });

  it("scores a candidate from the nearest matching prototype", () => {
    const features = createHarmonyRankerFeatures(featureVector, cMajor);
    const model = harmonyRankerModelSchema.parse({
      version: 1,
      featureVersion: "relative-pc-presence-v1",
      algorithmVersion: "paper-semi-crf-alternatives-v1",
      trainingCorpusSha256: ["1".repeat(64)],
      trainingGroupsSha256: "0".repeat(64),
      prototypes: [{ chordShape: "major||[]|", features, frequency: 1 }],
    });
    expect(scoreHarmonyCandidate(model, featureVector, cMajor)).toBe(Math.log(2));
  });

  it("validates the bundled model asset", async () => {
    const model = harmonyRankerModelSchema.parse(
      JSON.parse(await readFile(new URL("../harmony-paper-semi-crf-alternatives.json", import.meta.url), "utf8")),
    );
    expect(model.prototypes.length).toBeGreaterThan(10);
    expect(model.trainingCorpusSha256).toHaveLength(2);
  });
});
import { readFile } from "node:fs/promises";
