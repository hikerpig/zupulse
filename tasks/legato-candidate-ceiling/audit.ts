import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { omrScoreDraftSchema } from "../../tools/pdf-omr-cli/src/schemas";
import { alignDraftParts } from "../../tools/pdf-omr-cli/src/benchmark/part-identity";
import { flattenEvents } from "../../tools/pdf-omr-cli/src/benchmark/symbolic-metrics";
import { ceiling, compare } from "./ceiling.mjs";

const root = "tools/pdf-omr-cli/reports/development";
const output = `${root}/legato-candidate-ceiling-v1-20260914`;
const selectionPath = `${root}/legato-input-fidelity-v1-20260905/selection.json`;
const selection = JSON.parse(readFileSync(selectionPath, "utf8"));
type Candidate = { work: string; id: string; path: string; range: number[] };
const candidates: Candidate[] = selection.items
  .filter((i: { work: string }) => ["score-4", "score-9"].includes(i.work))
  .flatMap((i: { work: string; id: string; gtRange: number[] }) =>
    [
      ["legato-input-fidelity-v1-20260905", "baseline"],
      ["legato-input-fidelity-v1-20260905", "direct"],
      ["legato-penalty-v1-20260905", "unpenalized"],
    ].map(([experiment, arm]) => ({
      work: i.work,
      id: `${i.id}/${experiment}/${arm}`,
      path: `${root}/${experiment}/${i.id}/${arm}/raw-draft.json`,
      range: i.gtRange,
    })),
  );
for (const arm of ["beam-3", "no-penalty"])
  candidates.push({
    work: "score-9",
    id: `score-9/full/${arm}`,
    path: `${root}/legato-decoder-v1-20260913-r2/score-9/${arm}/draft.json`,
    range: [0, 20],
  });
assert.equal(candidates.length, 26);
const cases = ["score-4", "score-9"].map((id) => ({
  id,
  baseline: `${root}/legato-staff-slots-v1-20260914/${id}/draft.json`,
  expected: `${root}/piano-recognition-v1-20260905/${id}-baseline-cli/expected.json`,
}));
const paths = [
  selectionPath,
  ...candidates.map((c) => c.path),
  ...cases.flatMap((c) => [c.baseline, c.expected]),
  "tasks/legato-candidate-ceiling/audit.ts",
  "tasks/legato-candidate-ceiling/ceiling.mjs",
  "tasks/legato-candidate-ceiling/ceiling.test.mjs",
  ...[
    "schemas.ts",
    "rational.ts",
    "benchmark/part-identity.ts",
    "benchmark/symbolic-metrics.ts",
    "benchmark/symbolic-alignment.ts",
  ].map((p) => `tools/pdf-omr-cli/src/${p}`),
];
const digest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const hashes = Object.fromEntries(paths.map((p) => [p, digest(p)]));
mkdirSync(output);
const write = (name: string, value: unknown) =>
  writeFileSync(`${output}/${name}.json`, JSON.stringify(value, null, 2), { flag: "wx" });
write("protocol", {
  interpretation:
    "oracle diagnosis only; reference-assisted historical crop locations; not a selector or exportable candidate",
  modelCalls: 0,
  candidateEdits: 0,
  candidates,
  cases,
  hashes,
  rules: [
    "Fixed historical half-open crop ranges; no new GT-driven alignment",
    "Reject an entire candidate if any staff has wrong measure count or noncontiguous indices",
    "Primary key: part/staff/measure/pitch/onset/duration; multiset matching",
    "Event union uses maximum multiplicity across alternatives, not summed counts",
    "Whole-measure oracle chooses all staves together, maximizes recovery with zero lost matches and no FP increase",
    "No output score, no strict/export acceptance claim; freeze before reference parsing",
  ],
});
const read = (p: string) => omrScoreDraftSchema.parse(JSON.parse(readFileSync(p, "utf8")));
type Event = ReturnType<typeof flattenEvents>[number];
const keys = (events: Event[]) =>
  events.map((e) => JSON.stringify([e.part, e.staff, e.measure, e.pitch, e.onset, e.duration]));
const results = cases.map((item) => {
  const expected = read(item.expected),
    baseline = read(item.baseline);
  const notes = (d: typeof baseline) =>
    flattenEvents(alignDraftParts(d, expected).draft).filter((e) => e.type === "note");
  const b = notes(baseline),
    e = notes(expected);
  const rejected: unknown[] = [];
  const admitted = candidates
    .filter((c) => c.work === item.id)
    .flatMap((c) => {
      const draft = read(c.path),
        [start, end] = c.range as [number, number];
      const counts = draft.parts.flatMap((p) => p.staves.map((s) => s.measures.length));
      if (
        draft.parts.some((p) =>
          p.staves.some((s) => s.measures.length !== end - start || s.measures.some((m, i) => m.index !== i)),
        )
      ) {
        rejected.push({ id: c.id, reason: "measure-coverage-mismatch", counts, range: c.range });
        return [];
      }
      return [{ ...c, notes: notes(draft).map((n) => ({ ...n, measure: n.measure + start })) }];
    });
  const measures = [...new Set(expected.parts.flatMap((p) => p.staves.flatMap((s) => s.measures.map((m) => m.index))))];
  const rows = measures.map((measure) => {
    const options = admitted.filter((c) => c.range[0]! <= measure && measure < c.range[1]!);
    const result = ceiling(
      keys(b.filter((n) => n.measure === measure)),
      keys(e.filter((n) => n.measure === measure)),
      options.map((c) => keys(c.notes.filter((n) => n.measure === measure))),
    );
    return { measure, optionIds: options.map((c) => c.id), ...result };
  });
  const original = compare(keys(b), keys(e));
  const totals = { tp: original.matched.length, fp: original.extra.length, fn: original.missing.length };
  assert.deepEqual(totals, item.id === "score-4" ? { tp: 728, fp: 52, fn: 55 } : { tp: 179, fp: 3, fn: 7 });
  const summary = {
    id: item.id,
    baseline: totals,
    admitted: admitted.length,
    rejected: rejected.length,
    coveredMeasures: rows.filter((r) => r.optionIds.length).length,
    eventRecoveryCeiling: rows.reduce((n, r) => n + r.eventRecovered, 0),
    wholeMeasureRecoveryCeiling: rows.reduce((n, r) => n + r.measureRecovered, 0),
    recoverableMeasures: rows.filter((r) => r.measureRecovered > 0).map((r) => r.measure),
  };
  console.log(JSON.stringify(summary));
  return { summary, rejected, rows };
});
for (const [path, hash] of Object.entries(hashes)) assert.equal(digest(path), hash, path);
write("evaluation", { interpretation: "oracle ceilings, not achieved gains", sourcesUnchanged: true, results });
