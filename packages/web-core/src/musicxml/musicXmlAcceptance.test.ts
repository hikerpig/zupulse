import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createMusicXmlAdapter } from "./musicXmlAdapter";
import { getDefaultVisibleTrackIds } from "./alphaTabProjection";

describe("MusicXML acceptance fixtures", () => {
  const adapter = createMusicXmlAdapter();
  for (const name of ["single-voice.musicxml", "piano-multistaff.musicxml", "timewise.musicxml", "simple.mxl"]) {
    it(`imports ${name}`, async () => {
      const bytes = new Uint8Array(await readFile(resolve("test-fixtures/musicxml/generated", name)));
      const output = await adapter.parse({ fileName: name, bytes });
      expect(output.document.summary.trackCount).toBeGreaterThan(0);
      expect(output.capabilities.view).toBe(true);
      expect(getDefaultVisibleTrackIds(output.runtime as never).length).toBeGreaterThan(0);
    });
  }
});
