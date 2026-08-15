import { createMusicXmlAdapter } from "@zupulse/web-core";
import { unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import { musicXmlReadyDraft } from "./fixtures/musicxml-ready-draft";
import { generateMusicXml } from "../generate-musicxml";

describe("Draft MusicXML generator", () => {
  it("generates deterministic MXL for the supported notation subset", async () => {
    const draft = musicXmlReadyDraft();

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const first = generateMusicXml(draft, { container: "mxl" });
    vi.setSystemTime(new Date("2026-08-14T00:00:00.000Z"));
    const second = generateMusicXml(draft, { container: "mxl" });
    vi.useRealTimers();

    expect(first).toEqual(second);
    const entries = unzipSync(first);
    const xml = new TextDecoder().decode(entries["score.musicxml"]!);
    expect(xml).toContain("<score-partwise");
    expect(xml).toContain('<repeat direction="forward"/>');
    expect(xml).toContain("<time-modification>");
    expect(xml).toContain('<tie type="start"/>');
    expect(xml).toContain("<rest/>");
    await expect(createMusicXmlAdapter().parse({ fileName: "score.mxl", bytes: first })).resolves.toMatchObject({
      capabilities: { view: true, playback: true },
    });
  });

  it("blocks export instead of inventing required notation facts", () => {
    const draft = musicXmlReadyDraft();
    delete draft.parts[0]!.staves[0]!.measures[0]!.clef;

    expect(() => generateMusicXml(draft, { container: "xml" })).toThrow(
      expect.objectContaining({ code: "PROJECTION_OR_EXPORT_FAILED" }),
    );
  });
});
