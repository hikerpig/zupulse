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
  "unresolved-key",
  "unresolved-accidental",
]);
const indexSchema = z.number().int().nonnegative();
const sourceMeasureSchema = z
  .object({
    systemIndex: indexSchema,
    staffIndex: z.union([z.literal(0), z.literal(1)]),
    measureIndex: indexSchema,
    keyFifths: z.number().int().min(-7).max(7).nullable(),
    reason: reasonSchema,
    heads: z
      .array(
        z
          .object({
            x: z.number().finite().nonnegative(),
            y: z.number().finite().nonnegative(),
            gap: z.number().min(3).max(8),
            diatonic: z.number().int().min(0).max(69),
            alter: z.number().int().min(-1).max(1).nullable(),
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
  suggestedPitch: Pitch;
  suggestedSoundingMidi: number;
  source: { pageIndex: number; systemIndex: number; staffIndex: number; measureIndex: number; x: number; y: number };
};
type Measure = OmrScoreDraft["parts"][number]["staves"][number]["measures"][number];
type Note = Extract<Measure["voices"][number]["events"][number], { type: "note" }>;
const natural = (p: Pitch) => p.octave * 7 + "CDEFGAB".indexOf(p.step);
const midi = (p: Pitch) => 12 * (p.octave + 1) + [0, 2, 4, 5, 7, 9, 11]["CDEFGAB".indexOf(p.step)]! + p.alter;

function pairOrderedHeads(notes: Note[], heads: SourceMeasure["heads"]) {
  const times = [...new Set(notes.map((n) => n.onset.numerator / n.onset.denominator))].sort((a, b) => a - b);
  const groups = times.map((time) =>
    notes
      .filter((n) => n.onset.numerator / n.onset.denominator === time)
      .sort((a, b) => natural(a.writtenPitch!) - natural(b.writtenPitch!)),
  );
  const source: SourceMeasure["heads"][] = [];
  for (const head of [...heads].sort((a, b) => a.x - b.x)) {
    const previous = source.at(-1);
    if (previous && head.x - previous[0]!.x <= 0.5 * Math.min(head.gap, previous[0]!.gap)) previous.push(head);
    else source.push([head]);
  }
  if (groups.length !== source.length) return undefined;
  for (const [i, group] of groups.entries()) {
    const visual = source[i]!;
    visual.sort((a, b) => a.diatonic - b.diatonic);
    if (
      group.length !== visual.length ||
      new Set(group.map((n) => natural(n.writtenPitch!))).size !== group.length ||
      new Set(visual.map((h) => h.diatonic)).size !== visual.length
    )
      return undefined;
    if (
      i > 0 &&
      groups[i - 1]!.some((n) => times[i - 1]! + n.duration.numerator / n.duration.denominator > times[i]! + 1e-9)
    )
      return undefined;
  }
  return { notes: groups.flat(), heads: source.flat() };
}

export function buildPitchShadowReport(draft: OmrScoreDraft, input: PitchSource, extractorSha256: string) {
  const source = pitchSourceSchema.parse(input);
  sha256Schema.parse(extractorSha256);
  if (draft.provenance?.engine.id !== "legato" || draft.provenance.inputSha256 !== source.inputSha256) {
    throw new Error("pitch-shadow-source-identity");
  }
  const report = {
    schemaVersion: "1.0.0",
    policy: "legato-source-pitch-shadow-v2",
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
      const unorderedNotes = voice.events
        .filter((n) => n.type === "note")
        .sort((a, b) => a.onset.numerator / a.onset.denominator - b.onset.numerator / b.onset.denominator);
      if (unorderedNotes.some((n) => n.tie || n.tuplet || !n.writtenPitch || n.soundingMidi === undefined)) {
        reject("protected-or-missing-pitch");
        continue;
      }
      if (unorderedNotes.some((n) => n.soundingMidi !== midi(n.writtenPitch!))) {
        reject("unsupported-transposition");
        continue;
      }
      if (evidence.keyFifths === null || evidence.heads.some((h) => h.alter === null)) {
        reject("uncertain-source-alter");
        continue;
      }
      if (unorderedNotes.length !== evidence.heads.length) {
        reject("note-count");
        continue;
      }
      const pairing = pairOrderedHeads(unorderedNotes, evidence.heads);
      if (!pairing) {
        reject("ambiguous-note-order");
        continue;
      }
      const { notes, heads } = pairing;
      const changed = notes.flatMap((n, i) =>
        natural(n.writtenPitch!) === heads[i]!.diatonic && n.writtenPitch!.alter === heads[i]!.alter ? [] : [i],
      );
      if (!changed.length) {
        decision.reason = "consistent";
        continue;
      }
      // A boundary chord needs both an unchanged chord mate and another time group as anchors.
      // A lone boundary note has no such evidence; do not infer a missing/shifted note from pitch alone.
      const naturalChanged = changed.some((i) => natural(notes[i]!.writtenPitch!) !== heads[i]!.diatonic);
      const candidate = notes[changed[0]!]!;
      const time = (n: Note) => n.onset.numerator / n.onset.denominator;
      const chordAnchored =
        notes.some((n) => n !== candidate && time(n) === time(candidate)) &&
        notes.some((n) => time(n) !== time(candidate));
      if (
        changed.length !== 1 ||
        (naturalChanged && !chordAnchored && (changed[0] === 0 || changed[0] === notes.length - 1))
      ) {
        reject("unanchored-discrepancy");
        continue;
      }
      const i = changed[0]!,
        note = notes[i]!,
        head = heads[i]!;
      const suggestedPitch: Pitch = {
        step: "CDEFGAB"[head.diatonic % 7] as Pitch["step"],
        octave: Math.floor(head.diatonic / 7),
        alter: head.alter!,
      };
      const suggestedSoundingMidi = midi(suggestedPitch);
      if (suggestedSoundingMidi < 0 || suggestedSoundingMidi > 127) {
        reject("midi-out-of-range");
        continue;
      }
      decision.reason = "source-pitch-discrepancy";
      report.suggestions.push({
        partId: part.id,
        staffIndex: staff.index,
        measureIndex: measure.index,
        voiceIndex: voice.index,
        eventId: note.id,
        before: { ...note.writtenPitch! },
        suggestedPitch,
        suggestedSoundingMidi,
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
