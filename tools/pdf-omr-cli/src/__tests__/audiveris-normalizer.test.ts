import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeAudiverisMusicXml } from "../normalizers/audiveris";
import { validateDraft } from "../validate-draft";

const fixture = fileURLToPath(new URL("fixtures/audiveris-output.musicxml", import.meta.url));

describe("Audiveris MusicXML normalizer", () => {
  it("preserves parts, staves, voices, notes, rests, ties, tuplets and repeats", async () => {
    const bytes = await readFile(fixture);

    const draft = normalizeAudiverisMusicXml(bytes);

    expect(draft.parts).toHaveLength(1);
    expect(draft.parts[0]).toMatchObject({ id: "P1", name: "Piano" });
    expect(draft.parts[0]!.staves).toHaveLength(2);
    expect(draft.parts[0]!.staves[0]!.measures[0]).toMatchObject({
      index: 0,
      timeSignature: { numerator: 4, denominator: 4 },
      duration: { numerator: 1, denominator: 1 },
      keySignature: { fifths: -1 },
      clef: { sign: "G", line: 2 },
      repeat: { forward: true, backward: true },
      voices: [
        {
          index: 1,
          events: [
            {
              type: "note",
              id: "P1-m0-s0-v1-e0",
              onset: { numerator: 0, denominator: 1 },
              duration: { numerator: 1, denominator: 6 },
              writtenPitch: { step: "C", alter: 0, octave: 4 },
              soundingMidi: 60,
              tie: "start",
              tuplet: { actualNotes: 3, normalNotes: 2 },
            },
            {
              type: "note",
              onset: { numerator: 0, denominator: 1 },
              writtenPitch: { step: "E", alter: 0, octave: 4 },
            },
            {
              type: "rest",
              onset: { numerator: 1, denominator: 6 },
              duration: { numerator: 1, denominator: 12 },
            },
          ],
        },
      ],
    });
    expect(draft.parts[0]!.staves[1]!.measures[0]!.voices[0]).toMatchObject({
      index: 2,
      events: [
        {
          type: "note",
          onset: { numerator: 0, denominator: 1 },
          writtenPitch: { step: "G", alter: 0, octave: 3 },
        },
      ],
    });
    expect(draft.diagnostics).toEqual([]);
  });

  it("emits blocking diagnostics rather than inventing missing musical facts", () => {
    const bytes = new TextEncoder().encode(
      '<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Unknown</part-name></score-part></part-list><part id="P1"><measure number="1"><note><duration>1</duration><voice>1</voice><staff>1</staff></note></measure></part></score-partwise>',
    );

    const draft = normalizeAudiverisMusicXml(bytes);

    expect(draft.parts[0]!.staves[0]!.measures[0]).not.toHaveProperty("timeSignature");
    expect(draft.parts[0]!.staves[0]!.measures[0]!.voices).toEqual([]);
    expect(draft.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MISSING_DIVISIONS", severity: "blocking" }),
        expect.objectContaining({ code: "MISSING_TIME_SIGNATURE", severity: "blocking" }),
        expect.objectContaining({ code: "MISSING_PITCH", severity: "blocking" }),
      ]),
    );
  });

  it("keeps grace-note timing omissions as explicit warnings", () => {
    const bytes = new TextEncoder().encode(
      '<score-partwise><part-list><score-part id="P1"><part-name>Grace</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><key><fifths>0</fifths></key><clef><sign>G</sign><line>2</line></clef></attributes><note><grace/><pitch><step>C</step><octave>5</octave></pitch><voice>1</voice></note><note><pitch><step>D</step><octave>5</octave></pitch><duration>16</duration><voice>1</voice></note></measure></part></score-partwise>',
    );

    const draft = normalizeAudiverisMusicXml(bytes);

    expect(draft.diagnostics).toContainEqual(
      expect.objectContaining({ code: "MISSING_EVENT_TIMING", severity: "warning" }),
    );
    expect(validateDraft(draft).readiness).toEqual({ harmony: "ready-with-warnings", musicXml: "ready-with-warnings" });
  });

  it("rejects invalid XML as engine output instead of leaking parser failures", () => {
    expect(() => normalizeAudiverisMusicXml(new TextEncoder().encode("<score-partwise>"))).toThrow(
      expect.objectContaining({ code: "ENGINE_OUTPUT_INVALID" }),
    );
  });

  it("reads the score root from an MXL container", async () => {
    const mxlFixture = fileURLToPath(
      new URL("../../../../test-fixtures/musicxml/generated/simple.mxl", import.meta.url),
    );
    const bytes = await readFile(mxlFixture);

    const draft = normalizeAudiverisMusicXml(bytes);

    expect(draft.parts.length).toBeGreaterThan(0);
    expect(draft.parts[0]!.staves[0]!.measures.length).toBeGreaterThan(0);
  });
});
