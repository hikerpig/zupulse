import { PdfOmrError } from "../errors";
import type { OmrScoreDraft } from "../schemas";
import { normalizeAudiverisMusicXml } from "./audiveris";

type Diagnostic = OmrScoreDraft["diagnostics"][number];

export function prepareTranscodaKern(bytes: Uint8Array): {
  bytes: Uint8Array;
  diagnostics: Diagnostic[];
} {
  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replaceAll("\r\n", "\n");
  } catch (error) {
    throw new PdfOmrError("ENGINE_OUTPUT_INVALID", "Transcoda kern output is not UTF-8", {
      context: { reason: "invalid-utf8" },
      cause: error,
    });
  }
  const lines = source.split("\n").filter((line) => line.length > 0);
  const header = lines[0];
  if (header === undefined || !header.split("\t").every((token) => token === "**kern")) {
    throw invalidKern("missing-kern-header");
  }
  const spineCount = header.split("\t").length;
  if (lines.some((line) => line.split("\t").length !== spineCount)) {
    throw invalidKern("inconsistent-spine-count");
  }
  const terminator = Array.from({ length: spineCount }, () => "*-").join("\t");
  const diagnostics: Diagnostic[] = [];
  if (lines.at(-1) !== terminator) {
    lines.push(terminator);
    diagnostics.push({
      code: "TRANSCODA_APPENDED_TERMINATOR",
      severity: "warning",
      message: "appended missing Humdrum spine terminator",
    });
  }
  return { bytes: new TextEncoder().encode(`${lines.join("\n")}\n`), diagnostics };
}

export function normalizeTranscodaOutput(musicXmlBytes: Uint8Array, diagnostics: readonly Diagnostic[]): OmrScoreDraft {
  const draft = normalizeAudiverisMusicXml(musicXmlBytes);
  return {
    ...draft,
    diagnostics: [...draft.diagnostics, ...diagnostics],
  };
}

function invalidKern(reason: string): PdfOmrError {
  return new PdfOmrError("ENGINE_OUTPUT_INVALID", "Transcoda kern output is invalid", {
    context: { reason },
  });
}
