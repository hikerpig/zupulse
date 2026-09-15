import { z } from "zod";
import { canonicalJson, sha256Bytes } from "./canonical-json";
import { sha256Schema, type OmrScoreDraft } from "./schemas";

const reasonSchema = z.enum([
  "supported",
  "raster-content",
  "unsupported-staff-layout",
  "incomplete-barlines",
  "ambiguous-barlines",
  "unassigned-glyph",
  "ambiguous-staff",
  "unsupported-font",
  "unresolved-clef",
  "off-grid-head",
  "rotated-page",
  "unsupported-notation",
  "source-curve",
]);
const indexSchema = z.number().int().nonnegative();
const sourceMeasureSchema = z
  .object({
    systemIndex: indexSchema,
    staffIndex: z.union([z.literal(0), z.literal(1)]),
    measureIndex: indexSchema,
    reason: reasonSchema,
    heads: z
      .array(
        z
          .object({
            x: z.number().finite().nonnegative(),
            y: z.number().finite().nonnegative(),
            gap: z.number().min(3).max(8),
            diatonic: z.number().int().min(0).max(69),
          })
          .strict(),
      )
      .max(2048),
  })
  .strict();
export const pitchSourceSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    inputSha256: sha256Schema,
    extractorVersion: z.string().min(1).max(100),
    pages: z
      .array(
        z
          .object({ reason: reasonSchema, measures: z.array(sourceMeasureSchema).max(2048) })
          .strict()
          .refine((page) => (page.reason === "supported" ? page.measures.length > 0 : page.measures.length === 0)),
      )
      .min(1)
      .max(32),
  })
  .strict();
export type PitchSource = z.infer<typeof pitchSourceSchema>;
type SourceMeasure = z.infer<typeof sourceMeasureSchema>;
type Pitch = { step: "A" | "B" | "C" | "D" | "E" | "F" | "G"; octave: number; alter: number };
type Suggestion = {
  partId: string;
  staffIndex: number;
  measureIndex: number;
  voiceIndex: number;
  eventId: string;
  before: Pitch;
  suggestedDiatonic: Omit<Pitch, "alter">;
  source: { pageIndex: number; systemIndex: number; staffIndex: number; measureIndex: number; x: number; y: number };
};

