import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createArtifactWriter } from "../artifact-writer";
import { PdfOmrError } from "../errors";
import { inspectPdfBytes } from "../inspect-pdf";
import type { PdfOmrInspectReport } from "../schemas";

export async function inspectCommand(input: string, output: string, cwd: string): Promise<PdfOmrInspectReport> {
  const inputPath = resolve(cwd, input);
  let bytes: Uint8Array;
  try {
    bytes = await readFile(inputPath);
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "input PDF cannot be read", {
      context: { reason: "unreadable-pdf", fileName: basename(input) },
      cause: error,
    });
  }
  const report = await inspectPdfBytes(bytes, { fileName: input });
  const writer = await createArtifactWriter(resolve(cwd, output));
  await writer.writeJson("input.json", report);
  return report;
}
