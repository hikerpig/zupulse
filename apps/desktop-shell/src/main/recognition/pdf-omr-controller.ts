import type { PdfOmrJobSnapshot } from "@zupulse/web-core";
import {
  PdfOmrError,
  type PdfOmrPipelineRequest,
  type PdfOmrPipelineResult,
  type PdfOmrPipelineProgressEvent,
} from "@zupulse/pdf-omr-cli/pipeline";
import { randomUUID } from "node:crypto";
import type { DesktopPdfOmrRuntime } from "./pdf-omr-runtime";

export type PdfOmrRuntimePort = Pick<DesktopPdfOmrRuntime, "run" | "cancel">;

export type PdfOmrJobInput = {
  inputPath: string;
  fileName: string;
  sizeBytes: number;
  inputKind: "pdf" | "image";
  engineId: string;
  outputDirectory: string;
};

export class PdfOmrJobController {
  private snapshot: PdfOmrJobSnapshot | undefined;
  private completed: { jobId: string; outputDirectory: string; result: PdfOmrPipelineResult } | undefined;
  private active: { jobId: string; operation: Promise<void> } | undefined;
  private input: PdfOmrJobInput | undefined;
  private readonly listeners = new Set<(snapshot: PdfOmrJobSnapshot) => void>();
  private readonly progressListeners = new Set<(jobId: string, event: PdfOmrPipelineProgressEvent) => void>();

  constructor(private readonly runtime: PdfOmrRuntimePort) {}

  subscribe(listener: (snapshot: PdfOmrJobSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeProgress(listener: (jobId: string, event: PdfOmrPipelineProgressEvent) => void): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  getSnapshot(): PdfOmrJobSnapshot | undefined {
    return this.snapshot;
  }

  start(input: PdfOmrJobInput): PdfOmrJobSnapshot {
    if (this.active !== undefined) {
      throw new PdfOmrError("INVALID_INPUT", "a PDF OMR job is already active", {
        context: { reason: "pipeline-active" },
      });
    }
    const jobId = randomUUID();
    this.input = input;
    this.completed = undefined;
    this.snapshot = {
      jobId,
      status: "running",
      input: { fileName: input.fileName, sizeBytes: input.sizeBytes, inputKind: input.inputKind },
    };
    this.publish();
    const operation = this.execute(jobId, input);
    this.active = { jobId, operation };
    return this.snapshot;
  }

  retry(jobId: string, engineId: string, outputDirectory: string): PdfOmrJobSnapshot {
    if (
      this.snapshot?.jobId !== jobId ||
      (this.snapshot.status !== "failed" && this.snapshot.status !== "cancelled") ||
      this.input === undefined
    ) {
      throw new PdfOmrError("INVALID_INPUT", "PDF OMR job cannot be retried", {
        context: { reason: "job-not-retryable" },
      });
    }
    return this.start({ ...this.input, engineId, outputDirectory });
  }

  cancel(jobId: string): void {
    if (this.active?.jobId !== jobId) {
      throw new PdfOmrError("INVALID_INPUT", "PDF OMR job is not active", {
        context: { reason: "job-not-active" },
      });
    }
    if (this.snapshot?.status === "running") {
      this.snapshot = { ...this.snapshot, status: "cancelling" };
      this.publish();
    }
    this.runtime.cancel();
  }

  async waitForIdle(): Promise<void> {
    await this.active?.operation;
  }

  getCompletedResult(jobId: string): { outputDirectory: string; result: PdfOmrPipelineResult } | undefined {
    if (this.completed?.jobId !== jobId) return undefined;
    return { outputDirectory: this.completed.outputDirectory, result: this.completed.result };
  }

  private async execute(jobId: string, input: PdfOmrJobInput): Promise<void> {
    let terminalEvent: Extract<PdfOmrPipelineProgressEvent, { kind: "terminal" }> | undefined;
    let lastSequence = -1;
    try {
      const result = await this.runtime.run({
        inputPath: input.inputPath,
        outputDirectory: input.outputDirectory,
        engineId: input.engineId,
        onProgress: (event) => {
          lastSequence = Math.max(lastSequence, event.sequence);
          if (event.kind === "terminal") terminalEvent = event;
          this.onProgress(jobId, event);
        },
      });
      if (this.snapshot?.jobId !== jobId) return;
      this.snapshot = {
        ...this.snapshot,
        status: "succeeded",
        input: {
          fileName: input.fileName,
          sizeBytes: input.sizeBytes,
          inputKind: input.inputKind,
          pageCount: result.input.pageCount,
        },
        engine: {
          id: result.engine.id,
          version: result.engine.version,
          ...(result.engine.modelSha256 === undefined ? {} : { modelSha256: result.engine.modelSha256 }),
        },
      };
      this.completed = { jobId, outputDirectory: input.outputDirectory, result };
      this.publish();
    } catch (error) {
      if (this.snapshot?.jobId !== jobId) return;
      const code = error instanceof PdfOmrError ? error.code : "ENGINE_EXECUTION_FAILED";
      if (
        terminalEvent === undefined ||
        terminalEvent.status === "succeeded" ||
        (terminalEvent.status === "failed" && terminalEvent.errorCode === undefined)
      ) {
        this.onProgress(jobId, {
          schemaVersion: "1.0.0",
          sequence: lastSequence + 1,
          kind: "terminal",
          status: code === "INTERRUPTED" ? "cancelled" : "failed",
          ...(code === "INTERRUPTED" ? {} : { errorCode: code }),
        });
      }
    } finally {
      if (this.active?.jobId === jobId) this.active = undefined;
    }
  }

  private onProgress(jobId: string, event: PdfOmrPipelineProgressEvent): void {
    if (this.snapshot?.jobId !== jobId) return;
    for (const listener of this.progressListeners) listener(jobId, event);
    if (event.kind === "stage") {
      this.snapshot = { ...this.snapshot, stage: event.stage };
    } else if (event.kind === "engine-progress") {
      this.snapshot = {
        ...this.snapshot,
        progress: { unit: event.unit, completed: event.completed, total: event.total },
      };
    } else if (event.status === "cancelled") {
      this.snapshot = { ...this.snapshot, status: "cancelled" };
    } else if (event.status === "failed") {
      this.snapshot = {
        ...this.snapshot,
        status: "failed",
        ...(event.errorCode === undefined
          ? {}
          : { error: { code: event.errorCode, recoverable: event.errorCode !== "ENGINE_UNAVAILABLE" } }),
      };
    }
    this.publish();
  }

  private publish(): void {
    if (this.snapshot === undefined) return;
    for (const listener of this.listeners) listener(this.snapshot);
  }
}
