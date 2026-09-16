import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { canonicalJson, sha256Bytes } from "../../tools/pdf-omr-cli/src/canonical-json";
import { normalizeAudiverisMusicXml } from "../../tools/pdf-omr-cli/src/normalizers/audiveris";
import { validateDraft } from "../../tools/pdf-omr-cli/src/validate-draft";
import { omrScoreDraftSchema } from "../../tools/pdf-omr-cli/src/schemas";

const root = "tools/pdf-omr-cli/reports/development/piano-recognition-v1-20260905";
const output = "tools/pdf-omr-cli/reports/development/legato-independent-preflight-v1-20260914";
const cases = [
  { work: "k280", input: `${root}/k280.mxl` },
  { work: "k331", input: "test-fixtures/musicxml/K331-3_reviewed.mxl" },
];
const files = [
  "tasks/legato-candidate-ceiling/independent-reference.ts",
  "tools/pdf-omr-cli/src/normalizers/audiveris.ts",
  "tools/pdf-omr-cli/src/normalizers/musicxml-source.ts",
  "tools/pdf-omr-cli/src/validate-draft.ts",
  "tools/pdf-omr-cli/src/schemas.ts",
  ...cases.flatMap((c) => [c.input, `${root}/${c.work}-baseline-cli/expected.json`]),
];
const hashes = Object.fromEntries(files.map((p) => [p, sha256Bytes(readFileSync(p))]));
const write = (name: string, value: unknown) =>
  writeFileSync(`${output}/${name}.json`, canonicalJson(value), { flag: "wx" });
write("fresh-reference-protocol", {
  hashes,
  modelCalls: 0,
  candidateEdits: 0,
  rule: "Re-normalize original MXL with current code; compare against stored reference and revalidate without repairs",
});
const results = cases.map((c) => {
  const draft = normalizeAudiverisMusicXml(readFileSync(c.input));
  const stored = omrScoreDraftSchema.parse(
    JSON.parse(readFileSync(`${root}/${c.work}-baseline-cli/expected.json`, "utf8")),
  );
  const validation = validateDraft(draft);
  write(`${c.work}-fresh-reference`, draft);
  const row = { work: c.work, identicalToStored: canonicalJson(draft) === canonicalJson(stored), validation };
  console.log(
    JSON.stringify({
      work: c.work,
      identicalToStored: row.identicalToStored,
      readiness: validation.readiness,
      blocking: validation.diagnostics.filter((d) => d.severity === "blocking").length,
    }),
  );
  return row;
});
for (const [p, hash] of Object.entries(hashes)) assert.equal(sha256Bytes(readFileSync(p)), hash);
write("fresh-reference-evaluation", { sourcesUnchanged: true, results });
