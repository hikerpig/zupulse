import { describe, expect, it } from "vitest";
import { analyzeHarmony, BUNDLED_PAPER_SEMI_CRF_ALGORITHM_VERSION } from "../analyzeHarmony";
import { analyzeHarmonyPaperSemiCrf } from "../analyzePaperSemiCrf";
import { createHarmonyAnalysisInput } from "../analysisInput";
import type { PaperSemiCrfLinearModel } from "../paper-semi-crf-model";

const cMajorModel: PaperSemiCrfLinearModel = {
  schemaVersion: "paper-semi-crf-linear-v1",
  labelMappingVersion: "generic-added-notes-v1+masada-bunescu-mode-spelling-v1",
  featureVersion: "masada-bunescu-enabled-features-v1",
  labels: ["C:maj"],
  featureNames: [],
  weights: [],
  maxSegmentLength: 20,
};

describe("analyzeHarmonyPaperSemiCrf", () => {
  it("uses the exact Semi-CRF path for production ranges and primary chords", () => {
    const input = createHarmonyAnalysisInput({
      ticksPerQuarter: 480,
      measures: [{ index: 0, durationTicks: 1920, timeSignature: { numerator: 4, denominator: 4 } }],
      tracks: [
        {
          id: "piano",
          name: "Piano",
          isPercussion: false,
          staves: [
            {
              index: 0,
              notes: [0, 4, 7].map((soundingPitchClass, index) => ({
                id: `note-${index}`,
                moment: { measureIndex: 0, offsetTicks: 0 },
                durationTicks: 1920,
                soundingPitchClass,
                soundingMidi: 60 + soundingPitchClass,
                voice: 1,
              })),
            },
          ],
        },
      ],
    });

    const segments = analyzeHarmonyPaperSemiCrf(input, {
      includedTrackIds: ["piano"],
      model: cMajorModel,
      topK: 3,
      decisionThreshold: 0,
    });

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      status: "resolved",
      range: {
        start: { measureIndex: 0, offsetTicks: 0 },
        end: { measureIndex: 0, offsetTicks: 1920 },
      },
      chord: { root: { step: "C", alter: 0 }, kind: "major" },
    });
    expect(segments[0]?.alternatives).toHaveLength(3);
  });

  it("uses the frozen Mozart Semi-CRF model through the production entry point", () => {
    const input = createHarmonyAnalysisInput({
      ticksPerQuarter: 480,
      measures: [{ index: 0, durationTicks: 1920, timeSignature: { numerator: 4, denominator: 4 } }],
      tracks: [
        {
          id: "piano",
          name: "Piano",
          isPercussion: false,
          staves: [
            {
              index: 0,
              notes: [0, 4, 7].map((soundingPitchClass, index) => ({
                id: `production-note-${index}`,
                moment: { measureIndex: 0, offsetTicks: 0 },
                durationTicks: 1920,
                soundingPitchClass,
                soundingMidi: 60 + soundingPitchClass,
                voice: 1,
              })),
            },
          ],
        },
      ],
    });

    const segments = analyzeHarmony(input, {
      includedTrackIds: ["piano"],
      topK: 8,
      decisionThreshold: 0,
    });

    expect(BUNDLED_PAPER_SEMI_CRF_ALGORITHM_VERSION).toContain(
      "6fb18d1245aea9d89f5568a9b384b405c5326cb37015cc2caa5ade8dad5f7515",
    );
    expect(segments[0]).toMatchObject({ status: "resolved", chord: { root: { step: "C" }, kind: "major" } });
  });

  it("keeps rule confidence separate from the CRF path score", () => {
    const input = createHarmonyAnalysisInput({
      ticksPerQuarter: 480,
      measures: [{ index: 0, durationTicks: 480, timeSignature: { numerator: 1, denominator: 4 } }],
      tracks: [
        {
          id: "piano",
          name: "Piano",
          isPercussion: false,
          staves: [
            {
              index: 0,
              notes: [
                {
                  id: "c",
                  moment: { measureIndex: 0, offsetTicks: 0 },
                  durationTicks: 480,
                  soundingPitchClass: 0,
                  soundingMidi: 60,
                  voice: 1,
                },
              ],
            },
          ],
        },
      ],
    });

    const segments = analyzeHarmonyPaperSemiCrf(input, {
      includedTrackIds: ["piano"],
      model: cMajorModel,
      decisionThreshold: 1,
    });

    expect(segments[0]).toMatchObject({ status: "unresolved", reason: "low-confidence" });
  });
});
