import assert from "node:assert/strict";
import test from "node:test";
import { compare, ceiling } from "./ceiling.mjs";

test("matching preserves repeated-note multiplicity", () => {
  assert.deepEqual(compare(["a", "a", "b"], ["a", "b", "b"]), {
    matched: ["a", "b"],
    extra: ["a"],
    missing: ["b"],
  });
});
test("event ceiling uses maximum multiplicity, not sum across candidates", () => {
  const result = ceiling(["a"], ["a", "b", "b"], [["b"], ["b"]]);
  assert.equal(result.eventRecovered, 1);
  assert.equal(result.measureRecovered, 0);
});
test("whole-measure choice rejects loss even with positive net gain", () => {
  const result = ceiling(["a"], ["a", "b", "c"], [["b", "c"]]);
  assert.equal(result.eventRecovered, 2);
  assert.equal(result.measureRecovered, 0);
});
test("whole-measure choice rejects additional false positives", () => {
  assert.equal(ceiling(["a"], ["a", "b"], [["a", "b", "x"]]).measureRecovered, 0);
});
test("whole-measure choice accepts recovery without regression", () => {
  const base = ["a", "x"],
    expected = ["a", "b"],
    candidates = [["a", "b"]];
  const snapshot = JSON.stringify([base, expected, candidates]);
  assert.equal(ceiling(base, expected, candidates).measureRecovered, 1);
  assert.equal(JSON.stringify([base, expected, candidates]), snapshot);
});
test("empty alternatives and already exact input cannot manufacture gain", () => {
  assert.equal(ceiling(["a"], ["a"], []).eventRecovered, 0);
  assert.equal(ceiling(["a"], ["a"], [["a"]]).measureRecovered, 0);
});
