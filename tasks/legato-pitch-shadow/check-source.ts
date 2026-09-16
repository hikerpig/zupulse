import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sha256Bytes } from "../../tools/pdf-omr-cli/src/canonical-json";
import { fillVoiceGapsWithRests } from "../../tools/pdf-omr-cli/src/draft-gap-fill";
import { normalizeAudiverisMusicXml } from "../../tools/pdf-omr-cli/src/normalizers/audiveris";
import { runPitchShadow } from "../../tools/pdf-omr-cli/src/run-pitch-shadow";
import { applySourcePitchCorrections } from "../../tools/pdf-omr-cli/src/apply-source-pitch-corrections";

const [pdf, rawMusicXml, python] = process.argv.slice(2);
if (!pdf || !rawMusicXml || !python) throw new Error("usage: check-source.ts <source.pdf> <raw.musicxml> <python>");
const draft = fillVoiceGapsWithRests(normalizeAudiverisMusicXml(await readFile(rawMusicXml)));
draft.provenance = {
  engine: { id: "legato", version: "raw-output-replay" },
  inputSha256: sha256Bytes(await readFile(pdf)),
};
const result = await runPitchShadow(resolve(pdf), draft, python);
const correction =
  result.source && result.report.extractorSha256
    ? await applySourcePitchCorrections(draft, result.source, result.report.extractorSha256)
    : undefined;
const counts = (reasons: string[]) =>
  reasons.reduce<Record<string, number>>((sum, reason) => {
    sum[reason] = (sum[reason] ?? 0) + 1;
    return sum;
  }, {});
console.log(
  JSON.stringify(
    {
      inputSha256: draft.provenance.inputSha256,
      rawMusicXmlSha256: sha256Bytes(await readFile(rawMusicXml)),
      draftMeasures: draft.parts.flatMap((part) =>
        part.staves.map((staff) => ({ part: part.id, staff: staff.index, count: staff.measures.length })),
      ),
      sourcePages: result.source?.pages.map((page) => ({
        reason: page.reason,
        measures: page.measures.length,
        heads: page.measures.reduce((sum, m) => sum + m.heads.length, 0),
      })),
      reason: result.report.reason,
      decisions: counts(result.report.decisions.map((d) => d.reason)),
      suggestions: result.report.suggestions,
      correction: correction ? { reason: correction.reason, appliedCount: correction.applied.length } : null,
      discrepancies: result.report.decisions
        .filter((d) => d.reason === "unanchored-discrepancy")
        .map((d) => {
          const staves = draft.parts.flatMap((part) => part.staves.map((staff) => ({ part, staff })));
          const slot = staves.findIndex(({ part, staff }) => part.id === d.partId && staff.index === d.staffIndex);
          const staff = staves[slot]!.staff;
          const ordinal = staff.measures.findIndex((m) => m.index === d.measureIndex);
          return {
            ...d,
            draft: staff.measures[ordinal],
            source: result.source?.pages.flatMap((p) => p.measures.filter((m) => m.staffIndex === slot))[ordinal],
          };
        }),
    },
    null,
    2,
  ),
);
