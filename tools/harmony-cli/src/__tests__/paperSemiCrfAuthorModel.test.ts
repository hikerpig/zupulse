import { describe, expect, it } from "vitest";
import { parsePaperSemiCrfAuthorModelText } from "../paperSemiCrfAuthorModel";

const modelText = `Max span: 20
Labels:
C:maj (id: 1)
G:min (id: 0)
Num features: 3
Features:
BEGINNING_ACCENTED

    1.0 1 2.5
CHORD_BIGRAM

    min_maj_7 2 -1.25
ROOT_COVERED

     0 0.75
`;

describe("paper Semi-CRF author model adapter", () => {
  it("maps author feature ids to the strict TypeScript linear model", () => {
    expect(parsePaperSemiCrfAuthorModelText(modelText)).toEqual({
      schemaVersion: "paper-semi-crf-linear-v1",
      labelMappingVersion: "generic-added-notes-v1+masada-bunescu-mode-spelling-v1",
      featureVersion: "masada-bunescu-enabled-features-v1",
      labels: ["G:min", "C:maj"],
      featureNames: ["ROOT_COVERED", "BEGINNING_ACCENTED_1.0", "CHORD_BIGRAM_min_maj_7"],
      weights: [0.75, 2.5, -1.25],
      maxSegmentLength: 20,
    });
  });

  it("rejects missing feature ids", () => {
    expect(() => parsePaperSemiCrfAuthorModelText(modelText.replace("min_maj_7 2 -1.25", "min_maj_7 3 -1.25"))).toThrow(
      "author model feature ids must be contiguous",
    );
  });
});
