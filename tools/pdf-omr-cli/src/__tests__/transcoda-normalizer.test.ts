import { describe, expect, it } from "vitest";
import { normalizeTranscodaOutput, prepareTranscodaKern } from "../normalizers/transcoda";

const musicXml = new TextEncoder().encode(`<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
  </measure></part>
</score-partwise>`);

describe("Transcoda normalizer", () => {
  it("adds the only allowed unambiguous kern repair as a diagnostic", () => {
    const prepared = prepareTranscodaKern(new TextEncoder().encode("**kern\n*M4/4\n1c\n"));

    expect(new TextDecoder().decode(prepared.bytes)).toBe("**kern\n*M4/4\n1c\n*-\n");
    expect(prepared.diagnostics).toEqual([
      {
        code: "TRANSCODA_APPENDED_TERMINATOR",
        severity: "warning",
        message: "appended missing Humdrum spine terminator",
      },
    ]);
  });

  it("rejects inconsistent spines instead of guessing structure", () => {
    expect(() => prepareTranscodaKern(new TextEncoder().encode("**kern\t**kern\n4c\n*-\t*-\n"))).toThrowError(
      expect.objectContaining({ code: "ENGINE_OUTPUT_INVALID" }),
    );
  });

  it("normalizes converted MusicXML and preserves adapter diagnostics", () => {
    const draft = normalizeTranscodaOutput(musicXml, [
      {
        code: "TRANSCODA_APPENDED_TERMINATOR",
        severity: "warning",
        message: "appended missing Humdrum spine terminator",
      },
    ]);

    expect(draft.parts).toHaveLength(1);
    expect(draft.diagnostics).toContainEqual({
      code: "TRANSCODA_APPENDED_TERMINATOR",
      severity: "warning",
      message: "appended missing Humdrum spine terminator",
    });
  });
});
