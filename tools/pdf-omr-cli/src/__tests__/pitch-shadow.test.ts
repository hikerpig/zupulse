import { describe, expect, it } from "vitest";
import { buildPitchShadowReport, pitchSourceSchema } from "../pitch-shadow";
import { canonicalJson, sha256Bytes } from "../canonical-json";
import type { OmrScoreDraft } from "../schemas";
import { applySourcePitchCorrections } from "../apply-source-pitch-corrections";

const hash = "a".repeat(64);
function fixture() {
  const draft: OmrScoreDraft = {
    schemaVersion: "1.0.0",
    diagnostics: [],
    provenance: { engine: { id: "legato", version: "test" }, inputSha256: hash },
    parts: [
      {
        id: "p1",
        name: "Piano",
        staves: [0, 1].map((index) => ({
          index,
          measures: [
            {
              index: 0,
              voices: [
                {
                  index: 1,
                  events: ["E", "F", "G"].map((step, i) => ({
                    type: "note" as const,
                    id: `s${index}-n${i}`,
                    onset: { numerator: i, denominator: 4 },
                    duration: { numerator: 1, denominator: 4 },
                    writtenPitch: { step: step as "E" | "F" | "G", octave: 4, alter: 0 },
                    soundingMidi: [64, 65, 67][i]!,
                  })),
                },
              ],
            },
          ],
        })),
      },
    ],
  };
  const source = pitchSourceSchema.parse({
    schemaVersion: "1.0.0",
    inputSha256: hash,
    extractorVersion: "test",
    pages: [
      {
        reason: "supported",
        measures: [0, 1].map((staffIndex) => ({
          systemIndex: 0,
          staffIndex,
          measureIndex: 0,
          keyFifths: 0,
          reason: "supported",
          heads: [30, staffIndex === 0 ? 32 : 31, 32].map((diatonic, i) => ({
            x: 50 + i * 20,
            y: 100,
            gap: 5,
            diatonic,
            alter: 0,
          })),
        })),
      },
    ],
  });
  return { draft, source };
}

describe("LEGATO diatonic pitch shadow", () => {
  it("reports a source-bound inner discrepancy without changing any Draft field", () => {
    const { draft, source } = fixture();
    const before = canonicalJson(draft);
    const report = buildPitchShadowReport(draft, source, hash);
    expect(report).toMatchObject({
      mode: "shadow",
      writebackReady: false,
      inputSha256: hash,
      draftSha256: sha256Bytes(new TextEncoder().encode(before)),
      extractorSha256: hash,
    });
    expect(report.suggestions).toEqual([
      expect.objectContaining({
        partId: "p1",
        staffIndex: 0,
        measureIndex: 0,
        voiceIndex: 1,
        eventId: "s0-n1",
        before: { step: "F", octave: 4, alter: 0 },
        suggestedPitch: { step: "G", octave: 4, alter: 0 },
        suggestedSoundingMidi: 67,
        source: { pageIndex: 0, systemIndex: 0, staffIndex: 0, measureIndex: 0, x: 70, y: 100 },
      }),
    ]);
    expect(canonicalJson(draft)).toBe(before);
  });

  it("rejects wrong source identity, malformed evidence and missing provenance", () => {
    const { draft, source } = fixture();
    source.inputSha256 = "b".repeat(64);
    expect(() => buildPitchShadowReport(draft, source, hash)).toThrow();
    expect(pitchSourceSchema.safeParse({ ...source, pages: [{ reason: "supported", measures: [] }] }).success).toBe(
      false,
    );
    delete draft.provenance;
    expect(() => buildPitchShadowReport(draft, source, hash)).toThrow();
  });

  it("never re-aligns or skips a mismatching source measure count", () => {
    const { draft, source } = fixture();
    source.pages.push(structuredClone(source.pages[0]!));
    expect(buildPitchShadowReport(draft, source, hash)).toMatchObject({ reason: "measure-count", suggestions: [] });
  });

  it.each(["tie", "tuplet", "polyphony", "count", "curve", "unanchored"])("abstains on %s", (kind) => {
    const { draft, source } = fixture();
    const measure = draft.parts[0]!.staves[0]!.measures[0]!;
    const note = measure.voices[0]!.events[1]!;
    if (note.type !== "note") throw new Error("fixture");
    if (kind === "tie") note.tie = "start";
    if (kind === "tuplet") note.tuplet = { actualNotes: 3, normalNotes: 2 };
    if (kind === "polyphony") measure.voices.push({ index: 2, events: [] });
    if (kind === "count") measure.voices[0]!.events.pop();
    if (kind === "curve") source.pages[0]!.measures[0]!.reason = "source-curve";
    if (kind === "unanchored") source.pages[0]!.measures[0]!.heads[0]!.diatonic = 40;
    expect(buildPitchShadowReport(draft, source, hash).suggestions).toEqual([]);
  });

  it("abstains for unsupported pages rather than dropping them from alignment", () => {
    const { draft, source } = fixture();
    source.pages.unshift({ reason: "raster-content", measures: [] });
    expect(buildPitchShadowReport(draft, source, hash)).toMatchObject({
      reason: "unsupported-source",
      suggestions: [],
    });
  });

  it("uses explicit source alter rather than copying the original spelling", () => {
    const { draft, source } = fixture();
    const heads = source.pages[0]!.measures[0]!.heads;
    heads[1]!.diatonic = 31;
    heads[0]!.alter = 1;
    const report = buildPitchShadowReport(draft, source, hash);
    expect(report.suggestions).toEqual([
      expect.objectContaining({
        eventId: "s0-n0",
        suggestedPitch: { step: "E", octave: 4, alter: 1 },
        suggestedSoundingMidi: 65,
      }),
    ]);
  });

  it("pairs unique chord pitches without treating simultaneous notes as an overlap", () => {
    const { draft, source } = fixture();
    const notes = draft.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
    notes[1]!.onset = { numerator: 0, denominator: 4 };
    const heads = source.pages[0]!.measures[0]!.heads;
    heads[1]!.x = heads[0]!.x;
    heads[1]!.diatonic = 31;
    heads[1]!.alter = 1;
    expect(buildPitchShadowReport(draft, source, hash).suggestions).toEqual([
      expect.objectContaining({
        eventId: "s0-n1",
        suggestedPitch: { step: "F", octave: 4, alter: 1 },
        suggestedSoundingMidi: 66,
      }),
    ]);
  });

  it.each(["unknown-alter", "transposition", "unison"])("abstains on %s", (reason) => {
    const { draft, source } = fixture();
    const notes = draft.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
    const heads = source.pages[0]!.measures[0]!.heads;
    if (reason === "unknown-alter") heads[1]!.alter = null;
    if (reason === "transposition" && notes[1]!.type === "note") notes[1]!.soundingMidi = 77;
    if (reason === "unison") {
      notes[1]!.onset = { numerator: 0, denominator: 4 };
      heads[1]!.x = heads[0]!.x;
      heads[1]!.diatonic = heads[0]!.diatonic;
    }
    expect(buildPitchShadowReport(draft, source, hash).suggestions).toEqual([]);
  });

  it.each([true, false])("requires a matching chord mate for an endpoint pitch change: %s", (chord) => {
    const { draft, source } = fixture();
    const notes = draft.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events;
    const heads = source.pages[0]!.measures[0]!.heads;
    heads[1]!.diatonic = 31;
    heads[2]!.diatonic = 33;
    if (chord) {
      notes[2]!.onset = { ...notes[1]!.onset };
      heads[2]!.x = heads[1]!.x;
    }
    const suggestions = buildPitchShadowReport(draft, source, hash).suggestions;
    expect(suggestions).toHaveLength(chord ? 1 : 0);
    if (chord)
      expect(suggestions[0]).toMatchObject({ eventId: "s0-n2", suggestedPitch: { step: "A", octave: 4, alter: 0 } });
  });
});

