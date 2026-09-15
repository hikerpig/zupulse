import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { canonicalJson, sha256Bytes } from "../../tools/pdf-omr-cli/src/canonical-json";
import { omrScoreDraftSchema } from "../../tools/pdf-omr-cli/src/schemas";
import { sourceScope, type SourceHead } from "./alter";
import { correctPitch } from "./pitch";

const root = "tools/pdf-omr-cli/reports/development";
const output = `${root}/legato-pitch-correction-v1-20260914`;
const evidencePath = `${root}/legato-accidental-evidence-v1-20260914/evidence.json`;
const keysPath = `${root}/legato-key-evidence-v1-20260914/predictions.json`;
const works = ["score-4", "score-9"] as const;
const baselinePath = (work: string) => `${root}/legato-alter-correction-v1-20260914/${work}/draft.json`;
const files = [
  evidencePath,
  keysPath,
  ...works.map(baselinePath),
  ...[
    "alter.ts",
    "rank.ts",
    "rank.test.ts",
    "pitch.ts",
    "pitch.test.ts",
    "pitch-generate.ts",
    "pitch-evaluate.ts",
    "key_evidence.py",
    "key_audit.py",
  ].map((p) => `tasks/legato-candidate-ceiling/${p}`),
  "tools/pdf-omr-cli/src/schemas.ts",
];
const reads: string[] = [];
const read = (p: string) => {
  assert(files.includes(p) && !/expected\.json|evaluation\.json|selection\.json/.test(p), "forbidden-generation-input");
  reads.push(p);
  return readFileSync(p);
};
const hashes = Object.fromEntries(files.map((p) => [p, sha256Bytes(read(p))]));
mkdirSync(output);
const write = (name: string, value: unknown) =>
  writeFileSync(`${output}/${name}.json`, canonicalJson(value), { flag: "wx" });
write("protocol", {
  hashes,
  baseline: "alter-correction for both works; isolated from whole-measure candidate replacement",
  modelCalls: 0,
  generationReferenceReads: 0,
  rule: "Traverse all staff measures; use frozen ordinal x/onset group rank correspondence; require unique source key and accidental scope including possible cross-bar tie carry; predicted tied measures abstain; change written pitch and corresponding MIDI delta only; preserve all other fields",
  acceptance:
    "At least one recovered primary match across the two works; zero lost primary matches and nonincreasing note/rest errors on each work; unique nonregressing strict joint F1 and valid measures; unblocked readiness, export and four round-trip checks for both works",
  limitations: [
    "controlled standard-notation vector PDFs and supported fonts only",
    "initial absent key glyphs assumed zero fifths",
    "inherited source-reviewed tie endpoints",
    "two development works, no default promotion",
  ],
});
const headSchema = z.object({
  x: z.number().finite(),
  pitch: z.number().int().nonnegative(),
  gap: z.number().positive(),
  valid: z.boolean(),
  measure: z.number().int().nonnegative(),
  staff: z.number().int().min(0).max(1),
});
const evidence = z
  .object({
    results: z.array(
      z.object({
        summary: z.object({ work: z.enum(works), page: z.number().int().positive(), issues: z.array(z.unknown()) }),
        notes: z.array(headSchema),
        symbols: z.array(
          headSchema.extend({
            alter: z.number().int().min(-1).max(1),
            heads: z.array(z.number().int().nonnegative()),
            status: z.enum(["attached", "ambiguous", "unassigned"]),
          }),
        ),
      }),
    ),
  })
  .parse(JSON.parse(read(evidencePath).toString()));
const keys = z
  .array(
    z.object({
      work: z.enum(works),
      rows: z.array(
        z.object({
          measure: z.number().int().nonnegative(),
          staff: z.number().int().min(0).max(1),
          fifths: z.number().int().min(-7).max(7).nullable(),
          reason: z.string(),
          unassignedGlyphs: z.number().int().nonnegative(),
        }),
      ),
    }),
  )
  .parse(JSON.parse(read(keysPath).toString()));
