import { sha256Bytes } from "../canonical-json";
import { PdfOmrError } from "../errors";
import { pdfOmrValidateReportSchema, type PdfOmrValidateReport } from "../schemas";
import { validateDraft } from "../validate-draft";
import { readDraft, writeCanonicalNew } from "./draft-io";

export async function validateCommand(input: string, output: string, cwd: string): Promise<PdfOmrValidateReport> {
  const { draft, bytes } = await readDraft(input, cwd);
  const validation = validateDraft(draft);
  const outputSha256 = await writeCanonicalNew(
    output,
    {
      schemaVersion: "1.0.0",
      draftSha256: sha256Bytes(bytes),
      ...validation,
    },
    cwd,
  );
  if (validation.readiness.harmony === "blocked" || validation.readiness.musicXml === "blocked") {
    throw new PdfOmrError("DRAFT_VALIDATION_FAILED", "Draft validation is blocked", {
      context: { readiness: validation.readiness, outputSha256 },
    });
  }
  return pdfOmrValidateReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "validate",
    readiness: validation.readiness,
    outputSha256,
  });
}
