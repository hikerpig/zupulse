import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type {
  RecognitionEngineOption,
  RecognitionHistoryPage,
  RecognitionJobDetail,
  RecognitionJobSnapshot,
} from "@zupulse/web-core";
import { RecognitionJobStore } from "./job-store";
import { RecognitionEventHub } from "./recognition-events";
import type { RecognitionObjectStore } from "./recognition-worker";

export interface RecognitionBlobStore extends RecognitionObjectStore {
  getBytes(key: string, expectedSha256: string): Promise<Uint8Array>;
  delete(keys: readonly string[]): Promise<void>;
}

export class RecognitionService {
  readonly engines: readonly RecognitionEngineOption[];
  private readonly store: RecognitionJobStore;
  private readonly objects: RecognitionBlobStore;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly onQueued: () => void;
  private readonly events: RecognitionEventHub;
  private readonly onCancelRunning: (jobId: string) => boolean;

  constructor(options: {
    store: RecognitionJobStore;
    objects: RecognitionBlobStore;
    engines: readonly RecognitionEngineOption[];
    now?: () => Date;
    createId?: () => string;
    onQueued?: () => void;
    onCancelRunning?: (jobId: string) => boolean;
    events?: RecognitionEventHub;
  }) {
    this.store = options.store;
    this.objects = options.objects;
    this.engines = options.engines;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.onQueued = options.onQueued ?? (() => undefined);
    this.onCancelRunning = options.onCancelRunning ?? (() => false);
    this.events = options.events ?? new RecognitionEventHub();
  }

  async createJob(input: {
    path: string;
    fileName: string;
    sizeBytes: number;
    inputKind: "pdf" | "image";
    engineId: string;
  }): Promise<RecognitionJobSnapshot> {
    this.assertEngine(input.engineId, input.inputKind);
    const bytes = new Uint8Array(await readFile(input.path));
    const inputSha256 = createHash("sha256").update(bytes).digest("hex");
    const jobId = this.createId();
    const attemptId = this.createId();
    const extension = input.inputKind === "pdf" ? "pdf" : imageExtension(input.fileName);
    const inputObjectKey = `jobs/${jobId}/input.${extension}`;
    const createdAt = this.now().toISOString();
    const expiresAt = new Date(this.now().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const job = {
      jobId,
      attemptId,
      engineId: input.engineId,
      input: { fileName: input.fileName, sizeBytes: input.sizeBytes, inputKind: input.inputKind },
      inputObjectKey,
      inputSha256,
      createdAt,
      expiresAt,
    };
    this.store.beginUpload(job);
    try {
      await this.objects.putFile(inputObjectKey, input.path, inputSha256);
      const snapshot = this.store.queueUploaded(jobId, attemptId, input.engineId, createdAt);
      this.events.publish(snapshot);
      this.onQueued();
      return snapshot;
    } catch (error) {
      await this.objects.delete([inputObjectKey]).catch(() => undefined);
      this.store.discardPendingUpload(jobId);
      throw error;
    }
  }

  list(limit?: number, cursor?: string): RecognitionHistoryPage {
    return this.store.list(limit, cursor);
  }

  get(jobId: string): RecognitionJobDetail | undefined {
    return this.store.getDetail(jobId);
  }

  cancel(jobId: string): RecognitionJobSnapshot {
    const current = this.store.getSnapshot(jobId);
    if (current === undefined) throw new Error("JOB_NOT_FOUND");
    if (current.status === "cancelling") return current;
    if (current.status === "running") {
      const snapshot = this.store.requestCancellation(jobId, this.now().toISOString());
      this.events.publish(snapshot);
      if (this.onCancelRunning(jobId)) return snapshot;
      const cancelled = this.store.finishCancellation(snapshot.attemptId!, this.now().toISOString());
      this.events.publish(cancelled);
      return cancelled;
    }
    const snapshot = this.store.cancel(jobId, this.now().toISOString());
    this.events.publish(snapshot);
    return snapshot;
  }

  retry(jobId: string, engineId: string): RecognitionJobSnapshot {
    const detail = this.store.getDetail(jobId);
    if (detail === undefined) return this.store.retry(jobId, this.createId(), engineId, this.now().toISOString());
    const inputKind = detail.snapshot.input?.inputKind;
    if (inputKind === undefined) throw new Error("JOB_NOT_FOUND");
    this.assertEngine(engineId, inputKind);
    const snapshot = this.store.retry(jobId, this.createId(), engineId, this.now().toISOString());
    this.events.publish(snapshot);
    this.onQueued();
    return snapshot;
  }

  subscribe(jobId: string, listener: (snapshot: RecognitionJobSnapshot) => void): () => void {
    return this.events.subscribe(jobId, listener);
  }

  async readResult(jobId: string): Promise<{ bytes: Uint8Array; outputSha256: string } | undefined> {
    const result = this.store.getResult(jobId);
    if (result === undefined) return undefined;
    return {
      bytes: await this.objects.getBytes(result.resultObjectKey, result.outputSha256),
      outputSha256: result.outputSha256,
    };
  }

  async delete(jobId: string): Promise<void> {
    const keys = this.store.getObjectKeys(jobId);
    if (keys === undefined) throw new Error("JOB_NOT_FOUND");
    this.store.beginDelete(jobId, this.now().toISOString());
    await this.objects.delete(keys);
    this.store.completeDelete(jobId);
  }

  private assertEngine(engineId: string, inputKind: "pdf" | "image"): void {
    const engine = this.engines.find((candidate) => candidate.id === engineId);
    if (engine?.available !== true || !engine.inputKinds.includes(inputKind)) throw new Error("ENGINE_UNAVAILABLE");
  }
}

function imageExtension(fileName: string): "jpg" | "png" {
  return fileName.toLowerCase().endsWith(".png") ? "png" : "jpg";
}
