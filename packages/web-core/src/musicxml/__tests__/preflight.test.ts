import { describe, expect, it } from "vitest";
import { preflightMusicXml, preflightMxlEntries } from "../preflight";

const xml = (value: string) => new TextEncoder().encode(value);

describe("MusicXML preflight", () => {
  it("extracts root structure and bounded counts", () => {
    expect(
      preflightMusicXml(
        xml(
          `<?xml version="1.0"?><score-partwise version="4.0"><part id="P1"><measure number="1"><note/></measure></part></score-partwise>`,
        ),
      ),
    ).toMatchObject({ root: "score-partwise", version: "4.0", partCount: 1, measureCount: 1, noteCount: 1 });
  });

  it("rejects malformed and opus XML", () => {
    expect(() => preflightMusicXml(xml("<score-partwise><part>"))).toThrow("malformed");
    expect(() => preflightMusicXml(xml("<opus/>"))).toThrow("unsupported");
  });

  it("enforces MXL budgets and resolves the declared rootfile", () => {
    const entries = [
      {
        name: "META-INF/container.xml",
        uncompressedSize: 100,
        bytes: xml(`<container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>`),
      },
      { name: "score.musicxml", uncompressedSize: 100, bytes: xml("<score-partwise/>") },
    ];
    expect(preflightMxlEntries(entries).rootFileName).toBe("score.musicxml");
    expect(() => preflightMxlEntries(entries, { maxEntries: 1 })).toThrow("resource-limit-exceeded");
    expect(() => preflightMxlEntries(entries.slice(1))).toThrow("mxl-container-missing");
  });
});
