import { describe, expect, it } from "vitest";
import type { OmrScoreDraft } from "../schemas";
import { buildScoreEvidence } from "../fusion/build-score-evidence";

describe("buildScoreEvidence", () => {
  it("expands ordinary repeats, uses actual pickup duration, and omits tied continuation attacks", () => {
    const draft = scoreDraft([
      measure(0, {
        repeat: { forward: true, backward: false },
        events: [
          note("pickup-c", 60, rational(0, 1), rational(1, 4), "start"),
          note("pickup-e", 64, rational(0, 1), rational(1, 4)),
        ],
      }),
      measure(1, {
        repeat: { forward: false, backward: true },
        events: [note("tied-c", 60, rational(0, 1), rational(1, 4), "end")],
      }),
      measure(2, {
        events: [note("final-g", 67, rational(0, 1), rational(1, 4))],
      }),
    ]);

    const evidence = buildScoreEvidence(draft, source());

    expect(evidence.playbackMeasureOrder).toEqual([0, 1, 0, 1, 2]);
    expect(evidence.notes.map((value) => value.sourceNoteId)).toEqual([
      "pickup-c",
      "pickup-e",
      "pickup-c",
      "pickup-e",
      "final-g",
    ]);
    expect(evidence.notes.map((value) => value.playbackOnset)).toEqual([
      rational(0, 1),
      rational(0, 1),
      rational(1, 2),
      rational(1, 2),
      rational(1, 1),
    ]);
    expect(evidence.notes.map((value) => value.id)).toEqual([
      "score-p0-m0-s0-v1-e0-play0",
      "score-p0-m0-s0-v1-e1-play0",
      "score-p0-m0-s0-v1-e0-play2",
      "score-p0-m0-s0-v1-e1-play2",
      "score-p0-m2-s0-v1-e0-play4",
    ]);
  });

  it("emits a blocking diagnostic when staff repeat markers disagree", () => {
    const firstStaff = [measure(0, { repeat: { forward: true, backward: false } }), measure(1)];
    const secondStaff = [measure(0), measure(1)];
    const draft = scoreDraft(firstStaff, secondStaff);

    const evidence = buildScoreEvidence(draft, source());

    expect(evidence.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "FUSION_REPEAT_MARKERS_INCONSISTENT",
        severity: "blocking",
      }),
    );
    expect(evidence.notes).toEqual([]);
  });

  it("keeps alignable notes while reporting omitted events without timing", () => {
    const draft = scoreDraft([measure(0, { events: [note("c", 60, rational(0, 1), rational(1, 4))] })]);
    draft.diagnostics.push({
      code: "MISSING_EVENT_TIMING",
      severity: "blocking",
      message: "missing event timing at measure 0",
    });

    const evidence = buildScoreEvidence(draft, source());

    expect(evidence.notes).toHaveLength(1);
    expect(evidence.diagnostics).toEqual([
      expect.objectContaining({
        code: "FUSION_SCORE_EVENTS_WITHOUT_TIMING_OMITTED",
        severity: "warning",
        context: { count: 1 },
      }),
    ]);
  });
});

function source() {
  return {
    fileName: "score.musicxml",
    sha256: "a".repeat(64),
    sizeBytes: 100,
  };
}

function scoreDraft(
  firstStaffMeasures: OmrScoreDraft["parts"][number]["staves"][number]["measures"],
  secondStaffMeasures?: OmrScoreDraft["parts"][number]["staves"][number]["measures"],
): OmrScoreDraft {
  return {
    schemaVersion: "1.0.0",
    parts: [
      {
        id: "P1",
        name: "Piano",
        staves: [
          { index: 0, measures: firstStaffMeasures },
          ...(secondStaffMeasures === undefined ? [] : [{ index: 1, measures: secondStaffMeasures }]),
        ],
      },
    ],
    diagnostics: [],
  };
}

function measure(
  index: number,
  options: {
    repeat?: { forward: boolean; backward: boolean };
    events?: OmrScoreDraft["parts"][number]["staves"][number]["measures"][number]["voices"][number]["events"];
  } = {},
): OmrScoreDraft["parts"][number]["staves"][number]["measures"][number] {
  return {
    index,
    timeSignature: { numerator: 3, denominator: 4 },
    duration: rational(3, 4),
    ...(options.repeat === undefined ? {} : { repeat: options.repeat }),
    voices: [{ index: 1, events: options.events ?? [] }],
  };
}

function note(
  id: string,
  soundingMidi: number,
  onset: { numerator: number; denominator: number },
  duration: { numerator: number; denominator: number },
  tie?: "start" | "continue" | "end",
): OmrScoreDraft["parts"][number]["staves"][number]["measures"][number]["voices"][number]["events"][number] {
  return {
    type: "note",
    id,
    onset,
    duration,
    soundingMidi,
    ...(tie === undefined ? {} : { tie }),
  };
}

function rational(numerator: number, denominator: number) {
  return { numerator, denominator };
}
