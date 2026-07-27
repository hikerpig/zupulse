import { describe, expect, it } from "vitest";
import { createHarmonyAnalysisInput } from "../analysisInput";
import { bundledPaperSemiCrfModel } from "../bundledPaperSemiCrf";
import { buildPaperSemiCrfEvents } from "../paper-semi-crf-events";
import {
  createPaperSemiCrfFactorizedLinearScorers,
  createPaperSemiCrfNamedFeatureProvider,
  extractPaperSemiCrfTransitionFeature,
} from "../paper-semi-crf-features";
import { createPaperSemiCrfLabelInventory, type PaperSemiCrfSupportedLabel } from "../paper-semi-crf-labels";
import {
  compilePaperSemiCrfFeatureWeights,
  PaperSemiCrfBinnedFeature,
  PaperSemiCrfFixedFeature,
  PaperSemiCrfRole,
  PaperSemiCrfRoleBinnedFeature,
  PaperSemiCrfRoleFeature,
} from "../paper-semi-crf-compiled-weights";

describe("compiled paper Semi-CRF feature weights", () => {
  it("compiles retained named features into fixed numeric tables", () => {
    const compiled = compilePaperSemiCrfFeatureWeights({
      featureNames: [
        "ROOT_COVERED",
        "PURITY_80",
        "DURATION_THIRD_COVERED_50",
        "FIRST_BASS_IS_FIFTH",
        "BEGINNING_ACCENTED_0.5",
      ],
      weights: [1, 2, 3, 4, 5],
    });

    expect(compiled.fixed[PaperSemiCrfFixedFeature.RootCovered]).toBe(1);
    expect(compiled.binned[PaperSemiCrfBinnedFeature.Purity]![8]).toBe(2);
    expect(compiled.roleBinned[PaperSemiCrfRoleBinnedFeature.DurationCovered]![PaperSemiCrfRole.Third]![5]).toBe(3);
    expect(compiled.role[PaperSemiCrfRoleFeature.FirstBassIs]![PaperSemiCrfRole.Fifth]).toBe(4);
    expect(compiled.beginningAccent.get(0.5)).toBe(5);
  });

  it("uses zero for feature names that were not retained by the model", () => {
    const compiled = compilePaperSemiCrfFeatureWeights({
      featureNames: ["PURITY_101"],
      weights: [7],
    });

    expect(compiled.fixed[PaperSemiCrfFixedFeature.RootCovered]).toBe(0);
    expect(compiled.binned[PaperSemiCrfBinnedFeature.Purity]![11]).toBe(7);
    expect(compiled.binned[PaperSemiCrfBinnedFeature.Purity]![0]).toBe(0);
    expect(compiled.beginningAccent.get(1)).toBeUndefined();
  });

  it("rejects weights that do not match the dictionary", () => {
    expect(() =>
      compilePaperSemiCrfFeatureWeights({
        featureNames: ["ROOT_COVERED"],
        weights: [],
      }),
    ).toThrow("paper semi-CRF weights must match feature dictionary");
  });

  it("strictly matches the named reference for every bundled label and transition", () => {
    const input = createHarmonyAnalysisInput({
      ticksPerQuarter: 480,
      measures: [{ index: 0, durationTicks: 1440, timeSignature: { numerator: 3, denominator: 4 } }],
      tracks: [
        {
          id: "piano",
          name: "Piano",
          isPercussion: false,
          staves: [
            {
              index: 0,
              notes: [
                pitchedNote("c", 0, 0, 960, 60),
                pitchedNote("e", 4, 0, 480, 64),
                pitchedNote("fs", 6, 480, 480, 66),
                pitchedNote("g", 7, 960, 480, 67),
              ],
            },
          ],
        },
      ],
    });
    const events = buildPaperSemiCrfEvents(input, { includedTrackIds: ["piano"] });
    const labels = createPaperSemiCrfLabelInventory(bundledPaperSemiCrfModel.labels)
      .labels as PaperSemiCrfSupportedLabel[];
    const dictionary = {
      featureVersion: bundledPaperSemiCrfModel.featureVersion,
      featureNames: bundledPaperSemiCrfModel.featureNames,
    };
    const weightsByName = new Map(
      dictionary.featureNames.map((name, index) => [name, bundledPaperSemiCrfModel.weights[index]!] as const),
    );
    const named = createPaperSemiCrfNamedFeatureProvider({ events, labels });
    const compiled = createPaperSemiCrfFactorizedLinearScorers({
      events,
      labels,
      dictionary,
      weights: bundledPaperSemiCrfModel.weights,
    });

    for (let startEvent = 0; startEvent < events.length; startEvent += 1) {
      for (let endEvent = startEvent + 1; endEvent <= events.length; endEvent += 1) {
        for (const label of labels) {
          const segment = { startEvent, endEvent, labelId: label.id };
          const expected = named({ segment }).reduce((score, feature) => score + (weightsByName.get(feature) ?? 0), 0);
          expect(compiled.segmentPotential(segment)).toBe(expected);
        }
      }
    }
    for (const current of labels) {
      for (const previous of labels) {
        expect(compiled.transitionPotential(current.id, previous.id)).toBe(
          weightsByName.get(extractPaperSemiCrfTransitionFeature(current, previous)) ?? 0,
        );
      }
    }
  });
});

function pitchedNote(id: string, soundingPitchClass: number, offsetTicks: number, durationTicks: number, midi: number) {
  return {
    id,
    moment: { measureIndex: 0, offsetTicks },
    durationTicks,
    soundingPitchClass,
    soundingMidi: midi,
    voice: 1,
  };
}
