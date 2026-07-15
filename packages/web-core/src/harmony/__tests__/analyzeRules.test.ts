import { describe, expect, it } from "vitest";
import { analyzeHarmonyRules } from "../analyzeRules";
import { createHarmonyAnalysisInput } from "../analysisInput";

describe("analyzeHarmonyRules", () => {
  it("produces a structured top-k result for each scoped measure", () => {
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
              notes: [
                {
                  id: "c",
                  moment: { measureIndex: 0, offsetTicks: 0 },
                  durationTicks: 1920,
                  soundingPitchClass: 0,
                  voice: 1,
                },
                {
                  id: "e",
                  moment: { measureIndex: 0, offsetTicks: 0 },
                  durationTicks: 1920,
                  soundingPitchClass: 4,
                  voice: 1,
                },
                {
                  id: "g",
                  moment: { measureIndex: 0, offsetTicks: 0 },
                  durationTicks: 1920,
                  soundingPitchClass: 7,
                  voice: 1,
                },
              ],
            },
          ],
        },
      ],
    });

    const segments = analyzeHarmonyRules(input, { includedTrackIds: ["piano"], topK: 3, decisionThreshold: 0 });

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ status: "resolved", chord: { root: { step: "C" }, kind: "major" } });
    expect(segments[0]?.alternatives).toHaveLength(3);
  });

  it("uses cross-measure evidence when decoding a sequence", () => {
    const input = createHarmonyAnalysisInput({
      ticksPerQuarter: 480,
      measures: [
        { index: 0, durationTicks: 480, timeSignature: { numerator: 4, denominator: 4 } },
        { index: 1, durationTicks: 480, timeSignature: { numerator: 4, denominator: 4 } },
      ],
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
                  voice: 1,
                },
                {
                  id: "e",
                  moment: { measureIndex: 0, offsetTicks: 0 },
                  durationTicks: 480,
                  soundingPitchClass: 4,
                  voice: 1,
                },
                {
                  id: "g",
                  moment: { measureIndex: 0, offsetTicks: 0 },
                  durationTicks: 480,
                  soundingPitchClass: 7,
                  voice: 1,
                },
                {
                  id: "c2",
                  moment: { measureIndex: 1, offsetTicks: 0 },
                  durationTicks: 480,
                  soundingPitchClass: 0,
                  voice: 1,
                },
                {
                  id: "e2",
                  moment: { measureIndex: 1, offsetTicks: 0 },
                  durationTicks: 480,
                  soundingPitchClass: 4,
                  voice: 1,
                },
                {
                  id: "g2",
                  moment: { measureIndex: 1, offsetTicks: 0 },
                  durationTicks: 480,
                  soundingPitchClass: 7,
                  voice: 1,
                },
              ],
            },
          ],
        },
      ],
    });
    const segments = analyzeHarmonyRules(input, { includedTrackIds: ["piano"], topK: 3, decisionThreshold: 0 });
    expect(segments).toHaveLength(1);
    expect(segments[0]?.range.end).toEqual({ measureIndex: 1, offsetTicks: 480 });
  });
});
