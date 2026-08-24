import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RecognitionJobStore } from "../job-store";

const firstCreatedAt = "2026-08-16T00:00:00.000Z";
const secondCreatedAt = "2026-08-16T00:00:01.000Z";
const thirdCreatedAt = "2026-08-16T00:00:02.000Z";

describe("RecognitionJobStore", () => {
  it("keeps an upload internal until its object is durable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zupulse-recognition-store-"));
    const store = new RecognitionJobStore(join(directory, "recognition.sqlite"));
    const input = job("job-1", "attempt-1", firstCreatedAt);

    store.beginUpload(input);
    expect(store.getSnapshot("job-1")).toBeUndefined();
    expect(store.listPendingUploads()).toEqual([
      { jobId: "job-1", inputObjectKey: "jobs/job-1/input.pdf", createdAt: firstCreatedAt },
    ]);
    expect(store.queueUploaded(input.jobId, input.attemptId, input.engineId, firstCreatedAt).status).toBe("queued");
    expect(store.listPendingUploads()).toEqual([]);
    store.close();
  });

  it("claims queued attempts in stable FIFO order", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zupulse-recognition-store-"));
    const store = new RecognitionJobStore(join(directory, "recognition.sqlite"));
    store.createJob(job("job-2", "attempt-2", secondCreatedAt));
    store.createJob(job("job-1", "attempt-1", firstCreatedAt));

    expect(store.claimNext(secondCreatedAt)?.jobId).toBe("job-1");
    expect(store.claimNext(secondCreatedAt)?.jobId).toBe("job-2");
    expect(store.claimNext(secondCreatedAt)).toBeUndefined();
    store.close();
  });

  it("paginates history with an opaque stable cursor", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zupulse-recognition-store-"));
    const store = new RecognitionJobStore(join(directory, "recognition.sqlite"));
    store.createJob(job("job-1", "attempt-1", firstCreatedAt));
    store.createJob(job("job-2", "attempt-2", secondCreatedAt));

    const first = store.list(1);
    expect(first.items.map((item) => item.jobId)).toEqual(["job-2"]);
    expect(first.nextCursor).toBeTruthy();
    expect(store.list(1, first.nextCursor).items.map((item) => item.jobId)).toEqual(["job-1"]);
    store.close();
  });

  it("keeps older jobs traversable when their status changes during pagination", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zupulse-recognition-store-"));
    const store = new RecognitionJobStore(join(directory, "recognition.sqlite"));
    store.createJob(job("job-1", "attempt-1", firstCreatedAt));
    store.createJob(job("job-2", "attempt-2", secondCreatedAt));
    store.createJob(job("job-3", "attempt-3", thirdCreatedAt));

    const first = store.list(1);
    expect(first.items.map((item) => item.jobId)).toEqual(["job-3"]);
    store.cancel("job-1", "2026-08-16T00:00:03.000Z");

    const second = store.list(1, first.nextCursor);
    expect(second.nextCursor).toBeTruthy();
    const third = store.list(1, second.nextCursor);
    expect([...second.items, ...third.items].map((item) => item.jobId)).toEqual(["job-2", "job-1"]);
    store.close();
  });

  it("marks abandoned active attempts interrupted on reopen while preserving queued work", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zupulse-recognition-store-"));
    const path = join(directory, "recognition.sqlite");
    const first = new RecognitionJobStore(path);
    first.createJob(job("job-running", "attempt-running", firstCreatedAt));
    first.createJob(job("job-queued", "attempt-queued", secondCreatedAt));
    first.claimNext(secondCreatedAt);
    first.close();

    const reopened = new RecognitionJobStore(path);
    expect(reopened.getSnapshot("job-running")?.status).toBe("interrupted");
    expect(reopened.getSnapshot("job-queued")?.status).toBe("queued");
    expect(reopened.claimNext(secondCreatedAt)?.jobId).toBe("job-queued");
    reopened.close();
  });

  it("retries terminal work as a new attempt without replacing history", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zupulse-recognition-store-"));
    const store = new RecognitionJobStore(join(directory, "recognition.sqlite"));
    store.createJob(job("job-1", "attempt-1", firstCreatedAt));
    store.claimNext(firstCreatedAt);
    store.fail("attempt-1", "ENGINE_EXECUTION_FAILED", secondCreatedAt);

    const retried = store.retry("job-1", "attempt-2", "audiveris", secondCreatedAt);

    expect(retried).toMatchObject({ attemptId: "attempt-2", attemptNumber: 2, status: "queued" });
    expect(store.getDetail("job-1")?.attempts.map((attempt) => attempt.status)).toEqual(["failed", "queued"]);
    store.close();
  });

  it("keeps deletion visible until object cleanup completes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zupulse-recognition-store-"));
    const store = new RecognitionJobStore(join(directory, "recognition.sqlite"));
    store.createJob(job("job-1", "attempt-1", firstCreatedAt));
    store.cancel("job-1", secondCreatedAt);

    expect(store.beginDelete("job-1", secondCreatedAt).status).toBe("deleting");
    expect(store.getSnapshot("job-1")?.status).toBe("deleting");
    store.completeDelete("job-1");
    expect(store.getSnapshot("job-1")).toBeUndefined();
    store.close();
  });

  it("persists progress and publishes only stored result metadata", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zupulse-recognition-store-"));
    const store = new RecognitionJobStore(join(directory, "recognition.sqlite"));
    store.createJob(job("job-1", "attempt-1", firstCreatedAt));
    store.claimNext(firstCreatedAt);
    store.applyProgress("attempt-1", {
      schemaVersion: "1.0.0",
      sequence: 0,
      kind: "stage",
      stage: "recognize",
      status: "started",
    });
    store.succeed("attempt-1", {
      finishedAt: secondCreatedAt,
      engine: { id: "rokot", version: "1.0.0", modelSha256: "b".repeat(64) },
      pageCount: 3,
      resultObjectKey: "jobs/job-1/result.mxl",
      manifestObjectKey: "jobs/job-1/result.json",
      outputSha256: "c".repeat(64),
      resultSizeBytes: 84,
      result: {
        fileName: "score.mxl",
        outputSha256: "c".repeat(64),
        validation: { readiness: { harmony: "ready", musicXml: "ready" }, diagnostics: [] },
      },
    });

    expect(store.getSnapshot("job-1")).toMatchObject({
      status: "succeeded",
      stage: "recognize",
      input: { pageCount: 3 },
      engine: { id: "rokot", version: "1.0.0" },
    });
    expect(store.getResult("job-1")).toEqual({
      resultObjectKey: "jobs/job-1/result.mxl",
      manifestObjectKey: "jobs/job-1/result.json",
      outputSha256: "c".repeat(64),
      sizeBytes: 84,
    });
    expect(store.getDetail("job-1")?.result).toMatchObject({ fileName: "score.mxl" });
    store.close();
  });
});

function job(jobId: string, attemptId: string, createdAt: string) {
  return {
    jobId,
    attemptId,
    engineId: "rokot",
    input: { fileName: `${jobId}.pdf`, sizeBytes: 42, inputKind: "pdf" as const },
    inputObjectKey: `jobs/${jobId}/input.pdf`,
    inputSha256: "a".repeat(64),
    createdAt,
    expiresAt: "2026-09-15T00:00:00.000Z",
  };
}