const judgments = [];
for (const work of works) {
  const before = omrScoreDraftSchema.parse(JSON.parse(read(baselinePath(work)).toString()));
  const candidate = structuredClone(before),
    staves = candidate.parts.flatMap((p) => p.staves);
  assert.equal(staves.length, 2);
  const pages = evidence.results.filter((p) => p.summary.work === work).sort((a, b) => a.summary.page - b.summary.page);
  assert.deepEqual(
    pages.map((p) => p.summary.page),
    pages.map((_, i) => i + 1),
  );
  assert(pages.every((p) => p.summary.issues.length === 0));
  const heads = pages.flatMap((page) =>
    page.notes.map((n, i) => ({
      ...n,
      explicit: page.symbols.filter((s) => s.status === "attached" && s.heads.includes(i)).map((s) => s.alter),
    })),
  );
  for (const page of pages)
    for (const s of page.symbols.filter((s) => s.status === "attached")) {
      assert.equal(s.heads.length, 1);
      const n = page.notes[s.heads[0]!]!;
      assert(n && s.valid && n.measure === s.measure && n.staff === s.staff && n.pitch === s.pitch);
    }
  const keyRows = keys.find((k) => k.work === work)!.rows;
  assert.equal(
    keyRows.length,
    staves.reduce((n, s) => n + s.measures.length, 0),
  );
  const rows: {
    staff: number;
    measure: number;
    reason: string;
    changes: ReturnType<typeof correctPitch>["changes"];
    sourceNotes: number;
    ambiguousSourceNotes: number;
  }[] = [];
  for (const [staff, s] of staves.entries()) {
    let carry = new Map<number, number[] | null>();
    for (const [measure, m] of s.measures.entries()) {
      assert.equal(m.index, measure);
      const localKeys = keyRows.filter((k) => k.staff === staff && k.measure === measure);
      assert.equal(localKeys.length, 1);
      const key = localKeys[0]!;
      const unattached = pages
        .flatMap((p) => p.symbols)
        .filter((g) => g.staff === staff && g.measure === measure && g.status !== "attached");
      assert.equal(unattached.length, key.unassignedGlyphs);
      const resolved =
        key.fifths !== null &&
        (unattached.length === 0 ||
          (key.reason === "flat-prefix" &&
            unattached.every((g) => g.valid && g.alter === -1 && g.status === "unassigned")));
      const local: SourceHead[] = heads.filter((h) => h.staff === staff && h.measure === measure);
      const scope = sourceScope(local, resolved ? key.fifths : null, carry);
      carry = scope.carry;
      const result = correctPitch(m, scope.heads);
      s.measures[measure] = result.measure;
      rows.push({
        staff,
        measure,
        reason: result.reason,
        changes: result.changes,
        sourceNotes: local.length,
        ambiguousSourceNotes: scope.heads.filter((h) => !h.alters || h.alters.length !== 1).length,
      });
    }
  }
  const restored = structuredClone(candidate);
  const originals = new Map(
    before.parts
      .flatMap((p) => p.staves)
      .flatMap((s) => s.measures)
      .flatMap((m) => m.voices)
      .flatMap((v) => v.events)
      .map((e) => [e.id, e]),
  );
  for (const event of restored.parts
    .flatMap((p) => p.staves)
    .flatMap((s) => s.measures)
    .flatMap((m) => m.voices)
    .flatMap((v) => v.events)) {
    const original = originals.get(event.id)!;
    if (event.type === "note" && original.type === "note") {
      if (original.writtenPitch && event.writtenPitch) {
        event.writtenPitch = structuredClone(original.writtenPitch);
      }
      if (original.soundingMidi !== undefined) event.soundingMidi = original.soundingMidi;
    }
  }
  assert.deepEqual(restored, before, "non-pitch-content-changed");
  mkdirSync(`${output}/${work}`);
  write(`${work}/draft`, omrScoreDraftSchema.parse(candidate));
  judgments.push({ work, rows });
  console.log(
    JSON.stringify({
      work,
      changes: rows.reduce((n, r) => n + r.changes.length, 0),
      changedMeasures: rows.filter((r) => r.changes.length).map((r) => [r.staff, r.measure]),
      reasons: Object.fromEntries(
        [...new Set(rows.map((r) => r.reason))].map((reason) => [
          reason,
          rows.filter((r) => r.reason === reason).length,
        ]),
      ),
    }),
  );
}
for (const [p, hash] of Object.entries(hashes)) assert.equal(sha256Bytes(read(p)), hash);
write("judgments", judgments);
write("generation-reads", [...new Set(reads)]);
