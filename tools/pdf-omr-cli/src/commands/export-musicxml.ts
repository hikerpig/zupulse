import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { PdfOmrError } from "../errors";
import { generateMusicXml } from "../generate-musicxml";
import { compareDraftMusicXml } from "../musicxml-structural-compare";
import { pdfOmrExportReportSchema, type PdfOmrExportReport } from "../schemas";
import { readDraft, writeBytesNew, writeCanonicalNew } from "./draft-io";

export async function exportMusicXmlCommand(
  input: string,
  output: string,
  roundTripOutput: string | undefined,
  cwd: string,
  dependencies: { compare?: typeof compareDraftMusicXml } = {},
): Promise<PdfOmrExportReport> {
  await assertAbsent(output, cwd);
  if (roundTripOutput !== undefined) await assertAbsent(roundTripOutput, cwd);
  const { draft } = await readDraft(input, cwd);
  const bytes = generateMusicXml(draft, { container: "mxl" });
  const roundTrip = await (dependencies.compare ?? compareDraftMusicXml)(draft, bytes);
  if (!roundTrip.parse || !roundTrip.view || !roundTrip.playback || !roundTrip.structural) {
    if (roundTripOutput !== undefined) await writeCanonicalNew(roundTripOutput, roundTrip, cwd);
    throw new PdfOmrError("PROJECTION_OR_EXPORT_FAILED", "generated MusicXML failed round-trip validation", {
      context: {
        reason: "round-trip-failed",
        differenceCodes: roundTrip.differences.map((difference) => difference.code),
      },
    });
  }
  const outputSha256 = await writeBytesNew(output, bytes, cwd);
  if (roundTripOutput !== undefined) await writeCanonicalNew(roundTripOutput, roundTrip, cwd);
  return pdfOmrExportReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "export-musicxml",
    status: "succeeded",
    outputSha256,
    structural: true,
  });
}

async function assertAbsent(path: string, cwd: string): Promise<void> {
  try {
    await access(resolve(cwd, path));
  } catch {
    return;
  }
  throw new PdfOmrError("INVALID_INPUT", "output already exists", {
    context: { reason: "output-exists" },
  });
}
