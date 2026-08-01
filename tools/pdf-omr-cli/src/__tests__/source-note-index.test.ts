import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeAudiverisMusicXmlWithSourceIndex } from "../normalizers/audiveris";

const encode = (source: string) => new TextEncoder().encode(source);

describe("Audiveris MusicXML source note index", () => {
  it("uses raw note ordinals even when an earlier source note cannot become a Draft event", () => {
    const source = encode(`<?xml version="1.0"?>
      <score-partwise version="4.0">
        <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
        <part id="P1"><measure number="1">
          <attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
          <note><pitch><step>B</step><octave>3</octave></pitch></note>
          <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>
          <note><chord/><pitch><step>E</step><alter>-1</alter><octave>4</octave></pitch><duration>4</duration><tie type="start"/><voice>1</voice><staff>1</staff></note>
        </measure></part>
      </score-partwise>`);

    const result = normalizeAudiverisMusicXmlWithSourceIndex(source);

    expect([...result.sourceNotesByEventId.keys()]).toEqual(["P1-m0-s0-v1-e0", "P1-m0-s0-v1-e1"]);
    expect(result.sourceNotesByEventId.get("P1-m0-s0-v1-e0")).toEqual({
      locator: {
        rootFilePath: null,
        partId: "P1",
        measureIndex: 0,
        noteIndex: 1,
        preconditionSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      facts: {
        writtenPitch: { step: "C", alter: 0, octave: 4 },
        voice: 1,
        staff: 1,
        durationUnits: 4,
        chord: false,
        tieTypes: [],
      },
    });
    expect(result.sourceNotesByEventId.get("P1-m0-s0-v1-e1")).toMatchObject({
      locator: { measureIndex: 0, noteIndex: 2 },
      facts: {
        writtenPitch: { step: "E", alter: -1, octave: 4 },
        chord: true,
        tieTypes: ["start"],
      },
    });
  });

  it("retains the validated MXL root entry path", async () => {
    const fixture = fileURLToPath(new URL("../../../../test-fixtures/musicxml/generated/simple.mxl", import.meta.url));

    const result = normalizeAudiverisMusicXmlWithSourceIndex(await readFile(fixture));
    const first = result.sourceNotesByEventId.values().next().value;

    expect(first).toBeDefined();
    expect(first!.locator.rootFilePath).toBe("score.musicxml");
    expect(first!.locator.preconditionSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
