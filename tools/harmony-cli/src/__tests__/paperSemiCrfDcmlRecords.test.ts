import { createHarmonyAnalysisInput } from "@zupulse/web-core";
import { describe, expect, it } from "vitest";
import type { DcmlPiece } from "../adapters/dcml";
import { projectDcmlPieceToPaperSemiCrfWindows } from "../paperSemiCrfDcmlRecords";

describe("paper Semi-CRF DCML records", () => {
  it("exports only contiguous losslessly mapped windows without simplifying inversions", () => {
    const piece: DcmlPiece = {
      corpus: "dcml-mozart-v2.3",
      groupId: "K1",
      input: createHarmonyAnalysisInput({
        ticksPerQuarter: 480,
        measures: [
          {
            index: 0,
            durationTicks: 1_920,
            timeSignature: { numerator: 4, denominator: 4 },
            key: "fifths:0",
          },
        ],
        tracks: [
          {
            id: "dcml",
            name: "fixture",
            isPercussion: false,
            staves: [
              {
                index: 0,
                notes: [0, 1, 2, 3].flatMap((beat) =>
                  [60, 64, 67].map((midi, voice) => ({
                    id: `${beat}:${midi}`,
                    moment: { measureIndex: 0, offsetTicks: beat * 480 },
                    durationTicks: 480,
                    soundingPitchClass: midi % 12,
                    soundingMidi: midi,
                    voice: voice + 1,
                  })),
                ),
              },
            ],
          },
        ],
      }),
      gold: [
        gold(0, 480, { root: { step: "C", alter: 0 }, kind: "major", degrees: [] }),
        gold(480, 960, {
          root: { step: "C", alter: 0 },
          bass: { step: "E", alter: 0 },
          kind: "major",
          degrees: [],
        }),
        gold(960, 1_440, { root: { step: "G", alter: 0 }, kind: "major", degrees: [] }),
        gold(1_440, 1_920, { root: { step: "C", alter: 0 }, kind: "major", degrees: [] }),
      ],
    };

    const projected = projectDcmlPieceToPaperSemiCrfWindows({
      pieceId: "K1-1",
      piece,
      labels: ["C:maj", "G:maj"],
      maxSegmentLength: 20,
    });

    expect(projected.stats).toEqual({
      gold: 4,
      supported: 3,
      excludedUnsupported: 1,
      excludedUnaligned: 0,
      excludedOverSpan: 0,
      windows: 2,
      events: 3,
    });
    expect(projected.records.map((record) => record.targetSegments)).toEqual([
      [{ startEvent: 0, endEvent: 1, label: "C:maj" }],
      [
        { startEvent: 0, endEvent: 1, label: "G:maj" },
        { startEvent: 1, endEvent: 2, label: "C:maj" },
      ],
    ]);
    expect(projected.records.flatMap((record) => record.events.map((event) => event.index))).toEqual([0, 0, 1]);
  });
});

function gold(
  start: number,
  end: number,
  chord: NonNullable<DcmlPiece["gold"][number]["chord"]>,
): DcmlPiece["gold"][number] {
  return {
    range: {
      start: { measureIndex: 0, offsetTicks: start },
      end: { measureIndex: 0, offsetTicks: end },
    },
    label: "fixture",
    family: "triad",
    weight: end - start,
    chord,
  };
}
