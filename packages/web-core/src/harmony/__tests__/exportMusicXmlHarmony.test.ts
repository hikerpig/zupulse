import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { chordToMusicXml, exportAnnotatedMusicXml, planAnnotatedMusicXmlExport } from "../exportMusicXmlHarmony";

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

  it("plans only non-source resolved entries and rejects unsupported positions", () => {
    const range = { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 1, offsetTicks: 0 } };
    const entries = [
      {
        type: "chord" as const,
        range,
        chord: { root: { step: "C" as const, alter: 0 as const }, kind: "major" as const, degrees: [] },
        origin: "analysis" as const,
      },
      {
        type: "unresolved" as const,
        range,
        reason: "low-confidence" as const,
        alternatives: [],
        origin: "analysis" as const,
      },
      { type: "no-chord" as const, range, origin: "correction" as const },
    ];
    expect(planAnnotatedMusicXmlExport(entries, { partId: "P1" }).map((item) => item.harmonyXml)).toEqual([
      expect.stringContaining("<kind>major</kind>"),
      "<harmony><kind>none</kind></harmony>",
    ]);
    expect(() =>
      planAnnotatedMusicXmlExport(
        [
          {
            ...entries[0]!,
            range: { start: { measureIndex: 0, offsetTicks: 1 }, end: { measureIndex: 1, offsetTicks: 0 } },
          },
        ],
        { partId: "P1" },
      ),
    ).toThrow("unrepresentable-harmony-position");
  });

  it.each(["timewise.musicxml", "simple.mxl"])("uses the shared writer for %s", async (fileName) => {
    const source = new Uint8Array(await readFile(resolve("test-fixtures/musicxml/generated", fileName)));
    const output = exportAnnotatedMusicXml(source, [
      { partId: "P1", measureIndex: 0, chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] } },
    ]);
    const xml = fileName.endsWith(".mxl")
      ? new TextDecoder().decode(unzipSync(output)["score.musicxml"]!)
      : new TextDecoder().decode(output);
    expect(xml).toContain("<harmony>");
  });
});
