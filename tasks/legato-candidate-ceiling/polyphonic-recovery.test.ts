import assert from "node:assert/strict";
import { recoverPolyphonic, type Measure } from "./polyphonic-recovery";
const q = (numerator: number, denominator = 1) => ({ numerator, denominator });
const source = { supported: true, movingPitches: [30, 29] as [number, number], sustainedPitch: 27 };
const measure: Measure = {
  index: 0,
  duration: q(3, 4),
  keySignature: { fifths: -3 },
  voices: [
    {
      index: 2,
      events: [
        {
          id: "moving",
          type: "note",
          onset: q(0),
          duration: q(3, 4),
          writtenPitch: { step: "E", alter: -1, octave: 4 },
          soundingMidi: 63,
        },
      ],
    },
    {
      index: 5,
      events: [
        {
          id: "held",
          type: "note",
          onset: q(0),
          duration: q(3, 4),
          writtenPitch: { step: "B", alter: -1, octave: 3 },
          soundingMidi: 58,
        },
      ],
    },
  ],
};
const original = structuredClone(measure);
const result = recoverPolyphonic(measure, source);
assert.equal(result.reason, "corrected");
assert.deepEqual(result.measure.voices[1], measure.voices[1]);
assert.deepEqual(result.measure.voices[0]!.events[0], { ...measure.voices[0]!.events[0], duration: q(1, 2) });
assert.deepEqual(result.measure.voices[0]!.events[1], {
  id: "moving-source-following",
  type: "note",
  onset: q(1, 2),
  duration: q(1, 4),
  writtenPitch: { step: "D", alter: 0, octave: 4 },
  soundingMidi: 62,
});
assert.deepEqual(measure, original);
for (const mutation of [
  (m: Measure) => {
    m.voices[0]!.events[0]!.duration = q(1, 2);
  },
  (m: Measure) => {
    const e = m.voices[0]!.events[0]!;
    if (e.type === "note") e.tie = "start";
  },
  (m: Measure) => {
    delete m.keySignature;
  },
  (m: Measure) => {
    delete m.duration;
  },
  (m: Measure) => {
    m.voices.push(structuredClone(m.voices[0]!));
  },
]) {
  const changed = structuredClone(measure);
  mutation(changed);
  assert.notEqual(recoverPolyphonic(changed, source).reason, "corrected");
}
assert.notEqual(recoverPolyphonic(measure, { ...source, supported: false }).reason, "corrected");
assert.notEqual(recoverPolyphonic(measure, { ...source, movingPitches: [30, 30] }).reason, "corrected");
console.log("polyphonic recovery: positive delta, held voice, input immutability and six rejection checks passed");
