import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { omrScoreDraftSchema } from "../../tools/pdf-omr-cli/src/schemas";
import { canonicalJson } from "../../tools/pdf-omr-cli/src/canonical-json";
import { integrate } from "./integrate";

const root = "tools/pdf-omr-cli/reports/development";
const output = `${root}/legato-visual-integration-v1-20260914`;
const judgmentsPath = `${root}/legato-visual-discrimination-v1-20260914/judgments.json`;
const priorPath = `${root}/legato-candidate-ceiling-v1-20260914/protocol.json`;
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const prior = z
  .object({
    candidates: z.array(
      z.object({ id: z.string(), path: z.string(), range: z.tuple([z.number().int(), z.number().int()]) }),
    ),
    cases: z.array(z.object({ id: z.string(), baseline: z.string() })),
  })
  .parse(readJson(priorPath));
const judgments = z
  .array(
    z.object({
      id: z.string(),
      rows: z.array(
        z.object({
          measure: z.number().int().nonnegative(),
          ids: z.array(z.string()),
          eligible: z.array(z.number().int().nonnegative()),
        }),
      ),
    }),
  )
  .parse(readJson(judgmentsPath));
const selections = judgments.flatMap((j) =>
  j.rows
    .filter((r) => r.eligible.length === 1)
    .map((r) => {
      const id = r.ids[r.eligible[0]!]!;
      const source = prior.candidates.find((c) => c.id === id);
      assert(source && r.measure >= source.range[0] && r.measure < source.range[1], "invalid-candidate-location");
      return { work: j.id, measure: r.measure, source, local: r.measure - source.range[0] };
    }),
);
const paths = [
  judgmentsPath,
  priorPath,
  "tasks/legato-candidate-ceiling/generate.ts",
  "tasks/legato-candidate-ceiling/integrate.ts",
  "tasks/legato-candidate-ceiling/integrate.test.ts",
  "tools/pdf-omr-cli/src/schemas.ts",
  "tools/pdf-omr-cli/src/canonical-json.ts",
  ...prior.cases.map((c) => c.baseline),
  ...selections.map((s) => s.source.path),
];
const hash = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const hashes = Object.fromEntries(paths.map((p) => [p, hash(p)]));
mkdirSync(output);
const write = (p: string, v: unknown) => writeFileSync(`${output}/${p}.json`, canonicalJson(v), { flag: "wx" });
write("protocol", {
  hashes,
  selections,
  modelCalls: 0,
  groundTruthReads: 0,
  productionPromotion: false,
  rules:
    "Unique exact visual candidate only; equal active-voice counts and sorted slot mapping; replace all staff voice events; preserve all measure attributes; no event repair or gap fill",
  limitations: [
    "historical reference-assisted crop location",
    "inherited source-reviewed tie endpoints",
    "active-slot identity hypothesis",
  ],
});
const changes = [];
for (const item of prior.cases) {
  const original = omrScoreDraftSchema.parse(readJson(item.baseline));
  let candidate = original;
  const selected = selections.filter((s) => s.work === item.id);
  for (const choice of selected)
    candidate = integrate(
      candidate,
      omrScoreDraftSchema.parse(readJson(choice.source.path)),
      choice.measure,
      choice.local,
    );
  omrScoreDraftSchema.parse(candidate);
  mkdirSync(`${output}/${item.id}`);
  write(`${item.id}/draft`, candidate);
  const row = { id: item.id, selectedMeasures: selected.map((s) => s.measure), unchangedOutsideSelectedVoices: true };
  changes.push(row);
  console.log(JSON.stringify(row));
}
for (const [p, h] of Object.entries(hashes)) assert.equal(hash(p), h, p);
write("changes", changes);
