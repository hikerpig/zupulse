import assert from "node:assert/strict";
import type { OmrScoreDraft } from "../../tools/pdf-omr-cli/src/schemas";
import { sourceScope } from "./alter";
import { correctPitch } from "./pitch";
type Measure = OmrScoreDraft["parts"][number]["staves"][number]["measures"][number];
const base: Measure = {
  index: 0,
  voices: [
    {
      index: 1,
      events: [
        {
          id: "n1",
          type: "note",
          writtenPitch: { step: "F", octave: 3, alter: 0 },
          soundingMidi: 53,
          onset: { numerator: 0, denominator: 1 },
          duration: { numerator: 1, denominator: 4 },
        },
      ],
    },
  ],
};
const heads = sourceScope([{ x: 10, gap: 5, valid: true, pitch: 34, explicit: [] }], -2, new Map()).heads;
const snapshot = structuredClone(base),
  result = correctPitch(base, heads);
assert.equal(result.reason, "accepted");
assert.equal(result.changes.length, 1);
const note = result.measure.voices[0]!.events[0]!;
assert(note.type === "note");
assert.deepEqual(note.writtenPitch, { step: "B", octave: 4, alter: -1 });
assert.equal(note.soundingMidi, 70);
assert.deepEqual(base, snapshot);
note.writtenPitch = { step: "F", octave: 3, alter: 0 };
note.soundingMidi = 53;
assert.deepEqual(result.measure, snapshot);
const tied = structuredClone(base);
Object.assign(tied.voices[0]!.events[0]!, { tie: "start" });
assert.equal(correctPitch(tied, heads).reason, "tied-measure");
assert.equal(correctPitch(base, [{ ...heads[0]!, alters: [0, 1] }]).reason, "uncertain-source-alter");
assert.equal(correctPitch(base, []).reason, "note-count");
const transposed = structuredClone(base);
const n = transposed.voices[0]!.events[0]!;
assert(n.type === "note");
n.soundingMidi = 41;
const t = correctPitch(transposed, heads).measure.voices[0]!.events[0]!;
assert(t.type === "note");
assert.equal(t.soundingMidi, 58);
const repeated = structuredClone(base);
const second = structuredClone(repeated.voices[0]!.events[0]!);
second.id = "n2";
second.onset = { numerator: 1, denominator: 4 };
repeated.voices[0]!.events.push(second);
const repeatHeads = sourceScope(
  [
    { x: 10, gap: 5, valid: true, pitch: 34, explicit: [-1] },
    { x: 20, gap: 5, valid: true, pitch: 34, explicit: [0] },
  ],
  -2,
  new Map(),
).heads;
assert.deepEqual(
  correctPitch(repeated, repeatHeads).measure.voices[0]!.events.map((e) => (e.type === "note" ? e.soundingMidi : null)),
  [70, 71],
);
n.soundingMidi = 127;
assert.equal(correctPitch(transposed, heads).reason, "midi-out-of-range");
console.log(
  "pitch tests passed: rank correction, source key, transposition offset, immutable non-pitch fields, rejection guards",
);
