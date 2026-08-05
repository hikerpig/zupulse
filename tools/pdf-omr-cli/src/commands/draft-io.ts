import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { canonicalJson, sha256Bytes } from "../canonical-json";
import { PdfOmrError } from "../errors";
import { omrScoreDraftSchema, type OmrScoreDraft } from "../schemas";

export async function readDraft(input: string, cwd: string): Promise<{ draft: OmrScoreDraft; bytes: Uint8Array }> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(resolve(cwd, input));
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "Draft cannot be read", {
      context: { fileName: basename(input) },
      cause: error,
    });
  }
  try {
    return {
      draft: omrScoreDraftSchema.parse(JSON.parse(new TextDecoder().decode(bytes))),
      bytes,
    };
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "Draft JSON is invalid", {
      context: { fileName: basename(input) },
      cause: error,
    });
  }
}

export async function writeCanonicalNew(output: string, value: unknown, cwd: string): Promise<string> {
  return writeBytesNew(output, new TextEncoder().encode(canonicalJson(value)), cwd);
}

export async function writeBytesNew(output: string, bytes: Uint8Array, cwd: string): Promise<string> {
  const outputPath = resolve(cwd, output);
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, bytes, { flag: "wx" });
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "output already exists or cannot be written", {
      context: { fileName: basename(output) },
      cause: error,
    });
  }
  return sha256Bytes(bytes);
}
