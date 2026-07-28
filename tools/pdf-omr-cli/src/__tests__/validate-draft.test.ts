import { describe, expect, it } from "vitest";
import type { OmrScoreDraft } from "../schemas";
import { validateDraft } from "../validate-draft";

describe("Draft validator", () => {
  it("reports exact voice overlap and duration mismatches", () => {
    const draft = scoreDraft([note("n1", 0, 1, 2, "C", 4), note("n2", 1, 4, 1, 2, "E", 4)]);

    const report = validateDraft(draft);

    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "VOICE_EVENT_OVERLAP", severity: "blocking" }),
        expect.objectContaining({ code: "VOICE_DURATION_MISMATCH", severity: "blocking" }),
      ]),
    );
    expect(report.readiness).toEqual({ harmony: "blocked", musicXml: "blocked" });
  });

  it("keeps Harmony readiness independent from MusicXML readiness", () => {
    const draft = scoreDraft([note("n1", 0, 1, 1, "C", 4)]);

    const report = validateDraft(draft);

    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MISSING_CLEF", severity: "blocking" }),
        expect.objectContaining({ code: "MISSING_KEY_SIGNATURE", severity: "blocking" }),
      ]),
    );
    expect(report.readiness).toEqual({ harmony: "ready", musicXml: "blocked" });
  });

  it("accepts exact chords, ties, tuplets and repeats when all required facts exist", () => {
    const draft = scoreDraft(
      [
        { ...note("n1", 0, 1, 1, "C", 4), tie: "start" as const, tuplet: { actualNotes: 3, normalNotes: 2 } },
        note("n2", 0, 1, 1, "E", 4),
      ],
      {
        keySignature: { fifths: 0 },
        clef: { sign: "G", line: 2 },
        repeat: { forward: true, backward: true },
      },
    );
    draft.parts[0]!.staves[0]!.measures.push({
      index: 1,
      timeSignature: { numerator: 4, denominator: 4 },
      duration: { numerator: 1, denominator: 1 },
      keySignature: { fifths: 0 },
      clef: { sign: "G", line: 2 },
      voices: [
        {
          index: 1,
          events: [{ ...note("n3", 0, 1, 1, "C", 4), tie: "end" }],
        },
      ],
    });

    const report = validateDraft(draft);

    expect(report.diagnostics).toEqual([]);
    expect(report.readiness).toEqual({ harmony: "ready", musicXml: "ready" });
  });

  it("blocks unsafe rational projection and out-of-page source anchors", () => {
    const draft = scoreDraft([note("n1", 0, 1, 4_000_000_007, "C", 4)], {
      keySignature: { fifths: 0 },
      clef: { sign: "G", line: 2 },
    });
    draft.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!.source = {
      pageIndex: 0,
      bbox: { x: 90, y: 90, width: 20, height: 20 },
    };

    const report = validateDraft(draft, { pages: [{ width: 100, height: 100 }] });

    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNSAFE_RATIONAL_PROJECTION" }),
        expect.objectContaining({ code: "SOURCE_OUT_OF_BOUNDS" }),
      ]),
    );
    expect(report.readiness).toEqual({ harmony: "blocked", musicXml: "blocked" });
  });
});

function scoreDraft(
  events: OmrScoreDraft["parts"][number]["staves"][number]["measures"][number]["voices"][number]["events"],
  measureFacts: Partial<OmrScoreDraft["parts"][number]["staves"][number]["measures"][number]> = {},
): OmrScoreDraft {
  return {
    schemaVersion: "1.0.0",
    parts: [
      {
        id: "P1",
        name: "Piano",
        staves: [
          {
            index: 0,
            measures: [
              {
                index: 0,
                timeSignature: { numerator: 4, denominator: 4 },
                duration: { numerator: 1, denominator: 1 },
                voices: [{ index: 1, events }],
                ...measureFacts,
              },
            ],
          },
        ],
      },
    ],
    diagnostics: [],
  };
}

function note(
  id: string,
  onsetNumerator: number,
  onsetDenominator: number,
  durationDenominator: number,
  step: "A" | "B" | "C" | "D" | "E" | "F" | "G",
  octave: number,
): Extract<
  OmrScoreDraft["parts"][number]["staves"][number]["measures"][number]["voices"][number]["events"][number],
  { type: "note" }
> {
  return {
    type: "note",
    id,
    onset: { numerator: onsetNumerator, denominator: onsetDenominator },
    duration: { numerator: 1, denominator: durationDenominator },
    writtenPitch: { step, alter: 0, octave },
    soundingMidi: (octave + 1) * 12 + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[step],
  };
}
