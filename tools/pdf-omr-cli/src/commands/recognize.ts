import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createArtifactWriter } from "../artifact-writer";
import type { EngineRegistry } from "../engine-registry";
import { PdfOmrError } from "../errors";
import type { OmrEngineProgress } from "../engines/types";
import { resolveFullPageSegmentation, type StaffLayout } from "../staff-system-segmentation";
import { inspectOmrInputBytes } from "../inspect-pdf";
import {
  omrRunManifestSchema,
  omrScoreDraftSchema,
  pdfOmrRecognizeReportSchema,
  type PdfOmrRecognizeReport,
} from "../schemas";

export async function recognizeCommand(
  input: string,
  engineId: string,
  output: string,
  context: {
    cwd: string;
    engineRegistry: EngineRegistry;
    standardFontDirectory?: string;
    wasmDirectory?: string;
    inputScope?: "full-page" | "system-crop";
    staffLayout?: StaffLayout;
    segmentationId?: string;
    signal?: AbortSignal;
    onProgress?: (progress: OmrEngineProgress) => void;
  },
): Promise<PdfOmrRecognizeReport> {
  const adapter = context.engineRegistry.get(engineId);
  const inputPath = resolve(context.cwd, input);
  let bytes: Uint8Array;
  try {
    bytes = await readFile(inputPath);
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "OMR input cannot be read", {
      context: { reason: "unreadable-input", fileName: basename(input) },
      cause: error,
    });
  }
  const inputReport = await inspectOmrInputBytes(bytes, {
    fileName: input,
    ...(context.standardFontDirectory === undefined ? {} : { standardFontDirectory: context.standardFontDirectory }),
    ...(context.wasmDirectory === undefined ? {} : { wasmDirectory: context.wasmDirectory }),
  });
  const writer = await createArtifactWriter(resolve(context.cwd, output));
  const startedAt = new Date().toISOString();
  const runId = `${inputReport.source.sha256.slice(0, 16)}-${engineId}`;
  const workDirectory = await mkdtemp(join(tmpdir(), "pdf-omr-engine-"));

  try {
    const environment = await adapter.inspectEnvironment(context.signal);
    if (!(environment.inputKinds ?? ["pdf"]).includes(inputReport.source.inputKind)) {
      throw new PdfOmrError("INVALID_INPUT", "engine does not support this OMR input kind", {
        context: { reason: "unsupported-engine-input-kind", inputKind: inputReport.source.inputKind },
      });
    }
    const raw = await adapter.recognize({
      inputPath,
      outputDirectory: workDirectory,
      ...(context.standardFontDirectory === undefined ? {} : { standardFontDirectory: context.standardFontDirectory }),
      ...(context.wasmDirectory === undefined ? {} : { wasmDirectory: context.wasmDirectory }),
      ...(context.inputScope === undefined ? {} : { inputScope: context.inputScope }),
      ...(context.staffLayout === undefined ? {} : { staffLayout: context.staffLayout }),
      ...(context.segmentationId === undefined ? {} : { segmentationId: context.segmentationId }),
      ...(context.signal === undefined ? {} : { signal: context.signal }),
      ...(context.onProgress === undefined ? {} : { onProgress: context.onProgress }),
    });
    const normalizedDraft = adapter.normalize(raw);
    const draft = omrScoreDraftSchema.parse({
      ...normalizedDraft,
      provenance: {
        engine: {
          id: environment.id,
          version: environment.version,
          ...(environment.modelSha256 === undefined ? {} : { modelSha256: environment.modelSha256 }),
        },
        inputSha256: inputReport.source.sha256,
      },
    });
    await writer.writeJson("input.json", inputReport);
    await writer.writeJson("engine/environment.json", environment);
    for (const artifact of raw.nativeArtifacts) {
      await writer.writeBytes(`engine/${artifact.relativePath}`, artifact.bytes);
    }
    const draftSha256 = await writer.writeJson("draft.json", draft);
    await writer.writeJson("diagnostics.json", draft.diagnostics);
    const manifest = omrRunManifestSchema.parse({
      schemaVersion: "1.0.0",
      runId,
      inputSha256: inputReport.source.sha256,
      engine: {
        id: environment.id,
        version: environment.version,
        ...(environment.modelSha256 === undefined ? {} : { modelSha256: environment.modelSha256 }),
      },
      parameters: {
        ...environment.parameters,
        ...recognizeSegmentationParameters(engineId, context),
      },
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

function recognizeSegmentationParameters(
  engineId: string,
  context: {
    inputScope?: "full-page" | "system-crop";
    staffLayout?: StaffLayout;
    segmentationId?: string;
  },
): Record<string, string | number | boolean> {
  if (engineId !== "rokot") return {};
  if (context.inputScope === "system-crop") {
    return context.staffLayout === undefined ? {} : { segmentationStaffLayout: context.staffLayout };
  }
  const options = resolveFullPageSegmentation({
    ...(context.segmentationId === undefined ? {} : { segmentationId: context.segmentationId }),
    ...(context.staffLayout === undefined ? {} : { staffLayout: context.staffLayout }),
  });
  return {
    segmentationAllowFragmentedRuns: options.allowFragmentedRuns === true,
    segmentationStaffLayout: options.staffLayout ?? "auto",
    segmentationPairAdjacentUnpairedGroups: options.pairAdjacentUnpairedGroups === true,
    ...(context.segmentationId === undefined ? {} : { segmentationId: context.segmentationId }),
  };
}
