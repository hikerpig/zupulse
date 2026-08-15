import { describe, expect, it } from "vitest";
import { mergeLegatoPageAbc, mergeLegatoPageMusicXml } from "../engines/legato-page-merge";

describe("LEGATO page merge", () => {
  it("keeps page ABC evidence and appends renumbered MusicXML measures", () => {
    const abc = mergeLegatoPageAbc(["X:1\nK:C\nC4 |]\n", "X:1\nK:C\nD4 |]\n"]);
    const musicXml = new TextDecoder().decode(mergeLegatoPageMusicXml([pageMusicXml("C", 4), pageMusicXml("D", 3)]));

    expect(abc).toContain("X:1\nK:C\nC4 |]");
    expect(abc).toContain("X:2\nK:C\nD4 |]");
    expect(musicXml.match(/<measure number="[12]">/gu)).toHaveLength(4);
    expect(musicXml).toContain("<step>C</step>");
    expect(musicXml).toContain("<step>D</step>");
  });

  it("rejects a page whose declared part has no notes", () => {
    expect(() => mergeLegatoPageMusicXml([pageMusicXml("C", 4), pageMusicXml("D", 3, "P2")])).toThrowError(
      expect.objectContaining({
        code: "ENGINE_OUTPUT_INVALID",
        context: { reason: "empty-page-part", pageNumber: 2, partId: "P2" },
      }),
    );
  });
});

function pageMusicXml(step: string, octave: number, emptyPartId?: string): Uint8Array {
  const part = (id: string) => `
  <part id="${id}"><measure number="1">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    ${
      id === emptyPartId
        ? ""
        : `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>4</duration><voice>1</voice></note>`
    }
  </measure></part>`;
  return new TextEncoder().encode(`<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Right hand</part-name></score-part>
    <score-part id="P2"><part-name>Left hand</part-name></score-part>
  </part-list>
  ${part("P1")}
  ${part("P2")}
</score-partwise>`);
}
