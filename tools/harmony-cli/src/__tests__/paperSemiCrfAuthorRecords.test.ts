import { describe, expect, it } from "vitest";
import { parsePaperSemiCrfAuthorSong } from "../paperSemiCrfAuthorRecords";

const xml = `<?xml version="1.0"?>
<song>
  <title>fixture</title>
  <length>1.0</length>
  <events>
    <event>
      <index>0</index><tag>B-C:maj</tag><onset>0.0</onset><duration>0.5</duration>
      <measureNumber>1</measureNumber><accent>1.0</accent>
      <notes>
        <note><pitch>C4</pitch><duration>1.0</duration><fromPrevious>False</fromPrevious><accent>1.0</accent><onset>0.0</onset></note>
        <note><pitch>E3</pitch><duration>1.0</duration><fromPrevious>False</fromPrevious><accent>1.0</accent><onset>0.0</onset></note>
      </notes>
    </event>
    <event>
      <index>1</index><tag>I-C:maj</tag><onset>0.5</onset><duration>0.5</duration>
      <measureNumber>1</measureNumber><accent>0.125</accent>
      <notes>
        <note><pitch>C4</pitch><duration>1.0</duration><fromPrevious>True</fromPrevious><accent>0.125</accent></note>
        <note><pitch>G3</pitch><duration>0.5</duration><fromPrevious>False</fromPrevious><accent>0.125</accent><onset>0.5</onset></note>
      </notes>
    </event>
  </events>
  <segments>
    <segment><chordLabel>C:maj</chordLabel><onset>0.0</onset><offset>1.0</offset><eventStart>0</eventStart><eventStop>2</eventStop></segment>
  </segments>
</song>`;

describe("paper Semi-CRF author records adapter", () => {
  it("preserves author basic events, held-note onset, bass, and gold spans", () => {
    const record = parsePaperSemiCrfAuthorSong(xml, {
      id: "fixture",
      corpus: "bach-author",
      groupId: "fold-1",
      ticksPerQuarter: 480,
    });

    expect(record.events).toHaveLength(2);
    expect(record.events[1]).toMatchObject({
      index: 1,
      startTick: 240,
      endTick: 480,
      durationTicks: 240,
      metricAccent: 0.125,
      bassPitchClass: 7,
    });
    expect(record.events[1]!.notes[0]).toMatchObject({
      soundingPitchClass: 0,
      soundingMidi: 60,
      onsetTick: 0,
      sourceDurationTicks: 480,
      heldFromPrevious: true,
    });
    expect(record.targetSegments).toEqual([{ startEvent: 0, endEvent: 2, label: "C:maj" }]);
  });

  it("rejects held notes that cannot be linked to the previous event", () => {
    expect(() =>
      parsePaperSemiCrfAuthorSong(
        xml.replace(
          "<pitch>C4</pitch><duration>1.0</duration><fromPrevious>True",
          "<pitch>D4</pitch><duration>1.0</duration><fromPrevious>True",
        ),
        {
          id: "fixture",
          corpus: "bach-author",
          groupId: "fold-1",
          ticksPerQuarter: 480,
        },
      ),
    ).toThrow("held author note has no matching previous onset");
  });
});
