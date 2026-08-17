import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { inspectCommand } from "./commands/inspect";
import { recognizeCommand } from "./commands/recognize";
import { validateCommand } from "./commands/validate";
import { exportMusicXmlCommand } from "./commands/export-musicxml";
import { createEngineRegistry, type EngineRegistry } from "./engine-registry";
import { PdfOmrError, type PdfOmrErrorCode } from "./errors";
import type { OmrEngineProgress } from "./engines/types";
import { omrRunManifestSchema, type PdfOmrValidateReport } from "./schemas";

export { PdfOmrError } from "./errors";
export { runEngineProcess } from "./engine-runner";
export { renderPdfPages, readPdfPageCount, encodeRgbaPng } from "./render-pdf-pages";
export { createEngineRegistry, resolveBundledLegatoRunnerPath } from "./engine-registry";
export type { EngineRegistry } from "./engine-registry";
export type { OmrEngineAdapter } from "./engines/types";
export type { OmrScoreDraft } from "./schemas";

export type PdfOmrPipelineArtifacts = {
  inspect: "inspect/input.json";
  recognitionDirectory: "recognition";
  validation: "validation.json";
  musicXml: "score.mxl";
  roundTrip: "round-trip.json";
};

export type PdfOmrPipelineResult = {
  schemaVersion: "1.0.0";
  status: "succeeded";
  input: {
    fileName: string;
    inputSha256: string;
    sizeBytes: number;
    pageCount: number;
    inputKind: "pdf" | "image";
  };
  engine: {
    id: string;
    version: string;
    modelSha256?: string;
  };
  validation: Pick<PdfOmrValidateReport, "readiness" | "outputSha256">;
  outputSha256: string;
  artifacts: PdfOmrPipelineArtifacts;
};

export type PdfOmrPipelineRequest = {
  inputPath: string;
  engineId: string;
  outputDirectory: string;
  engineRegistry?: EngineRegistry;
  standardFontDirectory?: string;
  wasmDirectory?: string;
  signal?: AbortSignal;
  onProgress?: (event: PdfOmrPipelineProgressEvent) => void;
};

export type PdfOmrPipelineStage = "inspect" | "recognize" | "validate" | "export";

export type PdfOmrPipelineProgressEvent =
  | {
      schemaVersion: "1.0.0";
      sequence: number;
      kind: "stage";
      stage: PdfOmrPipelineStage;
      status: "started" | "completed";
    }
  | {
      schemaVersion: "1.0.0";
      sequence: number;
      kind: "engine-progress";
      stage: "recognize";
      unit: "page" | "system";
      completed: number;
      total: number;
    }
  | {
      schemaVersion: "1.0.0";
      sequence: number;
      kind: "terminal";
      status: "succeeded" | "cancelled" | "failed";
      errorCode?: PdfOmrErrorCode;
    };

const artifacts: PdfOmrPipelineArtifacts = {
  inspect: "inspect/input.json",
  recognitionDirectory: "recognition",
  validation: "validation.json",
  musicXml: "score.mxl",
  roundTrip: "round-trip.json",
};

