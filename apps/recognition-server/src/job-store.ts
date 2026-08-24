import { createRequire } from "node:module";
import {
  recognitionHistoryPageSchema,
  recognitionJobDetailSchema,
  recognitionJobSnapshotSchema,
  type RecognitionJobDetail,
  type RecognitionHistoryPage,
  type RecognitionJobSnapshot,
  type RecognitionProgressEvent,
} from "@zupulse/web-core";

type Database = {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...parameters: unknown[]): unknown;
    all(...parameters: unknown[]): unknown[];
    run(...parameters: unknown[]): { changes: number | bigint };
  };
  close(): void;
};

type JobRow = {
  id: string;
  file_name: string;
  size_bytes: number;
  input_kind: "pdf" | "image";
  input_object_key: string;
  input_sha256: string;
  page_count: number | null;
  status: RecognitionJobSnapshot["status"] | "uploading";
  current_attempt_id: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

type AttemptRow = {
  id: string;
  job_id: string;
  attempt_number: number;
  engine_id: string;
  engine_version: string | null;
  model_sha256: string | null;
  status: Exclude<RecognitionJobSnapshot["status"], "deleting">;
  stage: RecognitionJobSnapshot["stage"] | null;
  progress_unit: "page" | "system" | null;
  progress_completed: number | null;
  progress_total: number | null;
  error_code: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  result_object_key: string | null;
  manifest_object_key: string | null;
  output_sha256: string | null;
  result_size_bytes: number | null;
  result_metadata_json: string | null;
};

export type CreateRecognitionJob = {
  jobId: string;
  attemptId: string;
  engineId: string;
  input: { fileName: string; sizeBytes: number; inputKind: "pdf" | "image" };
  inputObjectKey: string;
  inputSha256: string;
  createdAt: string;
  expiresAt: string;
};

export type ClaimedRecognitionAttempt = RecognitionJobSnapshot & {
  engineId: string;
  inputObjectKey: string;
  inputSha256: string;
};

export class RecognitionJobStore {
  private readonly database: Database;

  constructor(path: string) {
    this.database = openDatabase(path);
    migrate(this.database);
    this.interruptAbandonedAttempts(new Date().toISOString());
  }

  close(): void {
    this.database.close();
  }

  createJob(input: CreateRecognitionJob): RecognitionJobSnapshot {
    this.beginUpload(input);
    return this.queueUploaded(input.jobId, input.attemptId, input.engineId, input.createdAt);
  }

  beginUpload(input: CreateRecognitionJob): void {
    this.database
      .prepare(
        `INSERT INTO recognition_jobs
          (id, file_name, size_bytes, input_kind, input_object_key, input_sha256, status,
           current_attempt_id, created_at, updated_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, 'uploading', NULL, ?, ?, ?)`,
      )
      .run(
        input.jobId,
        input.input.fileName,
        input.input.sizeBytes,
        input.input.inputKind,
        input.inputObjectKey,
        input.inputSha256,
        input.createdAt,
        input.createdAt,
        input.expiresAt,
      );
  }

  queueUploaded(jobId: string, attemptId: string, engineId: string, createdAt: string): RecognitionJobSnapshot {
    const job = this.getJob(jobId);
    if (job?.status !== "uploading") throw new RecognitionStoreError("JOB_NOT_FOUND");
    transaction(this.database, () => {
      this.database
        .prepare(
          `INSERT INTO recognition_attempts
            (id, job_id, attempt_number, engine_id, status, created_at)
           VALUES (?, ?, 1, ?, 'queued', ?)`,
        )
        .run(attemptId, jobId, engineId, createdAt);
      this.database
        .prepare("UPDATE recognition_jobs SET status = 'queued', current_attempt_id = ?, updated_at = ? WHERE id = ?")
        .run(attemptId, createdAt, jobId);
    });
    return requiredSnapshot(this, jobId);
  }

  listPendingUploads(): readonly { jobId: string; inputObjectKey: string; createdAt: string }[] {
    return this.database
      .prepare(
        `SELECT id AS jobId, input_object_key AS inputObjectKey, created_at AS createdAt
           FROM recognition_jobs WHERE status = 'uploading' ORDER BY created_at, id`,
      )
      .all() as { jobId: string; inputObjectKey: string; createdAt: string }[];
  }

  listMaintenanceJobIds(now: string): readonly string[] {
    return (
      this.database
        .prepare(
          `SELECT id FROM recognition_jobs
            WHERE status = 'deleting'
               OR (status IN ('cancelled', 'failed', 'interrupted', 'succeeded') AND expires_at <= ?)
            ORDER BY expires_at, id`,
        )
        .all(now) as { id: string }[]
    ).map((row) => row.id);
  }

  markDeletingForMaintenance(jobId: string, updatedAt: string): void {
    this.database
      .prepare("UPDATE recognition_jobs SET status = 'deleting', updated_at = ? WHERE id = ?")
      .run(updatedAt, jobId);
  }

  discardPendingUpload(jobId: string): void {
    this.database.prepare("DELETE FROM recognition_jobs WHERE id = ? AND status = 'uploading'").run(jobId);
  }

  claimNext(startedAt: string): ClaimedRecognitionAttempt | undefined {
    let claimed: ClaimedRecognitionAttempt | undefined;
    transaction(this.database, () => {
      const row = this.database
        .prepare(
          `SELECT a.id AS attempt_id, a.job_id, a.attempt_number, a.engine_id,
                  j.file_name, j.size_bytes, j.input_kind, j.input_object_key, j.input_sha256,
                  j.created_at, j.expires_at
             FROM recognition_attempts a
             JOIN recognition_jobs j ON j.id = a.job_id
            WHERE a.status = 'queued' AND j.status = 'queued'
            ORDER BY a.created_at ASC, a.id ASC
            LIMIT 1`,
        )
        .get() as
        | {
            attempt_id: string;
            job_id: string;
            attempt_number: number;
            engine_id: string;
            file_name: string;
            size_bytes: number;
            input_kind: "pdf" | "image";
            input_object_key: string;
            input_sha256: string;
            created_at: string;
            expires_at: string;
          }
        | undefined;
      if (row === undefined) return;
      this.database
        .prepare("UPDATE recognition_attempts SET status = 'running', started_at = ? WHERE id = ?")
        .run(startedAt, row.attempt_id);
      this.database
        .prepare("UPDATE recognition_jobs SET status = 'running', updated_at = ? WHERE id = ?")
        .run(startedAt, row.job_id);
      claimed = {
        jobId: row.job_id,
        attemptId: row.attempt_id,
        attemptNumber: row.attempt_number,
        status: "running",
        input: { fileName: row.file_name, sizeBytes: row.size_bytes, inputKind: row.input_kind },
        createdAt: row.created_at,
        updatedAt: startedAt,
        expiresAt: row.expires_at,
        engineId: row.engine_id,
        inputObjectKey: row.input_object_key,
        inputSha256: row.input_sha256,
      };
    });
    return claimed;
  }

  fail(attemptId: string, errorCode: string, finishedAt: string): RecognitionJobSnapshot {
    const attempt = this.getAttempt(attemptId);
    if (attempt === undefined) throw new RecognitionStoreError("JOB_NOT_FOUND");
    transaction(this.database, () => {
      this.database
        .prepare("UPDATE recognition_attempts SET status = 'failed', error_code = ?, finished_at = ? WHERE id = ?")
        .run(errorCode, finishedAt, attemptId);
      this.database
        .prepare("UPDATE recognition_jobs SET status = 'failed', updated_at = ? WHERE id = ?")
        .run(finishedAt, attempt.job_id);
    });
    return requiredSnapshot(this, attempt.job_id);
  }

  applyProgress(attemptId: string, event: RecognitionProgressEvent): RecognitionJobSnapshot {
    const attempt = this.getAttempt(attemptId);
    if (attempt === undefined) throw new RecognitionStoreError("JOB_NOT_FOUND");
    if (attempt.status !== "running" && attempt.status !== "cancelling") {
      return requiredSnapshot(this, attempt.job_id);
    }
    if (event.kind === "stage") {
      this.database.prepare("UPDATE recognition_attempts SET stage = ? WHERE id = ?").run(event.stage, attemptId);
    } else if (event.kind === "engine-progress") {
      this.database
        .prepare(
          `UPDATE recognition_attempts
              SET stage = 'recognize', progress_unit = ?, progress_completed = ?, progress_total = ?
            WHERE id = ?`,
        )
        .run(event.unit, event.completed, event.total, attemptId);
    }
    return requiredSnapshot(this, attempt.job_id);
  }

  succeed(
    attemptId: string,
    input: {
      finishedAt: string;
      engine: { id: string; version: string; modelSha256?: string };
      pageCount: number;
      resultObjectKey: string;
      manifestObjectKey: string;
      outputSha256: string;
      resultSizeBytes: number;
      result: NonNullable<RecognitionJobDetail["result"]>;
    },
  ): RecognitionJobSnapshot {
    const attempt = this.getAttempt(attemptId);
    if (attempt === undefined) throw new RecognitionStoreError("JOB_NOT_FOUND");
    transaction(this.database, () => {
      this.database
        .prepare(
          `UPDATE recognition_attempts
              SET status = 'succeeded', engine_id = ?, engine_version = ?, model_sha256 = ?, finished_at = ?,
                  result_object_key = ?, manifest_object_key = ?, output_sha256 = ?, result_size_bytes = ?,
                  result_metadata_json = ?
            WHERE id = ?`,
        )
        .run(
          input.engine.id,
          input.engine.version,
          input.engine.modelSha256 ?? null,
          input.finishedAt,
          input.resultObjectKey,
          input.manifestObjectKey,
          input.outputSha256,
          input.resultSizeBytes,
          JSON.stringify(input.result),
          attemptId,
        );
      this.database
        .prepare("UPDATE recognition_jobs SET status = 'succeeded', page_count = ?, updated_at = ? WHERE id = ?")
        .run(input.pageCount, input.finishedAt, attempt.job_id);
    });
    return requiredSnapshot(this, attempt.job_id);
  }

  getResult(jobId: string):
    | {
        resultObjectKey: string;
        manifestObjectKey: string;
        outputSha256: string;
        sizeBytes: number;
      }
    | undefined {
    const job = this.getJob(jobId);
    if (job?.status !== "succeeded") return undefined;
    if (job.current_attempt_id === null) return undefined;
    const attempt = this.getAttempt(job.current_attempt_id);
    if (
      attempt === undefined ||
      attempt.result_object_key === null ||
      attempt.manifest_object_key === null ||
      attempt.output_sha256 === null ||
      attempt.result_size_bytes === null
    ) {
      return undefined;
    }
    return {
      resultObjectKey: attempt.result_object_key,
      manifestObjectKey: attempt.manifest_object_key,
      outputSha256: attempt.output_sha256,
      sizeBytes: attempt.result_size_bytes,
    };
  }

  cancel(jobId: string, finishedAt: string): RecognitionJobSnapshot {
    const job = this.getJob(jobId);
    if (job === undefined) throw new RecognitionStoreError("JOB_NOT_FOUND");
    if (job.current_attempt_id === null) throw new RecognitionStoreError("JOB_NOT_CANCELLABLE");
    const attempt = this.getAttempt(job.current_attempt_id);
    if (attempt?.status !== "queued") throw new RecognitionStoreError("JOB_NOT_CANCELLABLE");
    transaction(this.database, () => {
      this.database
        .prepare("UPDATE recognition_attempts SET status = 'cancelled', finished_at = ? WHERE id = ?")
        .run(finishedAt, attempt.id);
      this.database
        .prepare("UPDATE recognition_jobs SET status = 'cancelled', updated_at = ? WHERE id = ?")
        .run(finishedAt, jobId);
    });
    return requiredSnapshot(this, jobId);
  }

  requestCancellation(jobId: string, updatedAt: string): RecognitionJobSnapshot {
    const job = this.getJob(jobId);
    if (job === undefined || job.current_attempt_id === null) throw new RecognitionStoreError("JOB_NOT_FOUND");
    const attempt = this.getAttempt(job.current_attempt_id);
    if (attempt?.status !== "running") throw new RecognitionStoreError("JOB_NOT_CANCELLABLE");
    transaction(this.database, () => {
      this.database.prepare("UPDATE recognition_attempts SET status = 'cancelling' WHERE id = ?").run(attempt.id);
      this.database
        .prepare("UPDATE recognition_jobs SET status = 'cancelling', updated_at = ? WHERE id = ?")
        .run(updatedAt, jobId);
    });
    return requiredSnapshot(this, jobId);
  }

  finishCancellation(attemptId: string, finishedAt: string): RecognitionJobSnapshot {
    const attempt = this.getAttempt(attemptId);
    if (attempt === undefined) throw new RecognitionStoreError("JOB_NOT_FOUND");
    transaction(this.database, () => {
      this.database
        .prepare("UPDATE recognition_attempts SET status = 'cancelled', finished_at = ? WHERE id = ?")
        .run(finishedAt, attemptId);
      this.database
        .prepare("UPDATE recognition_jobs SET status = 'cancelled', updated_at = ? WHERE id = ?")
        .run(finishedAt, attempt.job_id);
    });
    return requiredSnapshot(this, attempt.job_id);
  }

  retry(jobId: string, attemptId: string, engineId: string, createdAt: string): RecognitionJobSnapshot {
    const job = this.getJob(jobId);
    if (job === undefined) throw new RecognitionStoreError("JOB_NOT_FOUND");
    if (!(["failed", "cancelled", "interrupted"] as const).includes(job.status as never)) {
      throw new RecognitionStoreError(job.status === "deleting" ? "JOB_DELETING" : "JOB_NOT_RETRYABLE");
    }
    const nextAttemptNumber =
      ((
        this.database
          .prepare("SELECT MAX(attempt_number) AS value FROM recognition_attempts WHERE job_id = ?")
          .get(jobId) as { value: number }
      ).value ?? 0) + 1;
    transaction(this.database, () => {
      this.database
        .prepare(
          `INSERT INTO recognition_attempts
            (id, job_id, attempt_number, engine_id, status, created_at)
           VALUES (?, ?, ?, ?, 'queued', ?)`,
        )
        .run(attemptId, jobId, nextAttemptNumber, engineId, createdAt);
      this.database
        .prepare("UPDATE recognition_jobs SET status = 'queued', current_attempt_id = ?, updated_at = ? WHERE id = ?")
        .run(attemptId, createdAt, jobId);
    });
    return requiredSnapshot(this, jobId);
  }

  beginDelete(jobId: string, updatedAt: string): RecognitionJobSnapshot {
    const job = this.getJob(jobId);
    if (job === undefined) throw new RecognitionStoreError("JOB_NOT_FOUND");
    if (!["failed", "cancelled", "interrupted", "succeeded"].includes(job.status)) {
      throw new RecognitionStoreError(job.status === "deleting" ? "JOB_DELETING" : "JOB_NOT_CANCELLABLE");
    }
    this.database
      .prepare("UPDATE recognition_jobs SET status = 'deleting', updated_at = ? WHERE id = ?")
      .run(updatedAt, jobId);
    return requiredSnapshot(this, jobId);
  }

  completeDelete(jobId: string): void {
    transaction(this.database, () => {
      this.database.prepare("DELETE FROM recognition_attempts WHERE job_id = ?").run(jobId);
      this.database.prepare("DELETE FROM recognition_jobs WHERE id = ?").run(jobId);
    });
  }

  getSnapshot(jobId: string): RecognitionJobSnapshot | undefined {
    const job = this.getJob(jobId);
    if (job === undefined || job.status === "uploading" || job.current_attempt_id === null) return undefined;
    const attempt = this.getAttempt(job.current_attempt_id);
    if (attempt === undefined) return undefined;
    return recognitionJobSnapshotSchema.parse({
      jobId: job.id,
      attemptId: attempt.id,
      attemptNumber: attempt.attempt_number,
      status: job.status,
      ...(attempt.stage === null ? {} : { stage: attempt.stage }),
      input: {
        fileName: job.file_name,
        sizeBytes: job.size_bytes,
        inputKind: job.input_kind,
        ...(job.page_count === null ? {} : { pageCount: job.page_count }),
      },
      ...(attempt.engine_version === null
        ? {}
        : {
            engine: {
              id: attempt.engine_id,
              version: attempt.engine_version,
              ...(attempt.model_sha256 === null ? {} : { modelSha256: attempt.model_sha256 }),
            },
          }),
      ...(attempt.progress_unit === null || attempt.progress_completed === null || attempt.progress_total === null
        ? {}
        : {
            progress: {
              unit: attempt.progress_unit,
              completed: attempt.progress_completed,
              total: attempt.progress_total,
            },
          }),
      ...(attempt.error_code === null
        ? {}
        : { error: { code: attempt.error_code, recoverable: attempt.error_code !== "ENGINE_UNAVAILABLE" } }),
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      expiresAt: job.expires_at,
    });
  }

  getDetail(jobId: string): RecognitionJobDetail | undefined {
    const snapshot = this.getSnapshot(jobId);
    if (snapshot === undefined) return undefined;
    const attempts = this.database
      .prepare("SELECT * FROM recognition_attempts WHERE job_id = ? ORDER BY attempt_number ASC")
      .all(jobId) as AttemptRow[];
    const currentAttempt = attempts.find((attempt) => attempt.id === snapshot.attemptId);
    return recognitionJobDetailSchema.parse({
      snapshot,
      attempts: attempts.map((attempt) => ({
        attemptId: attempt.id,
        attemptNumber: attempt.attempt_number,
        status: attempt.status,
        engineId: attempt.engine_id,
        ...(attempt.stage === null ? {} : { stage: attempt.stage }),
        ...(attempt.error_code === null ? {} : { errorCode: attempt.error_code }),
        createdAt: attempt.created_at,
        ...(attempt.started_at === null ? {} : { startedAt: attempt.started_at }),
        ...(attempt.finished_at === null ? {} : { finishedAt: attempt.finished_at }),
      })),
      ...(currentAttempt?.result_metadata_json === null || currentAttempt?.result_metadata_json === undefined
        ? {}
        : { result: JSON.parse(currentAttempt.result_metadata_json) }),
    });
  }

  list(limit = 20, cursor?: string): RecognitionHistoryPage {
    const boundedLimit = Math.max(1, Math.min(limit, 100));
    const position = cursor === undefined ? undefined : decodeCursor(cursor);
    const rows = this.database
      .prepare(
        `SELECT j.*,
                (SELECT COUNT(*) FROM recognition_attempts a WHERE a.job_id = j.id) AS attempt_count,
                (SELECT engine_id FROM recognition_attempts a WHERE a.id = j.current_attempt_id) AS engine_id
           FROM recognition_jobs j
          WHERE j.status <> 'uploading'
            ${position === undefined ? "" : "AND (j.created_at < ? OR (j.created_at = ? AND j.id < ?))"}
          ORDER BY j.created_at DESC, j.id DESC
          LIMIT ?`,
      )
      .all(
        ...(position === undefined
          ? [boundedLimit + 1]
          : [position.createdAt, position.createdAt, position.id, boundedLimit + 1]),
      ) as (JobRow & {
      attempt_count: number;
      engine_id: string | null;
    })[];
    const page = rows.slice(0, boundedLimit);
    const last = page.at(-1);
    return recognitionHistoryPageSchema.parse({
      items: page.map((row) => ({
        jobId: row.id,
        status: row.status,
        input: {
          fileName: row.file_name,
          sizeBytes: row.size_bytes,
          inputKind: row.input_kind,
          ...(row.page_count === null ? {} : { pageCount: row.page_count }),
        },
        attemptCount: row.attempt_count,
        ...(row.engine_id === null ? {} : { engineId: row.engine_id }),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        expiresAt: row.expires_at,
      })),
      ...(rows.length <= boundedLimit || last === undefined
        ? {}
        : { nextCursor: encodeCursor(last.created_at, last.id) }),
    });
  }

  getObjectKeys(jobId: string): readonly string[] | undefined {
    const job = this.getJob(jobId);
    if (job === undefined) return undefined;
    const keys = [job.input_object_key];
    const results = this.database
      .prepare(
        `SELECT result_object_key, manifest_object_key
           FROM recognition_attempts WHERE job_id = ? AND result_object_key IS NOT NULL`,
      )
      .all(jobId) as { result_object_key: string; manifest_object_key: string | null }[];
    for (const result of results) {
      keys.push(result.result_object_key);
      if (result.manifest_object_key !== null) keys.push(result.manifest_object_key);
    }
    return [...new Set(keys)];
  }

  private interruptAbandonedAttempts(finishedAt: string): void {
    transaction(this.database, () => {
      this.database
        .prepare(
          `UPDATE recognition_attempts
              SET status = 'interrupted', error_code = 'INTERRUPTED', finished_at = ?
            WHERE status IN ('running', 'cancelling')`,
        )
        .run(finishedAt);
      this.database.exec(`
        UPDATE recognition_jobs
           SET status = 'interrupted', updated_at = '${finishedAt.replaceAll("'", "''")}'
         WHERE status IN ('running', 'cancelling');
      `);
    });
  }

  private getJob(jobId: string): JobRow | undefined {
    return this.database.prepare("SELECT * FROM recognition_jobs WHERE id = ?").get(jobId) as JobRow | undefined;
  }

  private getAttempt(attemptId: string): AttemptRow | undefined {
    return this.database.prepare("SELECT * FROM recognition_attempts WHERE id = ?").get(attemptId) as
      | AttemptRow
      | undefined;
  }
}

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify([createdAt, id])).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      typeof value[0] !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(value[0]) ||
      typeof value[1] !== "string" ||
      value[1].length === 0 ||
      value[1].length > 128
    ) {
      throw new Error();
    }
    return { createdAt: value[0], id: value[1] };
  } catch {
    throw new Error("INVALID_REQUEST");
  }
}

