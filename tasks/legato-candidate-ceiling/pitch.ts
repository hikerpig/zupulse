import type { OmrScoreDraft } from "../../tools/pdf-omr-cli/src/schemas";
import { sourceScope } from "./alter";
import { rankPairs } from "./rank";
type Measure = OmrScoreDraft["parts"][number]["staves"][number]["measures"][number];
type Pitch = { step: "C" | "D" | "E" | "F" | "G" | "A" | "B"; octave: number; alter: number };

export function correctPitch(input: Measure, heads: ReturnType<typeof sourceScope>["heads"]) {
  const reject = (reason: string) => ({
    measure: input,
    changes: [] as { id: string; before: Pitch; after: Pitch }[],
    reason,
  });
  const notes = input.voices.flatMap((v) => v.events).filter((e) => e.type === "note");
  if (notes.some((n) => n.tie)) return reject("tied-measure");
  if (notes.some((n) => !n.writtenPitch || n.soundingMidi === undefined)) return reject("missing-pitch");
  if (heads.some((h) => !h.alters || h.alters.length !== 1)) return reject("uncertain-source-alter");
  const natural = (p: Pitch) => p.octave * 7 + "CDEFGAB".indexOf(p.step);
  const midi = (p: Pitch) => 12 * (p.octave + 1) + [0, 2, 4, 5, 7, 9, 11]["CDEFGAB".indexOf(p.step)]! + p.alter;
  const mapping = rankPairs(
    notes.map((n) => ({
      id: n.id,
      pitch: natural(n.writtenPitch!),
      onset: `${n.onset.numerator}/${n.onset.denominator}`,
    })),
    heads,
  );
  if (mapping.reason !== "paired") return reject(mapping.reason);
  const available = [...heads].sort((a, b) => a.x - b.x);
  const changes: { id: string; before: Pitch; after: Pitch }[] = [];
  for (const pair of mapping.pairs) {
    // The ranker emits chronological groups and rejects unisons; equal-pitch occurrences retain x order.
    const index = available.findIndex((h) => h.pitch === pair.pitch);
    const head = available.splice(index, 1)[0]!;
    const before = notes.find((n) => n.id === pair.id)!.writtenPitch!;
    const after: Pitch = {
      step: "CDEFGAB"[pair.pitch % 7] as Pitch["step"],
      octave: Math.floor(pair.pitch / 7),
      alter: head.alters![0]!,
    };
    if (after.octave < -1 || after.octave > 9) return reject("pitch-out-of-range");
    if (natural(before) !== pair.pitch || before.alter !== after.alter)
      changes.push({ id: pair.id, before: { ...before }, after });
  }
  const candidate = structuredClone(input);
  for (const e of candidate.voices.flatMap((v) => v.events)) {
    const change = changes.find((c) => c.id === e.id);
    if (change && e.type === "note") {
      e.writtenPitch = { ...change.after };
      e.soundingMidi! += midi(change.after) - midi(change.before);
      if (e.soundingMidi! < 0 || e.soundingMidi! > 127) return reject("midi-out-of-range");
    }
  }
  return { measure: candidate, changes, reason: "accepted" };
}
