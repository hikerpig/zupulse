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

  it("plans only non-source resolved entries", () => {
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
  });

  it("writes measure-relative offsets using the source MusicXML divisions", () => {
    const range = { start: { measureIndex: 0, offsetTicks: 960 }, end: { measureIndex: 1, offsetTicks: 0 } };
    const plan = planAnnotatedMusicXmlExport(
      [
        {
          type: "chord",
          range,
          chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] },
          origin: "analysis",
        },
      ],
      { partId: "P1", ticksPerQuarter: 960, divisionsByMeasure: [8] },
    );
    expect(plan[0]?.harmonyXml).toContain("<offset>8</offset>");
  });

  it("uses decimal divisions for sub-division written positions", () => {
    const plan = planAnnotatedMusicXmlExport(
      [
        {
          type: "no-chord",
          range: { start: { measureIndex: 0, offsetTicks: 1 }, end: { measureIndex: 1, offsetTicks: 0 } },
          origin: "analysis",
        },
      ],
      { partId: "P1", ticksPerQuarter: 960, divisionsByMeasure: [8] },
    );
    expect(plan[0]?.harmonyXml).toContain("<offset>0.008333333333333333</offset>");
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
