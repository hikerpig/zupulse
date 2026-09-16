import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { canonicalJson, sha256Bytes } from "../../tools/pdf-omr-cli/src/canonical-json";
import { omrScoreDraftSchema } from "../../tools/pdf-omr-cli/src/schemas";
import { sourceScope } from "./alter";
import { correctProtectedPitch, curveProtection } from "./protected-pitch";

const root = "tools/pdf-omr-cli/reports/development";
const output = `${root}/legato-protected-pitch-v1-20260914`;
const evidencePath = `${root}/legato-accidental-evidence-v1-20260914/evidence.json`;
const keysPath = `${root}/legato-key-evidence-v1-20260914/predictions.json`;
const curvesPath = `${root}/legato-curve-endpoints-v1-20260914/evidence.json`;
const works = ["score-4", "score-9"] as const;
const baselinePath = (work: string) => `${root}/legato-pitch-correction-v1-20260914/${work}/draft.json`;
const files = [
  evidencePath,
  curvesPath,
  keysPath,
  ...works.map(baselinePath),
  ...[
    "alter.ts",
    "rank.ts",
    "rank.test.ts",
    "pitch.ts",
    "protected-pitch.ts",
    "protected-pitch.test.ts",
    "curve_evidence.py",
    "curve_audit.py",
    "pitch.test.ts",
    "protected-pitch-generate.ts",
    "protected-pitch-evaluate.ts",
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
  baseline: "pitch-correction for both works; isolated from whole-measure candidate replacement",
  modelCalls: 0,
  generationReferenceReads: 0,
  rule: "Traverse all staff measures; retain frozen rank, source key and accidental carry rules; preserve all predicted tie events, protect source-connected natural pitches, reject non-unique or unsupported curve rectangles intersecting local head bounds expanded by two staff gaps in x and one in y; only written pitch and MIDI may change; no new tie or carry edits",
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
  y: z.number().finite(),
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
const curves = z
  .object({
    results: z.array(
      z.object({
        summary: z.object({ work: z.enum(works), page: z.number().int().positive() }),
        paths: z.array(
          z.object({
            rect: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]),
            status: z.enum(["unique", "ambiguous", "unresolved", "unsupported"]),
            linkedHeads: z.array(z.array(headSchema)),
          }),
        ),
      }),
    ),
  })
  .parse(JSON.parse(read(curvesPath).toString()));
for (const page of curves.results)
  for (const path of page.paths)
    if (path.status === "unique") {
      assert.equal(path.linkedHeads.length, 1);
      assert.equal(path.linkedHeads[0]!.length, 2);
    }
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
    changes: ReturnType<typeof correctProtectedPitch>["changes"];
    protection: ReturnType<typeof curveProtection>;
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
      const local = heads.filter((h) => h.staff === staff && h.measure === measure);
      const scope = sourceScope(local, resolved ? key.fifths : null, carry);
      carry = scope.carry;
      const sourcePages = pages.filter((p) => p.notes.some((h) => h.staff === staff && h.measure === measure));
      assert(sourcePages.length <= 1, "measure-spans-pages");
      const pageCurves = sourcePages.length
        ? curves.results.filter((p) => p.summary.work === work && p.summary.page === sourcePages[0]!.summary.page)
        : [];
      assert(pageCurves.length === sourcePages.length, "missing-curve-page");
      const protection = curveProtection(
        local,
        pageCurves.flatMap((p) => p.paths),
        staff,
        measure,
      );
      const result = correctProtectedPitch(m, scope.heads, protection);
      s.measures[measure] = result.measure;
      rows.push({
        staff,
        measure,
        reason: result.reason,
        changes: result.changes,
        protection,
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
