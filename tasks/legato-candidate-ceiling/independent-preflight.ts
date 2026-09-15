import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { canonicalJson, sha256Bytes } from "../../tools/pdf-omr-cli/src/canonical-json";
import { omrScoreDraftSchema } from "../../tools/pdf-omr-cli/src/schemas";
import { validateDraft } from "../../tools/pdf-omr-cli/src/validate-draft";

const root = "tools/pdf-omr-cli/reports/development/piano-recognition-v1-20260905";
const output = "tools/pdf-omr-cli/reports/development/legato-independent-preflight-v1-20260914";
const cases = ["k280", "k331"].map((work) => ({
  work,
  reference: `${root}/${work}-baseline-cli/expected.json`,
  oldResult: `${root}/${work}-baseline-cli/result.json`,
}));
const files = [
  "tasks/legato-candidate-ceiling/independent-preflight.ts",
  "tools/pdf-omr-cli/src/schemas.ts",
  "tools/pdf-omr-cli/src/validate-draft.ts",
  "tools/pdf-omr-cli/src/rational.ts",
  ...cases.flatMap((c) => [c.reference, c.oldResult]),
];
const hashes = Object.fromEntries(files.map((p) => [p, sha256Bytes(readFileSync(p))]));
mkdirSync(output);
const write = (name: string, value: unknown) =>
  writeFileSync(`${output}/${name}.json`, canonicalJson(value), { flag: "wx" });
write("protocol", {
  hashes,
  modelCalls: 0,
  candidateEdits: 0,
  rule: "Current-schema and current-validator eligibility check of two existing development references; no reference repair or new recognition",
});
const results = cases.map((c) => {
  const parsed = omrScoreDraftSchema.safeParse(JSON.parse(readFileSync(c.reference, "utf8")));
  if (!parsed.success) return { work: c.work, schemaValid: false, issues: parsed.error.issues };
  const validation = validateDraft(parsed.data);
  const row = {
    work: c.work,
    schemaValid: true,
    measures: parsed.data.parts.flatMap((p) => p.staves).map((s) => s.measures.length),
    validation,
  };
  console.log(
    JSON.stringify({
      work: c.work,
      measures: row.measures,
      readiness: validation.readiness,
      diagnostics: Object.fromEntries(
        [...new Set(validation.diagnostics.map((d) => d.code))].map((code) => [
          code,
          validation.diagnostics.filter((d) => d.code === code).length,
        ]),
      ),
      samples: validation.diagnostics.slice(0, 5),
    }),
  );
  return row;
});
for (const [p, hash] of Object.entries(hashes)) assert.equal(sha256Bytes(readFileSync(p)), hash);
write("evaluation", { sourcesUnchanged: true, results, independentRecognitionValidated: false });
