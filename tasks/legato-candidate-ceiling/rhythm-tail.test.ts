import assert from "node:assert/strict";
import { correctRhythmTail } from "./rhythm-tail";

const q = (numerator: number, denominator = 32) => ({ numerator, denominator });
const note = (id: string, step: string, onset: number, duration: number) => ({
  id,
  type: "note",
  writtenPitch: { step, octave: 4, alter: 0 },
  soundingMidi: 60,
  onset: q(onset),
  duration: q(duration),
});
const bar = {
  index: 0,
  duration: q(24),
  voices: [
    {
      index: 1,
      events: [
        note("a", "C", 0, 8),
        { id: "r", type: "rest", onset: q(8), duration: q(8) },
        note("b", "D", 16, 1),
        note("c", "E", 17, 1),
        note("d", "F", 18, 1),
        note("e", "E", 19, 1),
        note("f", "G", 20, 2),
        { id: "extra", type: "rest", onset: q(22), duration: q(2) },
      ],
    },
  ],
};
const source = {
  safe: true,
  events: [
    { type: "note", pitch: 28, layers: null, group: null },
    { type: "rest", pitch: null, layers: null, group: null },
    ...[29, 30, 31, 30, 32].map((pitch, i) => ({ type: "note", pitch, layers: [2, 3, 3, 2, 2][i]!, group: 7 })),
  ],
};
const before = structuredClone(bar);
const result = correctRhythmTail(bar, source);
assert.equal(result.reason, "corrected");
assert.equal(result.measure.voices[0]!.events.length, 7);
assert.deepEqual(
  result.measure.voices[0]!.events.slice(2).map((e) => [e.onset, e.duration]),
  [
    [q(1, 2), q(1, 16)],
    [q(9, 16), q(1, 32)],
    [q(19, 32), q(1, 32)],
    [q(5, 8), q(1, 16)],
    [q(11, 16), q(1, 16)],
  ],
);
assert.deepEqual(bar, before);
assert.equal(correctRhythmTail(bar, { ...source, safe: false }).reason, "unsafe-source");
assert.equal(correctRhythmTail({ ...bar, voices: [...bar.voices, bar.voices[0]!] }, source).reason, "multiple-voices");
const tied = structuredClone(bar);
Object.assign(tied.voices[0]!.events[2]!, { tie: "start" });
assert.equal(correctRhythmTail(tied, source).reason, "connection-or-tuplet");
assert.equal(correctRhythmTail(bar, { ...source, events: source.events.slice(0, -1) }).reason, "event-correspondence");
assert.equal(
  correctRhythmTail(bar, {
    ...source,
    events: [...source.events, { type: "rest", pitch: null, layers: null, group: null }],
  }).reason,
  "no-tail-beam-group",
);
const wrongSum = structuredClone(source);
wrongSum.events[2]!.layers = 3;
assert.equal(correctRhythmTail(bar, wrongSum).reason, "group-does-not-close");
console.log("rhythm tail correspondence, timing, deletion, and refusal assertions passed");
