import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TextDecoder, TextEncoder } from "node:util";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { insertMusicXmlHarmony, listMusicXmlPartIds } from "../musicXmlRoundTrip";
import { createMusicXmlAdapter } from "../../musicxml/musicXmlAdapter";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const encode = (source: string) => new TextEncoder().encode(source);
const harmony = "<harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>";

describe("insertMusicXmlHarmony", () => {
  it("lists original part IDs in the same order as projected tracks for partwise, timewise, and MXL sources", async () => {
    expect(
      listMusicXmlPartIds(
        encode(
          `<score-partwise><part id="Violin"><measure/></part><part id="Cello"><measure/></part></score-partwise>`,
        ),
      ),
    ).toEqual(["Violin", "Cello"]);
    expect(
      listMusicXmlPartIds(
        encode(
          `<score-timewise><part-list><score-part id="Flute"/><score-part id="Oboe"/></part-list><measure/></score-timewise>`,
        ),
      ),
    ).toEqual(["Flute", "Oboe"]);
    const mxl = new Uint8Array(await readFile(resolve("test-fixtures/musicxml/generated/simple.mxl")));
    expect(listMusicXmlPartIds(mxl)).toEqual(["P1"]);
  });

  it("inserts harmony into the requested partwise measure without rewriting unknown source content", () => {
    const source = `<?xml version="1.0"?><score-partwise version="4.0" data-vendor="keep"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes><!-- retain --><direction placement="above"><direction-type><words>dolce</words></direction-type></direction><note color="#123456"><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure></part></score-partwise>`;

    const result = decode(
      insertMusicXmlHarmony(encode(source), [{ partId: "P1", measureIndex: 0, harmonyXml: harmony }]),
    );

    expect(result).toContain(`<attributes><divisions>1</divisions></attributes>${harmony}<!-- retain -->`);
    expect(result).toContain(
      '<direction placement="above"><direction-type><words>dolce</words></direction-type></direction>',
    );
    expect(result).toContain('<note color="#123456">');
  });

  it("inserts harmony into the requested score-timewise part without changing sibling parts", () => {
    const source = `<?xml version="1.0"?><score-timewise version="4.0"><part-list><score-part id="P1"><part-name>One</part-name></score-part><score-part id="P2"><part-name>Two</part-name></score-part></part-list><measure number="1"><part id="P1"><note><rest/><duration>1</duration></note></part><part id="P2"><note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration></note></part></measure></score-timewise>`;

    const result = decode(
      insertMusicXmlHarmony(encode(source), [{ partId: "P2", measureIndex: 0, harmonyXml: harmony }]),
    );

    expect(result).toContain(`<part id="P2">${harmony}<note><pitch><step>D</step>`);
    expect(result).toContain('<part id="P1"><note><rest/><duration>1</duration></note></part>');
  });

  it("rejects a missing part or measure instead of writing at a nearby location", () => {
    const source = `<score-partwise version="4.0"><part-list/><part id="P1"><measure number="1"/></part></score-partwise>`;

    expect(() =>
      insertMusicXmlHarmony(encode(source), [{ partId: "P2", measureIndex: 0, harmonyXml: harmony }]),
    ).toThrow("target-not-found");
  });

  it("rejects external entity declarations before parsing source XML", () => {
    const source = `<!DOCTYPE score-partwise SYSTEM "https://example.test/score.dtd"><score-partwise version="4.0"><part-list/></score-partwise>`;

    expect(() => insertMusicXmlHarmony(encode(source), [])).toThrow("unsupported-format");
  });

  it.each(["single-voice.musicxml", "timewise.musicxml"])("can reimport annotated %s", async (name) => {
    const source = new Uint8Array(await readFile(resolve("test-fixtures/musicxml/generated", name)));
    const annotated = insertMusicXmlHarmony(source, [{ partId: "P1", measureIndex: 0, harmonyXml: harmony }]);

    const output = await createMusicXmlAdapter().parse({ fileName: name, bytes: annotated });

    expect(output.document.summary.trackCount).toBeGreaterThan(0);
  });

  it("updates only the MXL root score while retaining its container entry", async () => {
    const source = new Uint8Array(await readFile(resolve("test-fixtures/musicxml/generated/simple.mxl")));

    const annotated = insertMusicXmlHarmony(source, [{ partId: "P1", measureIndex: 0, harmonyXml: harmony }]);
    const entries = unzipSync(annotated);

    expect(decode(entries["score.musicxml"]!)).toContain(harmony);
    expect(decode(entries["META-INF/container.xml"]!)).toContain('full-path="score.musicxml"');
    expect(decode(entries["attachments/layout.xml"]!)).toBe('<layout vendor="keep"/>');
    await expect(createMusicXmlAdapter().parse({ fileName: "simple.mxl", bytes: annotated })).resolves.toBeDefined();
  });
});