export class RecognitionStoreError extends Error {
  constructor(readonly code: "JOB_NOT_FOUND" | "JOB_NOT_CANCELLABLE" | "JOB_NOT_RETRYABLE" | "JOB_DELETING") {
    super(code);
  }
}

function requiredSnapshot(store: RecognitionJobStore, jobId: string): RecognitionJobSnapshot {
  const snapshot = store.getSnapshot(jobId);
  if (snapshot === undefined) throw new RecognitionStoreError("JOB_NOT_FOUND");
  return snapshot;
}

function openDatabase(path: string): Database {
  const require = createRequire(import.meta.url);
  const { DatabaseSync } = require("node:sqlite") as { DatabaseSync?: new (path: string) => Database };
  if (DatabaseSync === undefined) throw new Error("NODE_SQLITE_UNAVAILABLE");
  return new DatabaseSync(path);
}

function migrate(database: Database): void {
  database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS recognition_jobs (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      input_kind TEXT NOT NULL CHECK (input_kind IN ('pdf', 'image')),
      input_object_key TEXT NOT NULL UNIQUE,
      input_sha256 TEXT NOT NULL,
      page_count INTEGER,
      status TEXT NOT NULL,
      current_attempt_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recognition_attempts (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      engine_id TEXT NOT NULL,
      engine_version TEXT,
      model_sha256 TEXT,
      status TEXT NOT NULL,
      stage TEXT,
      progress_unit TEXT,
      progress_completed INTEGER,
      progress_total INTEGER,
      error_code TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      result_object_key TEXT,
      manifest_object_key TEXT,
      output_sha256 TEXT,
      result_size_bytes INTEGER,
      result_metadata_json TEXT,
      UNIQUE (job_id, attempt_number),
      FOREIGN KEY (job_id) REFERENCES recognition_jobs(id)
    );
    CREATE INDEX IF NOT EXISTS recognition_attempt_queue
      ON recognition_attempts(status, created_at, id);
  `);
}

function transaction(database: Database, operation: () => void): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    operation();
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
