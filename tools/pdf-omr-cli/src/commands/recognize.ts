import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createArtifactWriter } from "../artifact-writer";
import type { EngineRegistry } from "../engine-registry";
import { PdfOmrError } from "../errors";
import { inspectPdfBytes } from "../inspect-pdf";
import { normalizeAudiverisMusicXml } from "../normalizers/audiveris";
import { omrRunManifestSchema, pdfOmrRecognizeReportSchema, type PdfOmrRecognizeReport } from "../schemas";

export async function recognizeCommand(
  input: string,
  engineId: string,
  output: string,
  context: { cwd: string; engineRegistry: EngineRegistry; signal?: AbortSignal },
): Promise<PdfOmrRecognizeReport> {
  const adapter = context.engineRegistry.get(engineId);
  const inputPath = resolve(context.cwd, input);
  let bytes: Uint8Array;
  try {
    bytes = await readFile(inputPath);
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "input PDF cannot be read", {
      context: { reason: "unreadable-pdf", fileName: basename(input) },
      cause: error,
    });
  }
  const inputReport = await inspectPdfBytes(bytes, { fileName: input });
  const writer = await createArtifactWriter(resolve(context.cwd, output));
  const startedAt = new Date().toISOString();
  const runId = `${inputReport.source.sha256.slice(0, 16)}-${engineId}`;
  const workDirectory = await mkdtemp(join(tmpdir(), "pdf-omr-engine-"));

  try {
    const environment = await adapter.inspectEnvironment(context.signal);
    const raw = await adapter.recognize({
      inputPath,
      outputDirectory: workDirectory,
      ...(context.signal === undefined ? {} : { signal: context.signal }),
    });
    const draft = normalizeAudiverisMusicXml(raw.musicXmlBytes);
    await writer.writeJson("input.json", inputReport);
    await writer.writeJson("engine/environment.json", environment);
    await writer.writeBytes("engine/raw-output.mxl", raw.musicXmlBytes);
    await writer.writeBytes("engine/raw-output.omr", raw.omrBytes);
    const draftSha256 = await writer.writeJson("draft.json", draft);
    await writer.writeJson("diagnostics.json", draft.diagnostics);
    const manifest = omrRunManifestSchema.parse({
      schemaVersion: "1.0.0",
      runId,
      inputSha256: inputReport.source.sha256,
      engine: { id: environment.id, version: environment.version },
      parameters: {},
      preprocess: { id: "none", version: "1.0.0" },
      startedAt,
      completedAt: new Date().toISOString(),
      status: "succeeded",
      artifactSha256: writer.artifactSha256(),
    });
    await writer.writeJson("run.json", manifest);
    return pdfOmrRecognizeReportSchema.parse({
      schemaVersion: "1.0.0",
      command: "recognize",
      status: "succeeded",
      runId,
      inputSha256: inputReport.source.sha256,
      draftSha256,
    });
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}
