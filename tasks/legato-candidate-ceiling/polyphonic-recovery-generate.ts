import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { canonicalJson, sha256Bytes } from "../../tools/pdf-omr-cli/src/canonical-json";
import { omrScoreDraftSchema } from "../../tools/pdf-omr-cli/src/schemas";
import { recoverPolyphonic } from "./polyphonic-recovery";
const root = "tools/pdf-omr-cli/reports/development";
const output = `${root}/legato-polyphonic-recovery-v2-20260914`;
const works = ["score-4", "score-9"] as const;
const baseline = (w: string) => `${root}/legato-rhythm-tail-v1-20260914/${w}/draft.json`;
const paths = [
  `${output}/source.json`,
  `${output}/source-protocol.json`,
  ...works.map(baseline),
  ...[
    "polyphonic-recovery.ts",
    "polyphonic-recovery.test.ts",
    "polyphonic-recovery-generate.ts",
    "polyphonic-recovery-evaluate.ts",
  ].map((p) => `tasks/legato-candidate-ceiling/${p}`),
  ...["schemas.ts", "rational.ts", "canonical-json.ts"].map((p) => `tools/pdf-omr-cli/src/${p}`),
];
const read = (p: string) => {
  assert(paths.includes(p) && !/expected\.json|evaluation\.json/.test(p));
  return readFileSync(p);
};
const hashes = Object.fromEntries(paths.map((p) => [p, sha256Bytes(read(p))]));
const write = (name: string, value: unknown) =>
  writeFileSync(`${output}/${name}.json`, canonicalJson(value), { flag: "wx" });
write("protocol", {
  hashes,
  referenceReads: 0,
  modelCalls: 0,
  rule: "Source-certified two-voice half/quarter versus dotted-half structure; exactly two single-note candidate voices at onset zero, duration 3/4, no ties/tuplets. Preserve held voice and original moving pitch; change moving duration to 1/2 and insert source following pitch at 1/2 for 1/4. Derive new alteration from frozen candidate key, with source-certified absence of local accidentals and distinct natural pitches. No hard-coded error positions.",
  acceptance:
    "Each work zero lost primary matches, nonincreasing primary/rest errors, nonregressing unique adjusted strict and valid measures, readiness/export/four round-trip checks. At least one recovered event across works. No default promotion.",
});
const source = z
  .object({
    sourcesUnchanged: z.literal(true),
    rows: z.array(
      z
        .object({
          work: z.enum(works),
          staff: z.number().int(),
          measure: z.number().int(),
          supported: z.boolean(),
          cleanPaths: z.boolean(),
          noLocalAccidentals: z.boolean(),
          movingPitches: z.tuple([z.number().int(), z.number().int()]),
          sustainedPitch: z.number().int(),
        })
        .refine((r) => !r.supported || (r.cleanPaths && r.noLocalAccidentals)),
    ),
  })
  .parse(JSON.parse(read(`${output}/source.json`).toString()));
const judgments = [];
for (const work of works) {
  const before = omrScoreDraftSchema.parse(JSON.parse(read(baseline(work)).toString()));
  const after = structuredClone(before);
  const staves = after.parts.flatMap((p) => p.staves);
  assert.equal(staves.length, 2);
  const rows = [];
  for (const [staff, s] of staves.entries())
    for (const [i, measure] of s.measures.entries()) {
      const matches = source.rows.filter((r) => r.work === work && r.staff === staff && r.measure === measure.index);
      assert(matches.length <= 1);
      const result = matches[0] ? recoverPolyphonic(measure, matches[0]) : { reason: "no-source-shape", measure };
      if (result.reason === "corrected") {
        const unchangedVoices = measure.voices.filter(
          (v, j) => canonicalJson(v) === canonicalJson(result.measure.voices[j]),
        );
        assert.equal(unchangedVoices.length, 1);
        s.measures[i] = result.measure;
        rows.push({ staff, measure: measure.index, reason: result.reason, before: measure, after: result.measure });
      } else rows.push({ staff, measure: measure.index, reason: result.reason });
    }
  omrScoreDraftSchema.parse(after);
  const ids = after.parts.flatMap((p) =>
    p.staves.flatMap((s) => s.measures.flatMap((m) => m.voices.flatMap((v) => v.events.map((e) => e.id)))),
  );
  assert.equal(new Set(ids).size, ids.length);
  mkdirSync(`${output}/${work}`);
  write(`${work}/draft`, after);
  judgments.push({ work, rows });
  console.log(
    JSON.stringify({ work, changed: rows.filter((r) => r.reason === "corrected").map((r) => [r.staff, r.measure]) }),
  );
}
for (const [p, h] of Object.entries(hashes)) assert.equal(sha256Bytes(read(p)), h, p);
write("judgments", judgments);
