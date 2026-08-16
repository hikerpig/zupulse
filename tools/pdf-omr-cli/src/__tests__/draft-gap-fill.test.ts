import { describe, expect, it } from "vitest";
import { fillVoiceGapsWithRests } from "../draft-gap-fill";
import { validateDraft } from "../validate-draft";
import { omrScoreDraftSchema, type OmrScoreDraft } from "../schemas";

function draftWithVoice(events: { onset: [number, number]; duration: [number, number] }[]): OmrScoreDraft {
  return omrScoreDraftSchema.parse({
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
                duration: { numerator: 4, denominator: 4 },
                keySignature: { fifths: 0 },
                clef: { sign: "G", line: 2 },
                voices: [
                  {
                    index: 1,
                    events: events.map((event, index) => ({
                      type: "note",
                      id: `P1-m0-s0-v1-e${index}`,
                      onset: { numerator: event.onset[0], denominator: event.onset[1] },
                      duration: { numerator: event.duration[0], denominator: event.duration[1] },
                      writtenPitch: { step: "C", alter: 0, octave: 4 },
                      soundingMidi: 60,
                    })),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    diagnostics: [],
  });
}

describe("fillVoiceGapsWithRests", () => {
  it("leaves a complete voice untouched", () => {
    const draft = draftWithVoice([
      { onset: [0, 1], duration: [1, 2] },
      { onset: [1, 2], duration: [1, 2] },
    ]);

    const filled = fillVoiceGapsWithRests(draft);

    expect(filled).toEqual(draft);
  });

  it("pads an underfilled voice with a trailing rest and reports a warning", () => {
    const draft = draftWithVoice([{ onset: [0, 1], duration: [3, 4] }]);

    const filled = fillVoiceGapsWithRests(draft);
    const voice = filled.parts[0]!.staves[0]!.measures[0]!.voices[0]!;

    expect(voice.events).toHaveLength(2);
    expect(voice.events[1]).toMatchObject({
      type: "rest",
      id: "P1-m0-s0-v1-fill0",
      onset: { numerator: 3, denominator: 4 },
      duration: { numerator: 1, denominator: 4 },
    });
    expect(filled.diagnostics).toEqual([
      { code: "IMPLICIT_REST_FILL", severity: "warning", message: "implicit rest inserted in measure 0" },
    ]);
    expect(validateDraft(filled).readiness).toEqual({
      harmony: "ready-with-warnings",
      musicXml: "ready-with-warnings",
    });
  });

  it("fills an internal gap without disturbing later onsets", () => {
    const draft = draftWithVoice([
      { onset: [0, 1], duration: [1, 4] },
      { onset: [1, 2], duration: [1, 2] },
    ]);

    const filled = fillVoiceGapsWithRests(draft);
    const events = filled.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;

    expect(events.map((event) => event.type)).toEqual(["note", "rest", "note"]);
    expect(events[1]).toMatchObject({
      onset: { numerator: 1, denominator: 4 },
      duration: { numerator: 1, denominator: 4 },
    });
    expect(events[2]).toMatchObject({ onset: { numerator: 1, denominator: 2 } });
  });

  it("does not fill across overlapping events", () => {
    const draft = draftWithVoice([
      { onset: [0, 1], duration: [3, 4] },
      { onset: [1, 2], duration: [1, 2] },
    ]);

    const filled = fillVoiceGapsWithRests(draft);
    const events = filled.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;

    expect(events).toHaveLength(2);
    expect(validateDraft(filled).diagnostics.some((d) => d.code === "VOICE_EVENT_OVERLAP")).toBe(true);
  });
});
