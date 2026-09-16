import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { omrScoreDraftSchema, type OmrScoreDraft } from "../../tools/pdf-omr-cli/src/schemas";
import { canonicalJson } from "../../tools/pdf-omr-cli/src/canonical-json";
import { validateDraft } from "../../tools/pdf-omr-cli/src/validate-draft";
import { runPdfOmrCommand } from "../../tools/pdf-omr-cli/src/command";
import { alignDraftParts } from "../../tools/pdf-omr-cli/src/benchmark/part-identity";
import { flattenEvents } from "../../tools/pdf-omr-cli/src/benchmark/symbolic-metrics";
import { evaluateVoiceIdentity } from "../../tools/pdf-omr-cli/src/benchmark/voice-identity";
import { compare } from "./ceiling.mjs";

const root = "tools/pdf-omr-cli/reports/development",
  output = `${root}/legato-visual-integration-v1-20260914`;
const cases = ["score-4", "score-9"].map((id) => ({
  id,
  baseline: `${root}/legato-staff-slots-v1-20260914/${id}/draft.json`,
  candidate: `${output}/${id}/draft.json`,
  reference: `${root}/piano-recognition-v1-20260905/${id}-baseline-cli/expected.json`,
}));
const hash = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const paths = [
  "tasks/legato-candidate-ceiling/evaluate.ts",
  "tasks/legato-candidate-ceiling/ceiling.mjs",
  `${output}/protocol.json`,
  ...cases.flatMap((c) => [c.baseline, c.candidate, c.reference]),
  ...[
    "validate-draft.ts",
    "command.ts",
    "schemas.ts",
    "benchmark/voice-identity.ts",
    "benchmark/part-identity.ts",
    "benchmark/symbolic-metrics.ts",
    "benchmark/symbolic-alignment.ts",
  ].map((p) => `tools/pdf-omr-cli/src/${p}`),
];
const hashes = Object.fromEntries(paths.map((p) => [p, hash(p)]));
writeFileSync(
  `${output}/evaluation-protocol.json`,
  canonicalJson({
    hashes,
    acceptance:
      "Per work: positive primary recovery, zero lost primary matches, nonincreasing note/rest FP/FN, unique nonregressing adjusted strict joint F1 and valid measures, both readiness unblocked, successful export and four round-trip checks; no default promotion",
  }),
  { flag: "wx" },
);
const read = (p: string) => omrScoreDraftSchema.parse(JSON.parse(readFileSync(p, "utf8")));
const roundTripSchema = z.object({
  parse: z.boolean(),
  view: z.boolean(),
  playback: z.boolean(),
  structural: z.boolean(),
  differences: z.array(z.unknown()),
});
const results = [];
for (const item of cases) {
  const before = read(item.baseline),
    after = read(item.candidate),
    truth = read(item.reference);
  const keys = (d: OmrScoreDraft, kind: "note" | "rest") =>
    flattenEvents(alignDraftParts(d, truth).draft)
      .filter((e) => e.type === kind)
      .map((e) => JSON.stringify([e.part, e.staff, e.measure, e.pitch, e.onset, e.duration]));
  const metric = (d: OmrScoreDraft, kind: "note" | "rest") => {
    const comparison = compare(keys(d, kind), keys(truth, kind));
    const tp = comparison.matched.length,
      fp = comparison.extra.length,
      fn = comparison.missing.length;
    return { comparison, counts: { tp, fp, fn, f1: (2 * tp) / (2 * tp + fp + fn) } };
  };
  const a = metric(before, "note"),
    b = metric(after, "note");
  const oldRests = metric(before, "rest"),
    newRests = metric(after, "rest");
  const delta = compare(b.comparison.matched, a.comparison.matched);
  const scope = { itemId: item.id, measureRange: [0, truth.parts[0]!.staves[0]!.measures.length] as [number, number] };
  const strictBefore = evaluateVoiceIdentity(before, truth, scope),
    strictAfter = evaluateVoiceIdentity(after, truth, scope);
  const readiness = validateDraft(after);
  let exported = false,
    roundTrip: unknown = null,
    error: string | null = null,
    roundTripOk = false;
  try {
    await runPdfOmrCommand([
      "export-musicxml",
      item.candidate,
      "--output",
      `${output}/${item.id}/score.mxl`,
      "--round-trip-report",
      `${output}/${item.id}/round-trip.json`,
    ]);
    exported = true;
    const report = roundTripSchema.parse(JSON.parse(readFileSync(`${output}/${item.id}/round-trip.json`, "utf8")));
    roundTrip = report;
    roundTripOk =
      report.parse && report.view && report.playback && report.structural && report.differences.length === 0;
  } catch (failure) {
    error = String(failure);
  }
  const strictGate =
    strictBefore.status === "unique" &&
    strictAfter.status === "unique" &&
    strictBefore.adjusted !== undefined &&
    strictAfter.adjusted !== undefined &&
    strictAfter.adjusted.joint.f1 >= strictBefore.adjusted.joint.f1 &&
    strictAfter.adjusted.validMeasure.valid >= strictBefore.adjusted.validMeasure.valid;
  const gate =
    delta.extra.length > 0 &&
    delta.missing.length === 0 &&
    b.counts.fp <= a.counts.fp &&
    b.counts.fn <= a.counts.fn &&
    newRests.counts.fp <= oldRests.counts.fp &&
    newRests.counts.fn <= oldRests.counts.fn &&
    strictGate &&
    roundTripOk &&
    Object.values(readiness.readiness).every((value) => value !== "blocked");
  const row = {
    id: item.id,
    before: a.counts,
    after: b.counts,
    recovered: delta.extra,
    lost: delta.missing,
    restsBefore: oldRests.counts,
    restsAfter: newRests.counts,
    strictBefore,
    strictAfter,
    readiness,
    exportEvidence: { exported, roundTrip, error },
    gate,
    productionPromotion: false,
  };
  results.push(row);
  console.log(
    JSON.stringify({
      id: item.id,
      before: row.before,
      after: row.after,
      recovered: delta.extra.length,
      lost: delta.missing.length,
      strictBefore: strictBefore.status,
      strictAfter: strictAfter.status,
      strictGate,
      readiness: readiness.readiness,
      exported,
      roundTripOk,
      error,
      gate,
    }),
  );
}
for (const [p, h] of Object.entries(hashes)) assert.equal(hash(p), h, p);
writeFileSync(`${output}/evaluation.json`, canonicalJson({ sourcesUnchanged: true, results }), { flag: "wx" });
