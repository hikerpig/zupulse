import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createArtifactWriter } from "../artifact-writer";
import { PdfOmrError } from "../errors";
import { inspectOmrInputBytes } from "../inspect-pdf";
import type { PdfOmrInspectReport } from "../schemas";

export async function inspectCommand(
  input: string,
  output: string,
  cwd: string,
  options: { standardFontDirectory?: string; wasmDirectory?: string } = {},
): Promise<PdfOmrInspectReport> {
  const inputPath = resolve(cwd, input);
  let bytes: Uint8Array;
  try {
    bytes = await readFile(inputPath);
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "OMR input cannot be read", {
      context: { reason: "unreadable-input", fileName: basename(input) },
      cause: error,
    });
  }
  const report = await inspectOmrInputBytes(bytes, {
    fileName: input,
    ...(options.standardFontDirectory === undefined ? {} : { standardFontDirectory: options.standardFontDirectory }),
    ...(options.wasmDirectory === undefined ? {} : { wasmDirectory: options.wasmDirectory }),
  });
  const writer = await createArtifactWriter(resolve(cwd, output));
  await writer.writeJson("input.json", report);
  return report;
}
