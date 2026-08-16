import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RecognitionJobStore } from "../job-store";
import { reconcileRecognitionStorage } from "../maintenance";

describe("reconcileRecognitionStorage", () => {
  it("removes incomplete uploads and expired jobs from objects and SQLite", async () => {
    const directory = await mkdtemp(join(tmpdir(), "zupulse-recognition-maintenance-"));
    const store = new RecognitionJobStore(join(directory, "recognition.sqlite"));
    store.beginUpload(job("uploading", "2026-09-15T00:00:00.000Z"));
    store.createJob(job("expired", "2026-08-15T00:00:00.000Z"));
    store.cancel("expired", "2026-08-15T00:01:00.000Z");
    const deleted: string[][] = [];
    const objects = {
      async putFile() {
        return { sizeBytes: 0 };
      },
      async putBytes() {},
      async materialize() {},
      async getBytes() {
        return new Uint8Array();
      },
      async delete(keys: readonly string[]) {
        deleted.push([...keys]);
      },
    };

    await reconcileRecognitionStorage({ store, objects, now: () => new Date("2026-08-16T00:00:00.000Z") });

    expect(deleted).toEqual([["jobs/uploading/input.pdf"], ["jobs/expired/input.pdf"]]);
    expect(store.list().items).toEqual([]);
    expect(store.listPendingUploads()).toEqual([]);
    store.close();
  });
});

function job(jobId: string, expiresAt: string) {
  return {
    jobId,
    attemptId: `${jobId}-attempt`,
    engineId: "audiveris",
    input: { fileName: "score.pdf", sizeBytes: 42, inputKind: "pdf" as const },
    inputObjectKey: `jobs/${jobId}/input.pdf`,
    inputSha256: "a".repeat(64),
    createdAt: "2026-08-01T00:00:00.000Z",
    expiresAt,
  };
}
