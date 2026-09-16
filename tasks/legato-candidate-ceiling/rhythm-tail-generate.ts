import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { canonicalJson, sha256Bytes } from "../../tools/pdf-omr-cli/src/canonical-json";
import { omrScoreDraftSchema } from "../../tools/pdf-omr-cli/src/schemas";
import { correctRhythmTail } from "./rhythm-tail";

const root = "tools/pdf-omr-cli/reports/development";
const output = `${root}/legato-rhythm-tail-v1-20260914`;
const works = ["score-4", "score-9"] as const;
const baseline = (w: string) => `${root}/legato-protected-pitch-v1-20260914/${w}/draft.json`;
const paths = [
  `${output}/source.json`,
  `${output}/source-protocol.json`,
  ...works.map(baseline),
  ...["rhythm-tail.ts", "rhythm-tail.test.ts", "rhythm-tail-generate.ts", "rhythm-tail-evaluate.ts"].map(
    (p) => `tasks/legato-candidate-ceiling/${p}`,
  ),
  ...["schemas.ts", "rational.ts", "canonical-json.ts"].map((p) => `tools/pdf-omr-cli/src/${p}`),
];
const reads: string[] = [];
const read = (p: string) => {
  assert(paths.includes(p) && !/expected\.json|evaluation\.json/.test(p));
  reads.push(p);
  return readFileSync(p);
};
const hashes = Object.fromEntries(paths.map((p) => [p, sha256Bytes(read(p))]));
const write = (name: string, value: unknown) =>
  writeFileSync(`${output}/${name}.json`, canonicalJson(value), { flag: "wx" });
write("protocol", {
  hashes,
  modelCalls: 0,
  generationReferenceReads: 0,
  rule: "All staff measures; source-safe sequential glyph inventory; single contiguous candidate voice without ties/tuplets; equal ordered event types and natural pitches, except at most one candidate-only trailing rest. Correct only final source beam group, preserving prefix and every non-timing note field. No dots/flags/unknown glyphs or source curves accepted. Source quarter rests must match duration. Rebuilt group must end at measure duration; do not infer unbeamed note duration.",
  acceptance:
    "At least one recovered primary match across works; each work zero lost matches, nonincreasing note/rest FP/FN, unique nonregressing strict joint F1 and valid measures, unblocked readiness, export and four round-trip checks. No default promotion.",
  limits:
    "Controlled vector fonts and glyph-origin cell assignment; baseline group-start anchor retained; two reused development works; inherited manually reviewed cross-page ties; unsupported regions abstain.",
});
const source = z
  .object({
    sourcesUnchanged: z.literal(true),
    rows: z.array(
      z.object({
        work: z.enum(works),
        staff: z.number().int().min(0).max(1),
        measure: z.number().int().nonnegative(),
        safe: z.boolean(),
        reason: z.string(),
        events: z.array(
          z.object({
            type: z.enum(["note", "rest"]),
            pitch: z.number().int().nullable(),
            layers: z.number().int().min(1).max(4).nullable(),
            group: z.number().int().nonnegative().nullable(),
          }),
        ),
      }),
    ),
  })
  .parse(JSON.parse(read(`${output}/source.json`).toString()));
const judgments = [];
for (const work of works) {
  const before = omrScoreDraftSchema.parse(JSON.parse(read(baseline(work)).toString()));
  const after = structuredClone(before);
  const staves = after.parts.flatMap((p) => p.staves);
  assert.equal(staves.length, 2);
  const rows: {
    staff: number;
    measure: number;
    reason: string;
    sourceReason?: string;
    before?: unknown;
    after?: unknown;
  }[] = [];
  for (const [staff, s] of staves.entries())
    for (const [i, measure] of s.measures.entries()) {
      const matches = source.rows.filter((r) => r.work === work && r.staff === staff && r.measure === measure.index);
      assert.equal(matches.length, 1);
      const result = correctRhythmTail(measure, matches[0]!);
      if (result.reason === "corrected") {
        const notes = (m: typeof measure) =>
          m.voices
            .flatMap((v) => v.events)
            .filter((e) => e.type === "note")
            .map(({ onset: _onset, duration: _duration, ...rest }) => rest);
        assert.deepEqual(notes(result.measure), notes(measure), "non-timing-note-fields-changed");
        s.measures[i] = result.measure;
        rows.push({ staff, measure: measure.index, reason: result.reason, before: measure, after: result.measure });
      } else rows.push({ staff, measure: measure.index, reason: result.reason, sourceReason: matches[0]!.reason });
    }
  omrScoreDraftSchema.parse(after);
  mkdirSync(`${output}/${work}`);
  write(`${work}/draft`, after);
  judgments.push({ work, rows });
  console.log(
    JSON.stringify({
      work,
      changed: rows.filter((r) => r.reason === "corrected").map((r) => [r.staff, r.measure]),
      reasons: Object.fromEntries(
        [...new Set(rows.map((r) => r.reason))].map((reason) => [
          reason,
          rows.filter((r) => r.reason === reason).length,
        ]),
      ),
    }),
  );
}
for (const [p, h] of Object.entries(hashes)) assert.equal(sha256Bytes(read(p)), h, p);
write("judgments", judgments);
write("generation-reads", [...new Set(reads)]);
