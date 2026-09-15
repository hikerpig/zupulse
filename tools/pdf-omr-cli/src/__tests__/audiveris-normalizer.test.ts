import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeAudiverisMusicXml } from "../normalizers/audiveris";
import { validateDraft } from "../validate-draft";

const fixture = fileURLToPath(new URL("fixtures/audiveris-output.musicxml", import.meta.url));

describe("Audiveris MusicXML normalizer", () => {
  it("reads a second staff's onset clef after backup and carries it to the next measure", () => {
    const xml = `<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
      <part id="P1"><measure number="1"><attributes><divisions>1</divisions><staves>2</staves>
      <time><beats>4</beats><beat-type>4</beat-type></time><key><fifths>0</fifths></key>
      <clef number="1"><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <attributes><clef number="2"><sign>F</sign><line>4</line></clef></attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><staff>2</staff></note>
      </measure><measure number="2">
      <note><rest/><duration>4</duration><voice>1</voice><staff>1</staff></note><backup><duration>4</duration></backup>
      <note><rest/><duration>4</duration><voice>2</voice><staff>2</staff></note></measure></part></score-partwise>`;
    const draft = normalizeAudiverisMusicXml(new TextEncoder().encode(xml));
    expect(draft.parts[0]!.staves[0]!.measures.map((m) => m.clef)).toEqual([
      { sign: "G", line: 2 },
      { sign: "G", line: 2 },
    ]);
    expect(draft.parts[0]!.staves[1]!.measures.map((m) => m.clef)).toEqual([
      { sign: "F", line: 4 },
      { sign: "F", line: 4 },
    ]);
    expect(draft.parts[0]!.staves[1]!.measures[0]!.voices[0]!.events[0]).toMatchObject({
      writtenPitch: { step: "C", alter: 0, octave: 3 },
      onset: { numerator: 0, denominator: 1 },
      duration: { numerator: 1, denominator: 1 },
    });
    expect(validateDraft(draft).readiness.musicXml).toBe("ready");
  });

  it("does not hoist a later mid-measure clef to the measure onset", () => {
    const xml = `<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
      <part id="P1"><measure number="1"><attributes><divisions>1</divisions>
      <time><beats>4</beats><beat-type>4</beat-type></time><key><fifths>0</fifths></key>
      <clef><sign>F</sign><line>4</line></clef></attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>2</duration><voice>1</voice></note>
      <attributes><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><voice>1</voice></note>
      </measure></part></score-partwise>`;
    const measure = normalizeAudiverisMusicXml(new TextEncoder().encode(xml)).parts[0]!.staves[0]!.measures[0]!;
    expect(measure.clef).toEqual({ sign: "F", line: 4 });
    expect(measure.voices[0]!.events.map((e) => e.onset)).toEqual([
      { numerator: 0, denominator: 1 },
      { numerator: 1, denominator: 2 },
    ]);
  });

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
