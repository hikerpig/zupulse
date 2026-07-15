import { describe, expect, it } from "vitest";
import { chordToMusicXml, exportAnnotatedMusicXml } from "../exportMusicXmlHarmony";

const score = new TextEncoder().encode(
  `<score-partwise><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><note><pitch><step>C</step></pitch></note></measure></part></score-partwise>`,
);
describe("annotated MusicXML export", () => {
  it("writes structured chord fields and leaves input bytes untouched", () => {
    expect(chordToMusicXml({ root: { step: "C", alter: 0 }, kind: "major", degrees: [] })).toContain(
      "<kind>major</kind>",
    );
    const output = exportAnnotatedMusicXml(score, [
      { partId: "P1", measureIndex: 0, chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] } },
    ]);
    expect(new TextDecoder().decode(output)).toContain("<harmony>");
    expect(new TextDecoder().decode(score)).not.toContain("<harmony>");
  });
});
