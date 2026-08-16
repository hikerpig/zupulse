import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  PdfOmrError,
  runPdfOmrPipeline,
  type PdfOmrPipelineRequest,
  type PdfOmrPipelineResult,
} from "@zupulse/pdf-omr-cli/pipeline";
import { RecognitionJobStore } from "./job-store";
import { RecognitionEventHub } from "./recognition-events";

export interface RecognitionObjectStore {
  materialize(key: string, destinationPath: string, expectedSha256: string): Promise<void>;
  putFile(key: string, sourcePath: string, expectedSha256: string): Promise<{ sizeBytes: number }>;
  putBytes(key: string, bytes: Uint8Array): Promise<void>;
  delete(keys: readonly string[]): Promise<void>;
}

type PipelineRunner = (request: PdfOmrPipelineRequest) => Promise<PdfOmrPipelineResult>;

export class RecognitionWorker {
  private readonly store: RecognitionJobStore;
  private readonly objects: RecognitionObjectStore;
  private readonly tempRoot: string;
  private readonly now: () => Date;
  private readonly runPipeline: PipelineRunner;
  private readonly events: RecognitionEventHub;
  private readonly active = new Map<string, AbortController>();

  constructor(options: {
    store: RecognitionJobStore;
    objects: RecognitionObjectStore;
    tempRoot: string;
    now?: () => Date;
    runPipeline?: PipelineRunner;
    events?: RecognitionEventHub;
  }) {
    this.store = options.store;
    this.objects = options.objects;
    this.tempRoot = options.tempRoot;
    this.now = options.now ?? (() => new Date());
    this.runPipeline = options.runPipeline ?? runPdfOmrPipeline;
    this.events = options.events ?? new RecognitionEventHub();
  }

  async runNext(): Promise<boolean> {
    const startedAt = this.now().toISOString();
    const claimed = this.store.claimNext(startedAt);
    if (claimed === undefined || claimed.attemptId === undefined) return false;
    await mkdir(this.tempRoot, { recursive: true });
    const runDirectory = await mkdtemp(join(this.tempRoot, "attempt-"));
    const inputPath = join(
      runDirectory,
      claimed.input?.inputKind === "image"
        ? claimed.input.fileName.toLowerCase().endsWith(".png")
          ? "input.png"
          : "input.jpg"
        : "input.pdf",
    );
    const outputDirectory = join(runDirectory, "output");
    const resultObjectKey = `jobs/${claimed.jobId}/result.mxl`;
    const manifestObjectKey = `jobs/${claimed.jobId}/result.json`;
    const controller = new AbortController();
    this.active.set(claimed.jobId, controller);
    let pipelineCompleted = false;
    try {
      await this.objects.materialize(claimed.inputObjectKey, inputPath, claimed.inputSha256);
      const result = await this.runPipeline({
        inputPath,
        outputDirectory,
        engineId: claimed.engineId,
        signal: controller.signal,
        onProgress: (event) => {
          this.events.publish(this.store.applyProgress(claimed.attemptId!, event));
        },
      });
      pipelineCompleted = true;
      const resultPath = join(outputDirectory, result.artifacts.musicXml);
      const diagnostics = await readDiagnostics(join(outputDirectory, result.artifacts.validation));
      await assertFileHash(resultPath, result.outputSha256);
      const stored = await this.objects.putFile(resultObjectKey, resultPath, result.outputSha256);
      await this.objects.materialize(resultObjectKey, join(runDirectory, "published-result.mxl"), result.outputSha256);
      const manifestBytes = new TextEncoder().encode(
        JSON.stringify({
          schemaVersion: "1.0.0",
          outputSha256: result.outputSha256,
          validation: { readiness: result.validation.readiness, diagnostics },
        }),
      );
      const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
      await this.objects.putBytes(manifestObjectKey, manifestBytes);
      await this.objects.materialize(manifestObjectKey, join(runDirectory, "published-result.json"), manifestSha256);
      this.events.publish(
        this.store.succeed(claimed.attemptId, {
          finishedAt: this.now().toISOString(),
          engine: result.engine,
          pageCount: result.input.pageCount,
          resultObjectKey,
          manifestObjectKey,
          outputSha256: result.outputSha256,
          resultSizeBytes: stored.sizeBytes,
          result: {
            fileName: "score.mxl",
            outputSha256: result.outputSha256,
            validation: { readiness: result.validation.readiness, diagnostics },
          },
        }),
      );
    } catch (error) {
      await this.objects.delete([resultObjectKey, manifestObjectKey]).catch(() => undefined);
      if (error instanceof PdfOmrError && error.code === "INTERRUPTED") {
        this.events.publish(this.store.finishCancellation(claimed.attemptId, this.now().toISOString()));
        return true;
      }
      const code =
        error instanceof PdfOmrError
          ? error.code
          : pipelineCompleted
            ? "RESULT_PERSIST_FAILED"
            : "ENGINE_EXECUTION_FAILED";
      this.events.publish(this.store.fail(claimed.attemptId, code, this.now().toISOString()));
    } finally {
      this.active.delete(claimed.jobId);
      await rm(runDirectory, { recursive: true, force: true });
    }
    return true;
  }

  cancel(jobId: string): boolean {
    const controller = this.active.get(jobId);
    if (controller === undefined) return false;
    controller.abort();
    return true;
  }
}

async function readDiagnostics(path: string): Promise<{ code: string; severity: "blocking" | "warning" | "info" }[]> {
  const raw = JSON.parse(await readFile(path, "utf8")) as { diagnostics?: unknown };
  if (!Array.isArray(raw.diagnostics)) return [];
  return raw.diagnostics.slice(0, 512).filter(isSafeDiagnostic);
}

function isSafeDiagnostic(value: unknown): value is { code: string; severity: "blocking" | "warning" | "info" } {
  if (typeof value !== "object" || value === null) return false;
  const diagnostic = value as { code?: unknown; severity?: unknown };
  return (
    typeof diagnostic.code === "string" &&
    /^[A-Z][A-Z0-9_]{0,63}$/.test(diagnostic.code) &&
    (diagnostic.severity === "blocking" || diagnostic.severity === "warning" || diagnostic.severity === "info")
  );
}

async function assertFileHash(path: string, expectedSha256: string): Promise<void> {
  const actual = createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
  if (actual !== expectedSha256) {
    throw new PdfOmrError("PROJECTION_OR_EXPORT_FAILED", "PDF OMR result hash mismatch");
  }
}
