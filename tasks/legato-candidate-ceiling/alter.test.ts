import assert from "node:assert/strict";
import { sourceScope, correctAlter, type SourceHead } from "./alter";

const head = (pitch: number, x: number, explicit: number[] = []): SourceHead => ({
  pitch,
  x,
  gap: 5,
  valid: true,
  explicit,
});
const measure = (pitches: [number, number][]) => ({
  index: 0,
  duration: { numerator: 1, denominator: 1 },
  voices: [
    {
      index: 1,
      events: pitches.map(([pitch, alter], i) => ({
        id: `note-${i}`,
        type: "note" as const,
        onset: { numerator: i, denominator: 8 },
        duration: { numerator: 1, denominator: 8 },
        writtenPitch: { step: "CDEFGAB"[pitch % 7] as "C", octave: Math.floor(pitch / 7), alter },
        soundingMidi: 12 * (Math.floor(pitch / 7) + 1) + [0, 2, 4, 5, 7, 9, 11][pitch % 7]! + alter,
      })),
    },
  ],
});

const scope = sourceScope([head(36, 10), head(38, 20, [1]), head(36, 30), head(36, 40)], -2, new Map());
assert.deepEqual(
  scope.heads.map((h) => h.alters),
  [[0], [1], [0], [0]],
);
const baseline = measure([
  [36, 1],
  [38, 1],
  [36, 1],
  [36, 1],
]);
const saved = structuredClone(baseline);
const result = correctAlter(baseline, scope.heads);
assert.equal(result.reason, "accepted");
assert.equal(result.changes.length, 3);
assert.deepEqual(
  result.measure.voices[0]!.events.map((e) => (e.type === "note" ? e.writtenPitch?.alter : null)),
  [0, 1, 0, 0],
);
assert.deepEqual(baseline, saved);
const restored = structuredClone(result.measure);
for (const e of restored.voices[0]!.events) {
  assert(e.type === "note");
  const old = saved.voices[0]!.events.find((n) => n.id === e.id)!;
  e.writtenPitch!.alter = old.writtenPitch.alter;
  e.soundingMidi = old.soundingMidi;
}
assert.deepEqual(restored, saved);

const altered = sourceScope([head(36, 10, [1]), head(36, 20)], 0, new Map());
assert.deepEqual(
  altered.heads.map((h) => h.alters),
  [[1], [1]],
);
const next = sourceScope([head(36, 10), head(36, 20)], 0, altered.carry);
assert.deepEqual(
  next.heads.map((h) => h.alters),
  [
    [0, 1],
    [0, 1],
  ],
);
assert.equal(
  correctAlter(
    measure([
      [36, 1],
      [36, 1],
    ]),
    next.heads,
  ).reason,
  "uncertain-source-alter",
);
assert.deepEqual(sourceScope([head(36, 10, [0])], 0, next.carry).heads[0]!.alters, [0]);
assert.deepEqual(
  sourceScope([head(34, 10), head(27, 20)], -2, new Map()).heads.map((h) => h.alters),
  [[-1], [-1]],
);
assert.equal(sourceScope([head(36, 10)], null, new Map()).heads[0]!.alters, null);
assert.equal(sourceScope([{ ...head(36, 10), valid: false }], 0, new Map()).heads[0]!.alters, null);
assert.equal(sourceScope([head(36, 10, [0, 1])], 0, new Map()).heads[0]!.alters, null);
assert.equal(correctAlter(measure([[36, 1]]), scope.heads).reason, "pitch-count-mismatch");
assert.equal(
  correctAlter(
    measure([
      [36, 1],
      [36, 1],
    ]),
    sourceScope([head(36, 10), head(36, 10)], 0, new Map()).heads,
  ).reason,
  "ambiguous-order",
);
const crossed = sourceScope([head(36, 20), head(38, 10)], 0, new Map());
assert.equal(
  correctAlter(
    measure([
      [36, 1],
      [38, 1],
    ]),
    crossed.heads,
  ).reason,
  "inconsistent-order",
);
const tied = measure([[36, 1]]);
Object.assign(tied.voices[0]!.events[0]!, { tie: "end" });
assert.equal(correctAlter(tied, sourceScope([head(36, 10)], 0, new Map()).heads).reason, "tied-measure");
console.log(
  "alter tests passed: scope, carry ambiguity, key, malformed evidence, correspondence, immutable non-pitch fields",
);
