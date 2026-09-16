import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { normalizeAudiverisMusicXml } from "../../tools/pdf-omr-cli/src/normalizers/audiveris";
import { validateDraft } from "../../tools/pdf-omr-cli/src/validate-draft";
import { compareDraftMusicXml } from "../../tools/pdf-omr-cli/src/musicxml-structural-compare";
import { runPdfOmrCommand } from "../../tools/pdf-omr-cli/src/command";
import { canonicalJson, sha256Bytes } from "../../tools/pdf-omr-cli/src/canonical-json";
import { omrScoreDraftSchema } from "../../tools/pdf-omr-cli/src/schemas";
import { PdfOmrError } from "../../tools/pdf-omr-cli/src/errors";

const output = "tools/pdf-omr-cli/reports/development/legato-silence-contract-v1-20260914";
const note = (voice: number, duration: number, step = "C") =>
  `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><staff>1</staff></note>`;
const rest = `<note><rest/><duration>4</duration><voice>2</voice><staff>1</staff></note>`;
const half = note(2, 8);
const forward = `<forward><duration>4</duration></forward>`;
const cases = [
  { id: "trailing-forward", tail: half + forward, blocked: true, restCount: 0 },
  { id: "leading-forward", tail: forward + half, blocked: true, restCount: 0 },
  {
    id: "partial-secondary-voice",
    tail: note(2, 4) + note(2, 4, "D") + `<backup><duration>8</duration></backup>` + note(3, 12, "A"),
    blocked: true,
    restCount: 0,
  },
  {
    id: "explicit-voice-forward",
    tail: half + `<forward><duration>4</duration><voice>2</voice><staff>1</staff></forward>`,
    blocked: true,
    restCount: 0,
  },
  { id: "trailing-rest-control", tail: half + rest, blocked: false, restCount: 1 },
  { id: "leading-rest-control", tail: rest + half, blocked: false, restCount: 1 },
];
const xmlOf = (tail: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${note(1, 12, "G")}<backup><duration>12</duration></backup>${tail}</measure></part></score-partwise>`;
const files = [
  "tasks/legato-candidate-ceiling/silence-contract-audit.ts",
  ...[
    "normalizers/audiveris.ts",
    "normalizers/musicxml-source.ts",
    "validate-draft.ts",
    "generate-musicxml.ts",
    "musicxml-structural-compare.ts",
    "commands/export-musicxml.ts",
    "schemas.ts",
    "rational.ts",
  ].map((p) => `tools/pdf-omr-cli/src/${p}`),
];
const hashes = Object.fromEntries(files.map((p) => [p, sha256Bytes(readFileSync(p))]));
mkdirSync(output);
const write = (name: string, value: unknown) =>
  writeFileSync(`${output}/${name}.json`, canonicalJson(value), { flag: "wx" });
write("protocol", {
  hashes,
  modelCalls: 0,
  candidateEdits: 0,
  referenceEdits: 0,
  cases: cases.map(({ tail, ...c }) => ({ ...c, xmlSha256: sha256Bytes(new TextEncoder().encode(xmlOf(tail))) })),
  decision:
    "Reproduce current representation boundaries with hand-authored fixtures; no validator changes or ground-truth repairs. Raw-source normalized comparison is not an export round-trip or proof of original XML semantic preservation.",
});
const results = [];
for (const c of cases) {
  const bytes = new TextEncoder().encode(xmlOf(c.tail));
  writeFileSync(`${output}/${c.id}.musicxml`, bytes, { flag: "wx" });
  const draft = omrScoreDraftSchema.parse(normalizeAudiverisMusicXml(bytes));
  write(`${c.id}-draft`, draft);
  const validation = validateDraft(draft);
  const voices = draft.parts[0]!.staves[0]!.measures[0]!.voices;
  const events = voices.flatMap((v) => v.events);
  assert.equal(events.filter((e) => e.type === "rest").length, c.restCount);
  const blocking = validation.diagnostics.filter((d) => d.severity === "blocking");
  assert.equal(validation.readiness.musicXml === "blocked", c.blocked);
  assert.equal(validation.readiness.harmony === "blocked", c.blocked);
  assert.deepEqual(
    blocking.map((d) => d.code),
    c.blocked ? ["VOICE_DURATION_MISMATCH"] : [],
  );
  const rawSourceComparison = await compareDraftMusicXml(draft, bytes);
  let exported = false;
  let exportFailure: { code: string; context: unknown } | null = null;
  let roundTrip: unknown = null;
  try {
    await runPdfOmrCommand([
      "export-musicxml",
      `${output}/${c.id}-draft.json`,
      "--output",
      `${output}/${c.id}.mxl`,
      "--round-trip-report",
      `${output}/${c.id}-round-trip.json`,
    ]);
    exported = true;
    roundTrip = JSON.parse(readFileSync(`${output}/${c.id}-round-trip.json`, "utf8"));
  } catch (error) {
    if (!(error instanceof PdfOmrError)) throw error;
    exportFailure = { code: error.code, context: error.context };
  }
  assert.equal(exported, !c.blocked);
  if (c.blocked) assert.equal(exportFailure?.code, "PROJECTION_OR_EXPORT_FAILED");
  const row = { id: c.id, voices, validation, rawSourceComparison, exported, exportFailure, roundTrip };
  results.push(row);
  console.log(
    JSON.stringify({
      id: c.id,
      readiness: validation.readiness,
      blocking,
      restCount: c.restCount,
      rawSourceComparison,
      exported,
      exportFailure,
    }),
  );
}
for (const [p, h] of Object.entries(hashes)) assert.equal(sha256Bytes(readFileSync(p)), h, p);
write("evaluation", { sourcesUnchanged: true, results });
