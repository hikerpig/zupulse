import { analyzeHarmony, BUNDLED_PAPER_SEMI_CRF_ALGORITHM_VERSION, createDefaultHarmonyScope } from "@zupulse/web-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { canonicalJson, sha256Bytes } from "../canonical-json";
import { PdfOmrError } from "../errors";
import { harmonyArtifactSchema } from "../harmony-artifact";
import { projectDraftHarmony } from "../project-harmony";
import { omrScoreDraftSchema, pdfOmrAnalyzeReportSchema, type PdfOmrAnalyzeReport } from "../schemas";
import { validateDraft } from "../validate-draft";

export async function analyzeCommand(
  input: string,
  output: string,
  decisionThreshold: number,
  cwd: string,
): Promise<PdfOmrAnalyzeReport> {
  const inputPath = resolve(cwd, input);
  let draftBytes: Uint8Array;
  try {
    draftBytes = await readFile(inputPath);
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "Draft cannot be read", {
      context: { fileName: basename(input) },
      cause: error,
    });
  }
  let draft;
  try {
    draft = omrScoreDraftSchema.parse(JSON.parse(new TextDecoder().decode(draftBytes)));
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "Draft JSON is invalid", {
      context: { fileName: basename(input) },
      cause: error,
    });
  }
  const validation = validateDraft(draft);
  if (validation.readiness.harmony === "blocked") {
    throw new PdfOmrError("DRAFT_VALIDATION_FAILED", "Draft is not Harmony-ready", {
      context: {
        blockingCodes: validation.diagnostics
          .filter((diagnostic) => diagnostic.severity === "blocking")
          .map((diagnostic) => diagnostic.code),
      },
    });
  }
  const harmonyInput = projectDraftHarmony(draft);
  const includedTrackIds = createDefaultHarmonyScope(harmonyInput).includedTrackIds;
  if (includedTrackIds.length === 0) {
    throw new PdfOmrError("DRAFT_VALIDATION_FAILED", "Draft has no pitched Harmony scope", {
      context: { reason: "empty-harmony-scope" },
    });
  }
  const topK = 3;
  let segments;
  try {
    segments = analyzeHarmony(harmonyInput, { includedTrackIds, topK, decisionThreshold });
  } catch (error) {
    throw new PdfOmrError("PROJECTION_OR_EXPORT_FAILED", "Harmony analyzer failed", {
      context: { reason: "analyzer-failed" },
      cause: error,
    });
  }
  const artifact = harmonyArtifactSchema.parse({
    schemaVersion: "1.0.0",
    draftSha256: sha256Bytes(draftBytes),
    ...(draft.provenance === undefined ? {} : { omr: { engine: draft.provenance.engine } }),
    harmony: {
      algorithmVersion: BUNDLED_PAPER_SEMI_CRF_ALGORITHM_VERSION,
      decisionThreshold,
      topK,
    },
    readiness: validation.readiness.harmony,
    diagnostics: validation.diagnostics,
    segments,
  });
  const outputBytes = new TextEncoder().encode(canonicalJson(artifact));
  const outputPath = resolve(cwd, output);
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, outputBytes, { flag: "wx" });
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "Harmony output already exists or cannot be written", {
      context: { fileName: basename(output) },
      cause: error,
    });
  }
  return pdfOmrAnalyzeReportSchema.parse({
    schemaVersion: "1.0.0",
    command: "analyze",
    status: "succeeded",
    outputSha256: sha256Bytes(outputBytes),
  });
}