describe("source pitch correction transaction", () => {
  function readyFixture() {
    const value = fixture();
    for (const staff of value.draft.parts[0]!.staves) {
      const measure = staff.measures[0]!;
      measure.timeSignature = { numerator: 3, denominator: 4 };
      measure.duration = { numerator: 3, denominator: 4 };
      measure.clef = { sign: "G", line: 2 };
      measure.keySignature = { fifths: 0 };
    }
    return value;
  }

  it("applies only source-supported pitch fields after a real export round trip", async () => {
    const { draft, source } = readyFixture();
    const before = canonicalJson(draft);
    const result = await applySourcePitchCorrections(draft, source, hash);
    expect(result.reason).toBe("applied");
    expect(result.applied).toHaveLength(1);
    const expected = structuredClone(draft);
    const note = expected.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[1]!;
    if (note.type !== "note") throw new Error("fixture");
    note.writtenPitch = { step: "G", octave: 4, alter: 0 };
    note.soundingMidi = 67;
    expect(result.draft).toEqual(expected);
    expect(canonicalJson(draft)).toBe(before);
  });

  it("keeps the original object when there is no suggestion", async () => {
    const { draft, source } = readyFixture();
    source.pages[0]!.measures[0]!.heads[1]!.diatonic = 31;
    const result = await applySourcePitchCorrections(draft, source, hash);
    expect(result).toMatchObject({ reason: "unchanged", applied: [] });
    expect(result.draft).toBe(draft);
  });

  it("rolls back all changes when the candidate cannot be exported", async () => {
    const { draft, source } = readyFixture();
    delete draft.parts[0]!.staves[0]!.measures[0]!.timeSignature;
    const result = await applySourcePitchCorrections(draft, source, hash);
    expect(result).toMatchObject({ reason: "validation-failed", applied: [] });
    expect(result.draft).toBe(draft);
    expect(result.report.suggestions).toHaveLength(1);
  });

  it("rejects an event address shared by multiple staff objects", async () => {
    const { draft, source } = readyFixture();
    const staves = draft.parts[0]!.staves;
    staves[1]!.index = 0;
    staves[1]!.measures[0]!.voices[0]!.events[1]!.id = "s0-n1";
    const result = await applySourcePitchCorrections(draft, source, hash);
    expect(result).toMatchObject({ reason: "target-mismatch", applied: [] });
    expect(result.draft).toBe(draft);
  });
});
