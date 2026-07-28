import { createMusicXmlAdapter, projectAlphaTabHarmonyInput } from "@zupulse/web-core";
import { describe, expect, it } from "vitest";
import { normalizeAudiverisMusicXml } from "../normalizers/audiveris";
import { projectDraftHarmony } from "../project-harmony";
import type { OmrScoreDraft } from "../schemas";

const musicXml = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes>
      <divisions>1</divisions><key><fifths>0</fifths></key>
      <time><beats>4</beats><beat-type>4</beat-type></time>
      <clef><sign>G</sign><line>2</line></clef>
    </attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice></note>
  </measure></part>
</score-partwise>`;

describe("Draft Harmony projection", () => {
  it("matches the current MusicXML projection for core written-time and pitch facts", async () => {
    const bytes = new TextEncoder().encode(musicXml);
    const parsed = await createMusicXmlAdapter().parse({ fileName: "score.musicxml", bytes });
    const current = projectAlphaTabHarmonyInput(parsed.runtime as never);
    const draft = normalizeAudiverisMusicXml(bytes);

    const projected = projectDraftHarmony(draft);

    expect(projected.ticksPerQuarter).toBe(current.ticksPerQuarter);
    expect(projected.measures).toEqual(current.measures);
    expect(projected.tracks[0]).toMatchObject({
      name: current.tracks[0]!.name,
      isPercussion: false,
      staves: [
        {
          index: 0,
          notes: [
            {
              moment: current.tracks[0]!.staves[0]!.notes[0]!.moment,
              durationTicks: current.tracks[0]!.staves[0]!.notes[0]!.durationTicks,
              soundingMidi: 60,
              soundingPitchClass: 0,
              spelling: { step: "C", alter: 0 },
              voice: 1,
            },
          ],
        },
      ],
    });
  });

  it("does not turn OMR confidence or diagnostics into Harmony certainty", () => {
    const draft = normalizeAudiverisMusicXml(new TextEncoder().encode(musicXml));
    const note = draft.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
    note.confidence = 0.12;
    draft.diagnostics.push({ code: "OMR_LOW_CONFIDENCE", severity: "warning", message: "review note" });

    const projected = projectDraftHarmony(draft);

    expect(projected.tracks[0]!.staves[0]!.notes[0]).not.toHaveProperty("velocity");
    expect(projected.sourceHarmony).toEqual([]);
  });

  it("fails instead of approximating an unsafe tick projection", () => {
    const draft = normalizeAudiverisMusicXml(new TextEncoder().encode(musicXml));
    const event = draft.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
    event.duration = { numerator: 1, denominator: 4_000_000_007 };

    expect(() => projectDraftHarmony(draft as OmrScoreDraft)).toThrow(
      expect.objectContaining({ code: "PROJECTION_OR_EXPORT_FAILED" }),
    );
  });
});
