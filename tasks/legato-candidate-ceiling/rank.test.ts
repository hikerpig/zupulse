import assert from "node:assert/strict";
import { rankPairs } from "./rank";
const heads = [
  { x: 10, gap: 5, pitch: 36, valid: true },
  { x: 20, gap: 5, pitch: 37, valid: true },
];
const notes = [
  { id: "a", pitch: 29, onset: "0/1" },
  { id: "b", pitch: 30, onset: "1/4" },
];
const snapshot = structuredClone([heads, notes]);
assert.deepEqual(rankPairs(notes, heads), {
  reason: "paired",
  pairs: [
    { id: "a", pitch: 36 },
    { id: "b", pitch: 37 },
  ],
});
assert.deepEqual([heads, notes], snapshot);
assert.equal(rankPairs(notes.slice(0, 1), heads).reason, "note-count");
assert.equal(
  rankPairs(
    notes,
    heads.map((h) => ({ ...h, x: 10 })),
  ).reason,
  "group-count",
);
assert.equal(
  rankPairs(
    notes.map((n) => ({ ...n, onset: "0/1" })),
    heads,
  ).reason,
  "group-count",
);
assert.equal(rankPairs(notes, [{ ...heads[0]!, valid: false }, heads[1]!]).reason, "invalid-source");
const chord = notes.map((n) => ({ ...n, onset: "0/1" }));
assert.equal(
  rankPairs(
    chord,
    heads.map((h) => ({ ...h, x: 10, pitch: 36 })),
  ).reason,
  "unison-ambiguity",
);
assert.deepEqual(
  rankPairs(
    [...chord].reverse(),
    heads.map((h) => ({ ...h, x: 10 })),
  ).pairs,
  [
    { id: "a", pitch: 36 },
    { id: "b", pitch: 37 },
  ],
);
console.log("rank tests passed: ordinal hypotheses, chords, immutable inputs, count/group/invalid/unison rejection");
