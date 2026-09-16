import assert from "node:assert/strict";
import type { OmrScoreDraft } from "../../tools/pdf-omr-cli/src/schemas";
import { sourceScope } from "./alter";
import { correctProtectedPitch, curveProtection } from "./protected-pitch";
type Measure = OmrScoreDraft["parts"][number]["staves"][number]["measures"][number];
const base: Measure = {
  index: 0,
  voices: [
    {
      index: 1,
      events: [
        {
          id: "tied",
          type: "note",
          writtenPitch: { step: "C", octave: 5, alter: 0 },
          soundingMidi: 72,
          tie: "end",
          onset: { numerator: 0, denominator: 1 },
          duration: { numerator: 1, denominator: 4 },
        },
        {
          id: "wrong",
          type: "note",
          writtenPitch: { step: "F", octave: 3, alter: 0 },
          soundingMidi: 53,
          onset: { numerator: 1, denominator: 4 },
          duration: { numerator: 1, denominator: 4 },
        },
      ],
    },
  ],
};
const local = [35, 34].map((pitch, i) => ({
  pitch,
  x: 10 + i * 20,
  y: 50,
  gap: 5,
  valid: true,
  explicit: [],
  staff: 0,
  measure: 0,
}));
const heads = sourceScope(local, -2, new Map()).heads;
const snapshot = structuredClone(base);
const result = correctProtectedPitch(base, heads, { unknown: false, protectedPitches: [35] });
assert.equal(result.reason, "accepted");
assert.equal(result.changes.length, 1);
assert.deepEqual(result.measure.voices[0]!.events[0], base.voices[0]!.events[0]);
assert.deepEqual(base, snapshot);
assert.equal(correctProtectedPitch(base, heads, { unknown: false, protectedPitches: [34] }).reason, "connected-pitch");
assert.equal(
  correctProtectedPitch(base, heads, { unknown: true, protectedPitches: [] }).reason,
  "unresolved-nearby-curve",
);
const changedTie = sourceScope([{ ...local[0]!, pitch: 36 }, local[1]!], -2, new Map()).heads;
assert.equal(
  correctProtectedPitch(base, changedTie, { unknown: false, protectedPitches: [] }).reason,
  "changed-tied-note",
);
const curve = {
  rect: [5, 45, 35, 55] as [number, number, number, number],
  status: "unique",
  linkedHeads: [[local[0]!, { ...local[0]!, measure: 1 }]],
};
assert.deepEqual(curveProtection(local, [curve], 0, 0), { unknown: false, protectedPitches: [35] });
assert.equal(curveProtection(local, [{ ...curve, status: "unresolved", linkedHeads: [] }], 0, 0).unknown, true);
assert.equal(
  curveProtection(local, [{ ...curve, rect: [100, 100, 110, 110], status: "unsupported", linkedHeads: [] }], 0, 0)
    .unknown,
  false,
);
assert.equal(curveProtection([], [], 0, 0).unknown, true);
console.log(
  "protected-pitch tests passed: unchanged ties, connected-note and unresolved-geometry rejection, local curve scope",
);