export async function runPdfOmrPipeline(input: PdfOmrPipelineRequest): Promise<PdfOmrPipelineResult> {
  const emit = createProgressEmitter(input.onProgress);
  const outputDirectory = resolve(input.outputDirectory);
  try {
    await createNewDirectory(outputDirectory);
    throwIfAborted(input.signal);

    emit.stage("inspect", "started");
    const inspection = await inspectCommand(input.inputPath, "inspect", outputDirectory, {
      ...(input.standardFontDirectory === undefined ? {} : { standardFontDirectory: input.standardFontDirectory }),
      ...(input.wasmDirectory === undefined ? {} : { wasmDirectory: input.wasmDirectory }),
    });
    throwIfAborted(input.signal);
    emit.stage("inspect", "completed");

    emit.stage("recognize", "started");
    await recognizeCommand(input.inputPath, input.engineId, artifacts.recognitionDirectory, {
      cwd: outputDirectory,
      engineRegistry: input.engineRegistry ?? createEngineRegistry(),
      ...(input.standardFontDirectory === undefined ? {} : { standardFontDirectory: input.standardFontDirectory }),
      ...(input.wasmDirectory === undefined ? {} : { wasmDirectory: input.wasmDirectory }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      onProgress: emit.engine,
    });
    throwIfAborted(input.signal);
    emit.stage("recognize", "completed");

    emit.stage("validate", "started");
    const validation = await validateCommand(
      join(artifacts.recognitionDirectory, "draft.json"),
      artifacts.validation,
      outputDirectory,
    );
    throwIfAborted(input.signal);
    emit.stage("validate", "completed");

    emit.stage("export", "started");
    const exported = await exportMusicXmlCommand(
      join(artifacts.recognitionDirectory, "draft.json"),
      artifacts.musicXml,
      artifacts.roundTrip,
      outputDirectory,
    );
    throwIfAborted(input.signal);
    emit.stage("export", "completed");

    const manifest = omrRunManifestSchema.parse(
      JSON.parse(await readFile(join(outputDirectory, artifacts.recognitionDirectory, "run.json"), "utf8")),
    );

    const result: PdfOmrPipelineResult = {
      schemaVersion: "1.0.0",
      status: "succeeded",
      input: {
        fileName: inspection.source.fileName,
        inputSha256: inspection.source.sha256,
        sizeBytes: inspection.source.sizeBytes,
        pageCount: inspection.pageCount,
        inputKind: inspection.source.inputKind,
      },
      engine: {
        id: manifest.engine.id,
        version: manifest.engine.version,
        ...(manifest.engine.modelSha256 === undefined ? {} : { modelSha256: manifest.engine.modelSha256 }),
      },
      validation: {
        readiness: validation.readiness,
        outputSha256: validation.outputSha256,
      },
      outputSha256: exported.outputSha256,
      artifacts,
    };
    emit.terminal("succeeded");
    return result;
  } catch (error) {
    if (error instanceof PdfOmrError) {
      emit.terminal(error.code === "INTERRUPTED" ? "cancelled" : "failed", error.code);
    } else {
      emit.terminal("failed");
    }
    throw error;
  }
}

function createProgressEmitter(onProgress: PdfOmrPipelineRequest["onProgress"]): {
  stage(stage: PdfOmrPipelineStage, status: "started" | "completed"): void;
  engine(progress: OmrEngineProgress): void;
  terminal(status: "succeeded" | "cancelled" | "failed", errorCode?: PdfOmrErrorCode): void;
} {
  let sequence = 0;
  const engineCounters = new Map<OmrEngineProgress["unit"], { completed: number; total: number }>();
  type ProgressPayload =
    | { kind: "stage"; stage: PdfOmrPipelineStage; status: "started" | "completed" }
    | { kind: "engine-progress"; stage: "recognize"; unit: "page" | "system"; completed: number; total: number }
    | { kind: "terminal"; status: "succeeded" | "cancelled" | "failed"; errorCode?: PdfOmrErrorCode };
  const notify = (event: ProgressPayload) => {
    const progressEvent = { schemaVersion: "1.0.0" as const, sequence, ...event } as PdfOmrPipelineProgressEvent;
    sequence += 1;
    try {
      onProgress?.(progressEvent);
    } catch {
      // Progress observers cannot change pipeline execution or canonical artifacts.
    }
  };
  return {
    stage: (stage, status) => notify({ kind: "stage", stage, status }),
    engine: (progress) => {
      if (
        !Number.isSafeInteger(progress.completed) ||
        !Number.isSafeInteger(progress.total) ||
        progress.completed < 0 ||
        progress.total <= 0 ||
        progress.completed > progress.total
      ) {
        return;
      }
      const previous = engineCounters.get(progress.unit);
      if (previous !== undefined && (progress.total !== previous.total || progress.completed <= previous.completed)) {
        return;
      }
      engineCounters.set(progress.unit, { completed: progress.completed, total: progress.total });
      notify({ kind: "engine-progress", stage: "recognize", ...progress });
    },
    terminal: (status, errorCode) =>
      notify({ kind: "terminal", status, ...(errorCode === undefined ? {} : { errorCode }) }),
  };
}

async function createNewDirectory(outputDirectory: string): Promise<void> {
  try {
    await mkdir(dirname(outputDirectory), { recursive: true });
    await mkdir(outputDirectory);
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "pipeline output directory already exists or cannot be created", {
      context: { reason: "output-exists" },
      cause: error,
    });
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new PdfOmrError("INTERRUPTED", "PDF OMR pipeline was interrupted");
}
