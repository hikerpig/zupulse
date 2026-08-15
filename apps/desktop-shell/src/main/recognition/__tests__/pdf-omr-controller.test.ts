import { describe, expect, it } from "vitest";
import { PdfOmrError } from "@zupulse/pdf-omr-cli/pipeline";
import type {
  PdfOmrPipelineProgressEvent,
  PdfOmrPipelineRequest,
  PdfOmrPipelineResult,
} from "@zupulse/pdf-omr-cli/pipeline";
import { PdfOmrJobController, type PdfOmrRuntimePort } from "../pdf-omr-controller";

describe("PdfOmrJobController", () => {
  it("projects pipeline progress into a safe running and succeeded snapshot", async () => {
    const runtime = new FakeRuntime();
    const controller = new PdfOmrJobController(runtime);
    const snapshots: unknown[] = [];
    controller.subscribe((snapshot) => snapshots.push(snapshot));

    const started = controller.start({
      inputPath: "/private/score.pdf",
      fileName: "score.pdf",
      sizeBytes: 42,
      inputKind: "pdf",
      engineId: "fake",
      outputDirectory: "/private/run",
    });
    expect(started.status).toBe("running");
    expect(JSON.stringify(started)).not.toContain("/private/");

    await controller.waitForIdle();

    expect(controller.getSnapshot()).toMatchObject({
      status: "succeeded",
      input: { fileName: "score.pdf", sizeBytes: 42, inputKind: "pdf", pageCount: 1 },
      engine: { id: "fake", version: "1.0.0" },
    });
    expect(snapshots.some((snapshot) => JSON.stringify(snapshot).includes("/private/"))).toBe(false);
  });

  it("transitions through cancelling to cancelled and rejects concurrent jobs", async () => {
    const runtime = new FakeRuntime();
    runtime.pending = true;
    const controller = new PdfOmrJobController(runtime);
    const started = controller.start({
      inputPath: "/private/score.pdf",
      fileName: "score.pdf",
      sizeBytes: 42,
      inputKind: "pdf",
      engineId: "fake",
      outputDirectory: "/private/run",
    });

    expect(() =>
      controller.start({
        inputPath: "/private/other.pdf",
        fileName: "other.pdf",
        sizeBytes: 10,
        inputKind: "pdf",
        engineId: "fake",
        outputDirectory: "/private/other-run",
      }),
    ).toThrowError(PdfOmrError);
    controller.cancel(started.jobId);
    expect(controller.getSnapshot()?.status).toBe("cancelling");
    runtime.release(new PdfOmrError("INTERRUPTED", "cancelled"));
    await controller.waitForIdle();
    expect(controller.getSnapshot()).toMatchObject({ status: "cancelled" });
  });

  it("retries a failed job from Main-owned input without consuming the PDF token again", async () => {
    const calls: string[] = [];
    const runtime: PdfOmrRuntimePort = {
      async run(request) {
        calls.push(request.inputPath);
        if (calls.length === 1) throw new PdfOmrError("DRAFT_VALIDATION_FAILED", "retryable failure");
        return result();
      },
      cancel() {},
    };
    const controller = new PdfOmrJobController(runtime);

    const first = controller.start({
      inputPath: "/private/score.pdf",
      fileName: "score.pdf",
      sizeBytes: 42,
      inputKind: "pdf",
      engineId: "fake",
      outputDirectory: "/private/first-run",
    });
    await controller.waitForIdle();
    expect(controller.getSnapshot()).toMatchObject({ jobId: first.jobId, status: "failed" });

    const retried = controller.retry(first.jobId, "fake", "/private/retry-run");
    expect(retried.status).toBe("running");
    await controller.waitForIdle();

    expect(calls).toEqual(["/private/score.pdf", "/private/score.pdf"]);
    expect(controller.getSnapshot()).toMatchObject({ status: "succeeded" });
  });

  it("emits a terminal failed event when the runtime fails before reporting one", async () => {
    const events: PdfOmrPipelineProgressEvent[] = [];
    const controller = new PdfOmrJobController({
      async run() {
        throw new PdfOmrError("ENGINE_UNAVAILABLE", "engine is unavailable");
      },
      cancel() {},
    });
    controller.subscribeProgress((_jobId, event) => events.push(event));

    const started = controller.start({
      inputPath: "/private/score.pdf",
      fileName: "score.pdf",
      sizeBytes: 42,
      inputKind: "pdf",
      engineId: "audiveris",
      outputDirectory: "/private/run",
    });
    await controller.waitForIdle();

    expect(events.at(-1)).toMatchObject({
      kind: "terminal",
      status: "failed",
      errorCode: "ENGINE_UNAVAILABLE",
    });
    expect(controller.getSnapshot()).toMatchObject({
      jobId: started.jobId,
      status: "failed",
      error: { code: "ENGINE_UNAVAILABLE", recoverable: false },
    });
  });

  it("adds a safe execution error when a runtime terminal event has no error code", async () => {
    const events: PdfOmrPipelineProgressEvent[] = [];
    const controller = new PdfOmrJobController({
      async run(request) {
        request.onProgress?.({ schemaVersion: "1.0.0", sequence: 0, kind: "terminal", status: "failed" });
        throw new Error("raw engine failure");
      },
      cancel() {},
    });
    controller.subscribeProgress((_jobId, event) => events.push(event));

    controller.start({
      inputPath: "/private/score.pdf",
      fileName: "score.pdf",
      sizeBytes: 42,
      inputKind: "pdf",
      engineId: "audiveris",
      outputDirectory: "/private/run",
    });
    await controller.waitForIdle();

    expect(events.at(-1)).toMatchObject({
      kind: "terminal",
      status: "failed",
      errorCode: "ENGINE_EXECUTION_FAILED",
    });
    expect(controller.getSnapshot()).toMatchObject({
      status: "failed",
      error: { code: "ENGINE_EXECUTION_FAILED" },
    });
  });
});

