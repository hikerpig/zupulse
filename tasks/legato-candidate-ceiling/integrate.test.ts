import assert from "node:assert/strict";
import { integrate } from "./integrate";
const measure = (index: number, voice: number, part: string) => ({
  index,
  duration: { numerator: 3, denominator: 4 },
  clef: { sign: "G", line: 2 },
  voices: [
    {
      index: voice,
      events: [
        {
          type: "note",
          id: `${part}-m${index}-s0-v${voice}-e0`,
          soundingMidi: 60,
          onset: { numerator: 0, denominator: 1 },
          duration: { numerator: 1, denominator: 4 },
        },
      ],
    },
  ],
});
const fixture: any = {
  schemaVersion: "1.0.0",
  diagnostics: [],
  parts: [1, 2].map((n) => ({
    id: `P${n}`,
    name: "Piano",
    staves: [{ index: 0, measures: [measure(0, n, `P${n}`), measure(1, n, `P${n}`)] }],
  })),
};
const crop = structuredClone(fixture);
for (const p of crop.parts) {
  p.staves[0].measures = [measure(0, 7, p.id)];
  delete p.staves[0].measures[0].duration;
  p.staves[0].measures[0].voices[0].events[0].soundingMidi = 62;
}
const snapshot = JSON.stringify([fixture, crop]);
const result = integrate(fixture, crop, 1, 0);
assert.equal(JSON.stringify([fixture, crop]), snapshot);
for (const [i, p] of result.parts.entries()) {
  assert.deepEqual(p.staves[0].measures[0], fixture.parts[i].staves[0].measures[0]);
  assert.deepEqual(p.staves[0].measures[1].duration, { numerator: 3, denominator: 4 });
  assert.equal(p.staves[0].measures[1].voices[0].events[0].soundingMidi, 62);
  assert.equal(p.staves[0].measures[1].voices[0].events[0].id, `P${i + 1}-m1-s0-v${i + 1}-e0`);
}
const mismatch = structuredClone(crop);
mismatch.parts[0].staves[0].measures[0].voices = [];
assert.throws(() => integrate(fixture, mismatch, 1, 0), /voice-count/);
const badId = structuredClone(crop);
badId.parts[0].staves[0].measures[0].voices[0].events[0].id = "unknown";
assert.throws(() => integrate(fixture, badId, 1, 0), /event-identity/);
assert.throws(() => integrate(fixture, crop, 2, 0), /measure/);
const topology = structuredClone(crop);
topology.parts.pop();
assert.throws(() => integrate(fixture, topology, 1, 0), /topology/);
console.log("PASS immutable event replacement, metadata retention, IDs and four rejection cases");
