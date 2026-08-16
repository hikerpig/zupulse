import { describe, expect, it } from "vitest";
import {
  recognitionApiCapabilitiesSchema,
  recognitionApiErrorSchema,
  recognitionHistoryPageSchema,
  recognitionJobDetailSchema,
  recognitionJobSnapshotSchema,
  recognitionSseEventSchema,
} from "../schemas";

const input = {
  fileName: "score.pdf",
  sizeBytes: 42,
  inputKind: "pdf" as const,
};

describe("recognition schemas", () => {
  it("accepts Desktop and Remote job states without transport fields", () => {
    expect(
      recognitionJobSnapshotSchema.parse({
        jobId: "job-1",
        attemptId: "attempt-1",
        attemptNumber: 1,
        status: "queued",
        input,
      }),
    ).toMatchObject({ status: "queued" });
    expect(recognitionJobSnapshotSchema.parse({ jobId: "job-2", status: "running", input })).toMatchObject({
      status: "running",
    });
    expect(recognitionJobSnapshotSchema.parse({ jobId: "job-3", status: "interrupted", input })).toMatchObject({
      status: "interrupted",
    });
  });

  it("rejects unsafe fields from job snapshots", () => {
    expect(() =>
      recognitionJobSnapshotSchema.parse({
        jobId: "job-1",
        status: "failed",
        input,
        error: { code: "ENGINE_EXECUTION_FAILED", recoverable: true, path: "/private/score.pdf" },
      }),
    ).toThrow();
  });

  it("defines strict capabilities, history and detail payloads", () => {
    expect(
      recognitionApiCapabilitiesSchema.parse({
        schemaVersion: "1.0.0",
        engines: [{ id: "rokot", version: "1.0.0", available: true, inputKinds: ["pdf"] }],
      }).engines,
    ).toHaveLength(1);
    expect(
      recognitionHistoryPageSchema.parse({
        items: [
          {
            jobId: "job-1",
            status: "queued",
            input,
            attemptCount: 1,
            createdAt: "2026-08-16T00:00:00.000Z",
            updatedAt: "2026-08-16T00:00:00.000Z",
            expiresAt: "2026-09-15T00:00:00.000Z",
          },
        ],
        nextCursor: "cursor-1",
      }).items[0]?.attemptCount,
    ).toBe(1);
    expect(
      recognitionJobDetailSchema.parse({
        snapshot: {
          jobId: "job-1",
          attemptId: "attempt-1",
          attemptNumber: 1,
          status: "queued",
          input,
        },
        attempts: [
          {
            attemptId: "attempt-1",
            attemptNumber: 1,
            status: "queued",
            engineId: "rokot",
            createdAt: "2026-08-16T00:00:00.000Z",
          },
        ],
        result: {
          fileName: "score.mxl",
          outputSha256: "a".repeat(64),
          validation: { readiness: { harmony: "ready", musicXml: "ready" }, diagnostics: [] },
        },
      }).attempts,
    ).toHaveLength(1);
  });

  it("uses a full snapshot as the SSE recovery event", () => {
    expect(
      recognitionSseEventSchema.parse({
        kind: "snapshot",
        snapshot: {
          jobId: "job-1",
          attemptId: "attempt-1",
          attemptNumber: 1,
          status: "running",
          input,
        },
      }).kind,
    ).toBe("snapshot");
  });

  it("bounds API errors to semantic fields", () => {
    expect(recognitionApiErrorSchema.parse({ error: { code: "JOB_NOT_FOUND", recoverable: false } }).error.code).toBe(
      "JOB_NOT_FOUND",
    );
    expect(() =>
      recognitionApiErrorSchema.parse({
        error: { code: "STORAGE_UNAVAILABLE", recoverable: true, stack: "secret" },
      }),
    ).toThrow();
  });
});