class FakeRuntime implements PdfOmrRuntimePort {
  pending = false;
  private releasePending: ((error?: PdfOmrError) => void) | undefined;

  async run(request: Omit<PdfOmrPipelineRequest, "signal" | "standardFontDirectory">) {
    request.onProgress?.({ schemaVersion: "1.0.0", sequence: 0, kind: "stage", stage: "inspect", status: "started" });
    request.onProgress?.({ schemaVersion: "1.0.0", sequence: 1, kind: "stage", stage: "inspect", status: "completed" });
    if (this.pending) {
      await new Promise<void>((resolve, reject) => {
        this.releasePending = (error) => (error === undefined ? resolve() : reject(error));
      });
    }
    request.onProgress?.({ schemaVersion: "1.0.0", sequence: 2, kind: "terminal", status: "succeeded" });
    return result();
  }

  cancel(): void {
    this.release(new PdfOmrError("INTERRUPTED", "cancelled"));
  }

  release(error?: PdfOmrError): void {
    this.releasePending?.(error);
    this.releasePending = undefined;
  }
}

function result(): PdfOmrPipelineResult {
  return {
    schemaVersion: "1.0.0",
    status: "succeeded",
    input: {
      fileName: "score.pdf",
      inputSha256: "a".repeat(64),
      sizeBytes: 42,
      pageCount: 1,
      inputKind: "pdf",
    },
    engine: { id: "fake", version: "1.0.0" },
    validation: { readiness: { harmony: "ready", musicXml: "ready" }, outputSha256: "b".repeat(64) },
    outputSha256: "c".repeat(64),
    artifacts: {
      inspect: "inspect/input.json",
      recognitionDirectory: "recognition",
      validation: "validation.json",
      musicXml: "score.mxl",
      roundTrip: "round-trip.json",
    },
  };
}
