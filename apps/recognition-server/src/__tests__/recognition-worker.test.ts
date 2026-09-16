import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PdfOmrPipelineRequest, PdfOmrPipelineResult } from "@zupulse/pdf-omr-cli/pipeline";
import { describe, expect, it } from "vitest";
import { RecognitionJobStore } from "../job-store";
import { RecognitionWorker, type RecognitionObjectStore } from "../recognition-worker";
import { PdfOmrError } from "@zupulse/pdf-omr-cli/pipeline";
import { reconcileRecognitionStorage } from "../maintenance";
import { RecognitionService } from "../recognition-service";

const createdAt = "2026-08-16T00:00:00.000Z";

describe("RecognitionWorker", () => {
  it.each(["success", "manual-delete", "corrupt-evidence", "manifest-failure", "readback-failure"])(
    "retains correction evidence with the result lifecycle: %s",
    async (kind) => {
      const directory = await mkdtemp(join(tmpdir(), "zupulse-recognition-evidence-"));
      const store = new RecognitionJobStore(join(directory, "recognition.sqlite"));
      store.createJob({ ...job(), engineId: "legato" });
      const objects = new FakeObjectStore();
      objects.failManifest = kind === "manifest-failure";
      objects.corruptManifest = kind === "readback-failure";
      const tempRoot = join(directory, "runs");
      const worker = new RecognitionWorker({
        store,
        objects,
        tempRoot,
        runPipeline: async (request) => {
          const result = await successfulPipeline(request);
          const root = join(request.outputDirectory, "recognition");
          const artifactSha256: Record<string, string> = {};
          for (const name of [
            "raw-draft.json",
            "draft.json",
            "pitch-correction/report.json",
            "pitch-correction/source.json",
            "engine/converted.musicxml",
          ]) {
            await mkdir(join(root, name, ".."), { recursive: true });
            const content = `private evidence ${name}`;
            await writeFile(join(root, name), content);
            artifactSha256[name] = createHash("sha256").update(content).digest("hex");
          }
          await writeFile(
            join(root, "run.json"),
            JSON.stringify({
              schemaVersion: "1.0.0",
              runId: "run",
              inputSha256: result.input.inputSha256,
              engine: { id: "legato", version: "test" },
              parameters: { pitchCorrection: "legato-source-pitch-shadow-v2" },
              preprocess: { id: "none", version: "1.0.0" },
              startedAt: createdAt,
              completedAt: createdAt,
              status: "succeeded",
              artifactSha256,
            }),
          );
          if (kind === "corrupt-evidence") await writeFile(join(root, "raw-draft.json"), "tampered");
          return { ...result, engine: { id: "legato", version: "test" } };
        },
      });
      try {
        await worker.runNext();
        expect(await readdir(tempRoot)).toEqual([]);
        const snapshot = store.getSnapshot("job-1");
        expect(JSON.stringify(snapshot)).not.toContain("sourcePitchEvidence");
        if (kind === "success" || kind === "manual-delete") {
          expect(snapshot?.status).toBe("succeeded");
          const manifest = JSON.parse(Buffer.from(objects.bytes.get("jobs/job-1/result.json")!).toString());
          const original = manifest.sourcePitchEvidence.files.find(
            (f: { name: string }) => f.name === "raw-draft.json",
          );
          expect(Buffer.from(original.base64, "base64").toString()).toBe("private evidence raw-draft.json");
          expect(manifest.sourcePitchEvidence.files).toHaveLength(6);
          if (kind === "manual-delete") await new RecognitionService({ store, objects, engines: [] }).delete("job-1");
          else await reconcileRecognitionStorage({ store, objects, now: () => new Date("2026-09-16T00:00:00.000Z") });
          expect(store.getSnapshot("job-1")).toBeUndefined();
          expect(objects.bytes.size).toBe(0);
        } else {
          expect(snapshot).toMatchObject({ status: "failed", error: { code: "RESULT_PERSIST_FAILED" } });
          expect(objects.bytes.size).toBe(0);
        }
      } finally {
        store.close();
      }
    },
  );

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
  failManifest = false;
  corruptManifest = false;
  bytes = new Map<string, Uint8Array>();

  async materialize(key: string, path: string, expectedSha256: string): Promise<void> {
    await writeFile(path, this.bytes.has(key) ? await this.getBytes(key, expectedSha256) : "%PDF-1.7");
  }

  async putFile(key: string, path: string): Promise<{ sizeBytes: number }> {
    if (this.failPut) throw new Error("store failed");
    this.storedKeys.push(key);
    this.bytes.set(key, await readFile(path));
    return { sizeBytes: 3 };
  }

  async putBytes(key: string, bytes: Uint8Array): Promise<void> {
    if (this.failPut || this.failManifest) throw new Error("store failed");
    this.storedKeys.push(key);
    this.bytes.set(key, this.corruptManifest ? Buffer.from("corrupt") : bytes);
  }

  async getBytes(key: string, expectedSha256: string): Promise<Uint8Array> {
    const bytes = this.bytes.get(key)!;
    if (createHash("sha256").update(bytes).digest("hex") !== expectedSha256) throw new Error("hash mismatch");
    return bytes;
  }

  async delete(keys: readonly string[]): Promise<void> {
    for (const key of keys) this.bytes.delete(key);
  }
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
