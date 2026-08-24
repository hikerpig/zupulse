import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PdfOmrPipelineRequest, PdfOmrPipelineResult } from "@zupulse/pdf-omr-cli/pipeline";
import { describe, expect, it } from "vitest";
import { RecognitionJobStore } from "../job-store";
import { RecognitionWorker, type RecognitionObjectStore } from "../recognition-worker";
import { PdfOmrError } from "@zupulse/pdf-omr-cli/pipeline";

const createdAt = "2026-08-16T00:00:00.000Z";

describe("RecognitionWorker", () => {
  it("publishes success only after result objects are stored", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zupulse-recognition-worker-"));
    const store = new RecognitionJobStore(join(directory, "recognition.sqlite"));
    store.createJob(job());
    const objects = new FakeObjectStore();
    const worker = new RecognitionWorker({
      store,
      objects,
      tempRoot: join(directory, "runs"),
      now: () => new Date("2026-08-16T00:00:01.000Z"),
      runPipeline: successfulPipeline,
    });

    expect(await worker.runNext()).toBe(true);
    expect(objects.storedKeys).toEqual(["jobs/job-1/result.mxl", "jobs/job-1/result.json"]);
    expect(store.getSnapshot("job-1")?.status).toBe("succeeded");
    store.close();
  });

  it("fails the attempt when durable result publication fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zupulse-recognition-worker-"));
    const store = new RecognitionJobStore(join(directory, "recognition.sqlite"));
    store.createJob(job());
    const objects = new FakeObjectStore();
    objects.failPut = true;
    const worker = new RecognitionWorker({
      store,
      objects,
      tempRoot: join(directory, "runs"),
      now: () => new Date("2026-08-16T00:00:01.000Z"),
      runPipeline: successfulPipeline,
    });

    expect(await worker.runNext()).toBe(true);
    expect(store.getSnapshot("job-1")).toMatchObject({
      status: "failed",
      error: { code: "RESULT_PERSIST_FAILED" },
    });
    store.close();
  });

  it("materializes JPEG uploads with a JPEG extension", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zupulse-recognition-worker-"));
    const store = new RecognitionJobStore(join(directory, "recognition.sqlite"));
    store.createJob(job("photo.jpeg", "image"));
    const worker = new RecognitionWorker({
      store,
      objects: new FakeObjectStore(),
      tempRoot: join(directory, "runs"),
      runPipeline: async (request) => {
        expect(request.inputPath).toMatch(/input\.jpg$/);
        return successfulPipeline(request);
      },
    });

    expect(await worker.runNext()).toBe(true);
    store.close();
  });

  it("aborts a running pipeline and records cancellation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zupulse-recognition-worker-"));
    const store = new RecognitionJobStore(join(directory, "recognition.sqlite"));
    store.createJob(job());
    let started!: () => void;
    const didStart = new Promise<void>((resolve) => (started = resolve));
    const worker = new RecognitionWorker({
      store,
      objects: new FakeObjectStore(),
      tempRoot: join(directory, "runs"),
      runPipeline: (request) =>
        new Promise((_, reject) => {
          started();
          request.signal?.addEventListener("abort", () => reject(new PdfOmrError("INTERRUPTED", "cancelled")), {
            once: true,
          });
        }),
    });

    const running = worker.runNext();
    await didStart;
    store.requestCancellation("job-1", "2026-08-16T00:00:01.000Z");
    expect(worker.cancel("job-1")).toBe(true);
    await running;
    expect(store.getSnapshot("job-1")?.status).toBe("cancelled");
    store.close();
  });
});

class FakeObjectStore implements RecognitionObjectStore {
  storedKeys: string[] = [];
  failPut = false;

  async materialize(_key: string, path: string): Promise<void> {
    await writeFile(path, "%PDF-1.7");
  }

  async putFile(key: string): Promise<{ sizeBytes: number }> {
    if (this.failPut) throw new Error("store failed");
    this.storedKeys.push(key);
    return { sizeBytes: 3 };
  }

  async putBytes(key: string): Promise<void> {
    if (this.failPut) throw new Error("store failed");
    this.storedKeys.push(key);
  }

  async delete(): Promise<void> {}
}

async function successfulPipeline(request: PdfOmrPipelineRequest): Promise<PdfOmrPipelineResult> {
  await mkdir(request.outputDirectory, { recursive: true });
  await writeFile(join(request.outputDirectory, "score.mxl"), "mxl");
  await writeFile(join(request.outputDirectory, "validation.json"), JSON.stringify({ diagnostics: [] }));
  request.onProgress?.({
    schemaVersion: "1.0.0",
    sequence: 0,
    kind: "stage",
    stage: "recognize",
    status: "started",
  });
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
    engine: { id: "rokot", version: "1.0.0" },
    validation: {
      readiness: { harmony: "ready", musicXml: "ready" },
      outputSha256: createHash("sha256").update("mxl").digest("hex"),
    },
    outputSha256: createHash("sha256").update("mxl").digest("hex"),
    artifacts: {
      inspect: "inspect/input.json",
      recognitionDirectory: "recognition",
      validation: "validation.json",
      musicXml: "score.mxl",
      roundTrip: "round-trip.json",
    },
  };
}

function job(fileName = "score.pdf", inputKind: "pdf" | "image" = "pdf") {
  const extension = inputKind === "pdf" ? "pdf" : fileName.toLowerCase().endsWith(".png") ? "png" : "jpg";
  return {
    jobId: "job-1",
    attemptId: "attempt-1",
    engineId: "rokot",
    input: { fileName, sizeBytes: 42, inputKind },
    inputObjectKey: `jobs/job-1/input.${extension}`,
    inputSha256: "a".repeat(64),
    createdAt,
    expiresAt: "2026-09-15T00:00:00.000Z",
  };
}
