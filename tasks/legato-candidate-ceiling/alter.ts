import type { OmrScoreDraft } from "../../tools/pdf-omr-cli/src/schemas";

export type SourceHead = { pitch: number; x: number; gap: number; valid: boolean; explicit: number[] };
type ScopedHead = SourceHead & { alters: number[] | null };
type Measure = OmrScoreDraft["parts"][number]["staves"][number]["measures"][number];
type Carry = Map<number, number[] | null>;

export function sourceScope(heads: SourceHead[], fifths: number | null, previous: Carry) {
  const state: Carry = new Map(),
    carry: Carry = new Map();
  const ordered = heads.map((h) => ({ ...h })).sort((a, b) => a.x - b.x);
  const validKey = fifths !== null && Number.isInteger(fifths) && Math.abs(fifths) <= 7;
  const order = (fifths ?? 0) < 0 ? [6, 2, 5, 1, 4, 0, 3] : [3, 0, 4, 1, 5, 2, 6];
  const result: ScopedHead[] = [];
  for (const h of ordered) {
    const key = validKey && order.slice(0, Math.abs(fifths!)).includes(h.pitch % 7) ? Math.sign(fifths!) : 0;
    if (!state.has(h.pitch)) {
      const prior = previous.get(h.pitch);
      // Without source tie geometry, retain both reset and carried interpretations across bars.
      state.set(h.pitch, prior === null ? null : [...new Set([key, ...(prior ?? [])])].sort());
    }
    if (!validKey || !h.valid || h.explicit.length > 1 || h.explicit.some((a) => ![-1, 0, 1].includes(a))) {
      state.set(h.pitch, null);
    } else if (h.explicit.length === 1) {
      state.set(h.pitch, [...h.explicit]);
    }
    const alters = state.get(h.pitch)!;
    result.push({ ...h, alters });
    carry.set(h.pitch, alters);
  }
  return { heads: result, carry };
}

export function correctAlter(input: Measure, heads: ScopedHead[]) {
  const reject = (reason: string) => ({
    measure: input,
    changes: [] as { id: string; before: number; after: number }[],
    reason,
  });
  const notes = input.voices.flatMap((v) => v.events).filter((e) => e.type === "note");
  if (notes.some((n) => n.tie)) return reject("tied-measure");
  if (notes.some((n) => !n.writtenPitch || n.soundingMidi === undefined)) return reject("missing-pitch");
  const pitch = (n: (typeof notes)[number]) => n.writtenPitch!.octave * 7 + "CDEFGAB".indexOf(n.writtenPitch!.step);
  const onset = (a: (typeof notes)[number], b: (typeof notes)[number]) =>
    a.onset.numerator * b.onset.denominator - b.onset.numerator * a.onset.denominator;
  const pairs: { note: (typeof notes)[number]; head: ScopedHead }[] = [];
  for (const p of new Set([...heads.map((h) => h.pitch), ...notes.map(pitch)])) {
    const ns = notes.filter((n) => pitch(n) === p).sort(onset);
    const hs = heads.filter((h) => h.pitch === p).sort((a, b) => a.x - b.x);
    if (ns.length !== hs.length) return reject("pitch-count-mismatch");
    if (ns.some((n, i) => i > 0 && (onset(ns[i - 1]!, n) === 0 || hs[i - 1]!.x === hs[i]!.x)))
      return reject("ambiguous-order");
    ns.forEach((note, i) => pairs.push({ note, head: hs[i]! }));
  }
  if (heads.some((h) => !h.alters || h.alters.length !== 1)) return reject("uncertain-source-alter");
  for (const a of pairs)
    for (const b of pairs) {
      const time = onset(a.note, b.note),
        dx = a.head.x - b.head.x;
      if ((time < 0 && dx >= 0) || (time === 0 && Math.abs(dx) > 0.5 * Math.min(a.head.gap, b.head.gap)))
        return reject("inconsistent-order");
    }
  const changes = pairs.flatMap(({ note, head }) => {
    const before = note.writtenPitch!.alter ?? 0,
      after = head.alters![0]!;
    return before === after ? [] : [{ id: note.id, before, after }];
  });
  const candidate = structuredClone(input);
  for (const event of candidate.voices.flatMap((v) => v.events)) {
    const change = changes.find((c) => c.id === event.id);
    if (change && event.type === "note") {
      event.writtenPitch!.alter = change.after;
      event.soundingMidi! += change.after - change.before;
      if (event.soundingMidi! < 0 || event.soundingMidi! > 127) return reject("midi-out-of-range");
    }
  }
  return { measure: candidate, changes, reason: "accepted" };
}
