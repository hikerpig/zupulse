import { describe, expect, it } from "vitest";
import { buildPitchShadowReport, pitchSourceSchema } from "../pitch-shadow";
import { canonicalJson, sha256Bytes } from "../canonical-json";
import type { OmrScoreDraft } from "../schemas";

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
          reason: "supported",
          heads: [30, staffIndex === 0 ? 32 : 31, 32].map((diatonic, i) => ({
            x: 50 + i * 20,
            y: 100,
            gap: 5,
            diatonic,
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
        suggestedDiatonic: { step: "G", octave: 4 },
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
});
