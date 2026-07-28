import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { musicXmlReadyDraft } from "./fixtures/musicxml-ready-draft";
import { generateMusicXml } from "../generate-musicxml";
import { compareDraftMusicXml } from "../musicxml-structural-compare";

describe("Draft/MusicXML structural comparator", () => {
  it("separates parser capabilities from structural agreement", async () => {
    const draft = musicXmlReadyDraft();
    const bytes = generateMusicXml(draft, { container: "mxl" });

    const report = await compareDraftMusicXml(draft, bytes);

    expect(report).toEqual({
      schemaVersion: "1.0.0",
      parse: true,
      view: true,
      playback: true,
      structural: true,
      differences: [],
    });
  });

  it("locates pitch drift even when the generated score still parses", async () => {
    const draft = musicXmlReadyDraft();
    const entries = unzipSync(generateMusicXml(draft, { container: "mxl" }));
    const xml = new TextDecoder().decode(entries["score.musicxml"]!).replace("<step>C</step>", "<step>D</step>");
    entries["score.musicxml"] = new TextEncoder().encode(xml);
    const drifted = zipSync(entries);

    const report = await compareDraftMusicXml(draft, drifted);

    expect(report).toMatchObject({ parse: true, view: true, playback: true, structural: false });
    expect(report.differences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "PITCH_MISMATCH",
          path: expect.stringContaining("measure[0]"),
        }),
      ]),
    );
  });

  it("does not treat simultaneous input ordering as semantic drift", async () => {
    const draft = musicXmlReadyDraft();
    const events = draft.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
    events.reverse();
    const bytes = generateMusicXml(draft, { container: "mxl" });

    await expect(compareDraftMusicXml(draft, bytes)).resolves.toMatchObject({ structural: true });
  });
});