export function buildPitchShadowReport(draft: OmrScoreDraft, input: PitchSource, extractorSha256: string) {
  const source = pitchSourceSchema.parse(input);
  sha256Schema.parse(extractorSha256);
  if (draft.provenance?.engine.id !== "legato" || draft.provenance.inputSha256 !== source.inputSha256) {
    throw new Error("pitch-shadow-source-identity");
  }
  const report = {
    schemaVersion: "1.0.0",
    policy: "legato-diatonic-shadow-v1",
    mode: "shadow",
    writebackReady: false,
    inputSha256: source.inputSha256,
    draftSha256: sha256Bytes(new TextEncoder().encode(canonicalJson(draft))),
    extractorSha256,
    extractorVersion: source.extractorVersion,
    reason: "completed",
    suggestions: [] as Suggestion[],
    decisions: [] as { partId: string; staffIndex: number; measureIndex: number; reason: string }[],
  };
  const stop = (reason: string) => ({ ...report, reason });
  if (source.pages.some((page) => page.reason !== "supported")) return stop("unsupported-source");
  const staves = draft.parts.flatMap((part) => part.staves.map((staff) => ({ part, staff })));
  if (staves.length !== 2) return stop("unsupported-draft-layout");
  // Complete ordered correspondence only: do not repair alignment using the pitches being assessed.
  const ordered: (SourceMeasure & { pageIndex: number })[][] = [[], []];
  for (const [pageIndex, page] of source.pages.entries()) {
    const systems = [...new Set(page.measures.map((m) => m.systemIndex))].sort((a, b) => a - b);
    for (const [systemIndex, system] of systems.entries()) {
      if (systemIndex !== system) return stop("source-order");
      const bars = page.measures.filter((m) => m.systemIndex === system);
      for (const staffIndex of [0, 1]) {
        const staffBars = bars
          .filter((m) => m.staffIndex === staffIndex)
          .sort((a, b) => a.measureIndex - b.measureIndex);
        if (staffBars.length * 2 !== bars.length || !staffBars.length || staffBars.some((m, i) => m.measureIndex !== i))
          return stop("source-order");
        ordered[staffIndex]!.push(...staffBars.map((m) => ({ ...m, pageIndex })));
      }
    }
  }
  if (staves.some(({ staff }, i) => staff.measures.length !== ordered[i]!.length)) return stop("measure-count");
  if (draft.diagnostics.some((d) => d.severity === "blocking")) return stop("blocked-draft");
  for (const [staffSlot, { part, staff }] of staves.entries()) {
    for (const [ordinal, measure] of staff.measures.entries()) {
      const evidence = ordered[staffSlot]![ordinal]!;
      const decision = {
        partId: part.id,
        staffIndex: staff.index,
        measureIndex: measure.index,
        reason: evidence.reason as string,
      };
      report.decisions.push(decision);
      if (evidence.reason !== "supported") continue;
      const reject = (reason: string) => {
        decision.reason = reason;
      };
      if (measure.voices.length !== 1) {
        reject("polyphony");
        continue;
      }
      const voice = measure.voices[0]!;
      const notes = voice.events
        .filter((n) => n.type === "note")
        .sort((a, b) => a.onset.numerator / a.onset.denominator - b.onset.numerator / b.onset.denominator);
      if (notes.some((n) => n.tie || n.tuplet || !n.writtenPitch || n.soundingMidi === undefined)) {
        reject("protected-or-missing-pitch");
        continue;
      }
      const heads = [...evidence.heads].sort((a, b) => a.x - b.x);
      if (notes.length !== heads.length) {
        reject("note-count");
        continue;
      }
      if (
        heads.some((h, i) => i > 0 && h.x - heads[i - 1]!.x <= 0.5 * Math.min(h.gap, heads[i - 1]!.gap)) ||
        notes.some(
          (n, i) =>
            i > 0 &&
            n.onset.numerator / n.onset.denominator <=
              notes[i - 1]!.onset.numerator / notes[i - 1]!.onset.denominator +
                notes[i - 1]!.duration.numerator / notes[i - 1]!.duration.denominator -
                1e-9,
        )
      ) {
        reject("ambiguous-note-order");
        continue;
      }
      const changed = notes.flatMap((n, i) =>
        n.writtenPitch!.octave * 7 + "CDEFGAB".indexOf(n.writtenPitch!.step) === heads[i]!.diatonic ? [] : [i],
      );
      if (!changed.length) {
        decision.reason = "consistent";
        continue;
      }
      // An isolated inner difference has matching neighbors; wholesale pitch/rank reassignment is not evidence.
      if (changed.length !== 1 || changed[0] === 0 || changed[0] === notes.length - 1) {
        reject("unanchored-discrepancy");
        continue;
      }
      const i = changed[0]!,
        note = notes[i]!,
        head = heads[i]!;
      decision.reason = "diatonic-discrepancy";
      report.suggestions.push({
        partId: part.id,
        staffIndex: staff.index,
        measureIndex: measure.index,
        voiceIndex: voice.index,
        eventId: note.id,
        before: { ...note.writtenPitch! },
        suggestedDiatonic: {
          step: "CDEFGAB"[head.diatonic % 7] as Pitch["step"],
          octave: Math.floor(head.diatonic / 7),
        },
        source: {
          pageIndex: evidence.pageIndex,
          systemIndex: evidence.systemIndex,
          staffIndex: evidence.staffIndex,
          measureIndex: evidence.measureIndex,
          x: head.x,
          y: head.y,
        },
      });
    }
  }
  return report;
}
