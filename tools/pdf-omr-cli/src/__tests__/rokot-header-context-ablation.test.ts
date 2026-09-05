import { describe, expect, it } from "vitest";
import {
  countDiagnosticsByCode,
  snapshotSymbolicMetrics,
  uniquePredictedKeys,
} from "../benchmark/rokot-header-context-ablation";
import { computeSymbolicMetrics } from "../benchmark/symbolic-metrics";
import { musicXmlReadyDraft } from "./fixtures/musicxml-ready-draft";

describe("Rokot header-context ablation summaries", () => {
  it("snapshots staff, voice, tie and tuplet F1 next to joint quality", () => {
    const expected = musicXmlReadyDraft();
    const predicted = structuredClone(expected);
    predicted.parts[0]!.staves[0]!.measures[0]!.voices[0]!.index = 2;

    const snapshot = snapshotSymbolicMetrics(computeSymbolicMetrics(predicted, expected));

    expect(snapshot.pitchF1).toBe(1);
    expect(snapshot.jointF1).toBeLessThan(1);
    expect(snapshot.voiceF1).toBeLessThan(1);
    expect(snapshot.staffF1).toBe(1);
    expect(snapshot.tieF1).toBe(1);
    expect(Object.keys(snapshot)).toEqual([
      "pitchF1",
      "onsetF1",
      "durationF1",
      "jointF1",
      "staffF1",
      "voiceF1",
      "tieF1",
      "tupletF1",
      "validMeasures",
      "validMeasureTotal",
      "validMeasureRate",
    ]);
  });

  it("counts diagnostics by code and lists distinct predicted keys", () => {
    expect(
      countDiagnosticsByCode([
        { code: "ROKOT_MEASURE_DURATION_MISMATCH" },
        { code: "MISSING_EVENT_TIMING" },
        { code: "ROKOT_MEASURE_DURATION_MISMATCH" },
      ]),
    ).toEqual({
      MISSING_EVENT_TIMING: 1,
      ROKOT_MEASURE_DURATION_MISMATCH: 2,
    });
    expect(
      uniquePredictedKeys([
        { pageIndex: 0, systemIndex: 0, headers: { length: "1/8", meter: "2/4", key: "C" } },
        { pageIndex: 0, systemIndex: 1, headers: { length: "1/8", meter: "2/4", key: "G" } },
        { pageIndex: 1, systemIndex: 0, headers: { status: "unsafe" } },
      ]),
    ).toEqual(["C", "G"]);
  });
});
