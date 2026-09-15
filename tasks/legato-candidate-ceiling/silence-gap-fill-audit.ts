import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fillVoiceGapsWithRests } from "../../tools/pdf-omr-cli/src/draft-gap-fill";
import { generateMusicXml } from "../../tools/pdf-omr-cli/src/generate-musicxml";
import { validateDraft } from "../../tools/pdf-omr-cli/src/validate-draft";
import { compareDraftMusicXml } from "../../tools/pdf-omr-cli/src/musicxml-structural-compare";
import { canonicalJson, sha256Bytes } from "../../tools/pdf-omr-cli/src/canonical-json";
import { omrScoreDraftSchema, type OmrScoreDraft } from "../../tools/pdf-omr-cli/src/schemas";
import { runPdfOmrCommand } from "../../tools/pdf-omr-cli/src/command";

const output = "tools/pdf-omr-cli/reports/development/legato-silence-contract-v1-20260914";
const cases = [
  "trailing-forward",
  "leading-forward",
  "partial-secondary-voice",
  "explicit-voice-forward",
  "trailing-rest-control",
  "leading-rest-control",
];
const paths = [
  "tasks/legato-candidate-ceiling/silence-gap-fill-audit.ts",
  `${output}/protocol.json`,
  ...cases.flatMap((id) => [`${output}/${id}.musicxml`, `${output}/${id}-draft.json`]),
  ...[
    "engines/legato.ts",
    "draft-gap-fill.ts",
    "schemas.ts",
    "rational.ts",
    "generate-musicxml.ts",
    "validate-draft.ts",
    "musicxml-structural-compare.ts",
  ].map((p) => `tools/pdf-omr-cli/src/${p}`),
];
const hashes = Object.fromEntries(paths.map((p) => [p, sha256Bytes(readFileSync(p))]));
const write = (name: string, value: unknown) =>
  writeFileSync(`${output}/${name}.json`, canonicalJson(value), { flag: "wx" });
write("gap-fill-protocol", {
  hashes,
  modelCalls: 0,
  realReferenceEdits: 0,
  candidateEdits: 0,
  purpose:
    "Apply the existing LEGATO gap-fill function only to six hand-authored fixtures, not real references. Quantify added rest events, warnings, generated XML and round-trip. This is representation diagnosis, not recognition gain or reference admission.",
});
const events = (d: OmrScoreDraft) =>
  d.parts.flatMap((p) => p.staves.flatMap((s) => s.measures.flatMap((m) => m.voices.flatMap((v) => v.events))));
const results = [];
for (const id of cases) {
  const draft = omrScoreDraftSchema.parse(JSON.parse(readFileSync(`${output}/${id}-draft.json`, "utf8")));
  const original = canonicalJson(draft);
  const filled = omrScoreDraftSchema.parse(fillVoiceGapsWithRests(draft));
  assert.equal(canonicalJson(draft), original);
  assert.deepEqual(
    events(filled).filter((e) => e.type === "note"),
    events(draft).filter((e) => e.type === "note"),
  );
  const addedRests = events(filled).filter((e) => e.type === "rest" && !events(draft).some((old) => old.id === e.id));
  assert.equal(addedRests.length, id.endsWith("control") ? 0 : 1);
  const validation = validateDraft(filled);
  assert.notEqual(validation.readiness.musicXml, "blocked");
  write(`${id}-filled`, filled);
  const xml = generateMusicXml(filled, { container: "xml" });
  writeFileSync(`${output}/${id}-filled.musicxml`, xml, { flag: "wx" });
  const text = new TextDecoder().decode(xml);
  const printedRestCount = (text.match(/<rest\/>/g) ?? []).length;
  assert.equal(printedRestCount, 1);
  assert(!text.includes("print-object"));
  const rawSourceComparison = await compareDraftMusicXml(filled, readFileSync(`${output}/${id}.musicxml`));
  assert.equal(rawSourceComparison.structural, id.endsWith("control"));
  await runPdfOmrCommand([
    "export-musicxml",
    `${output}/${id}-filled.json`,
    "--output",
    `${output}/${id}-filled.mxl`,
    "--round-trip-report",
    `${output}/${id}-filled-round-trip.json`,
  ]);
  const roundTrip = JSON.parse(readFileSync(`${output}/${id}-filled-round-trip.json`, "utf8"));
  const result = { id, addedRests, validation, printedRestCount, rawSourceComparison, roundTrip };
  results.push(result);
  console.log(
    JSON.stringify({
      id,
      addedRests: addedRests.length,
      readiness: validation.readiness,
      printedRestCount,
      rawSourceStructural: rawSourceComparison.structural,
      roundTrip,
    }),
  );
}
for (const [p, h] of Object.entries(hashes)) assert.equal(sha256Bytes(readFileSync(p)), h, p);
write("gap-fill-evaluation", { sourcesUnchanged: true, results });
