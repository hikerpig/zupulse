import {
  recognitionApiErrorSchema,
  recognitionHistoryPageSchema,
  recognitionJobDetailSchema,
  recognitionJobSnapshotSchema,
  recognitionSseEventSchema,
  type RecognitionEngineOption,
  type RecognitionJobDetail,
  type RecognitionJobSnapshot,
} from "@zupulse/web-core";
import type {
  PdfOmrInputPreview,
  PdfOmrResult,
  RecognitionConnectionState,
  RecognitionHistoryPort,
  RecognitionJobPort,
} from "@zupulse/web-viewer";

const API = "/api/recognition/v1";

type EventSourceLike = {
  addEventListener(type: string, listener: EventListener): void;
  close(): void;
};

type Dependencies = {
  engines: readonly RecognitionEngineOption[];
  fetch: typeof globalThis.fetch;
  selectFile(): Promise<File | null>;
  createEventSource(url: string): EventSourceLike;
  save(fileName: string, bytes: Uint8Array): void;
};

export class RemoteRecognitionClient implements RecognitionHistoryPort {
  private readonly dependencies: Dependencies;
  private readonly selectedInputs = new Map<string, File>();

  constructor(dependencies: Dependencies) {
    this.dependencies = dependencies;
  }

  async list(input: { cursor?: string; limit: number }) {
    const query = new URLSearchParams({ limit: String(input.limit) });
    if (input.cursor !== undefined) query.set("cursor", input.cursor);
    return recognitionHistoryPageSchema.parse(await readJson(this.dependencies.fetch, `${API}/jobs?${query}`));
  }

  create(): RecognitionJobPort {
    return new RemoteRecognitionJob(this.dependencies, this.selectedInputs);
  }

  open(jobId: string): RecognitionJobPort {
    return new RemoteRecognitionJob(this.dependencies, this.selectedInputs, jobId);
  }

  async delete(jobId: string): Promise<void> {
    await expectOk(this.dependencies.fetch, `${API}/jobs/${jobId}`, { method: "DELETE" });
    this.selectedInputs.delete(jobId);
  }
}

class RemoteRecognitionJob implements RecognitionJobPort {
  readonly engines: RecognitionJobPort["engines"];
  private selected?: File;
  private jobId: string | undefined;
  private source: EventSourceLike | undefined;
  private startController: AbortController | undefined;
  private readonly listeners = new Set<(snapshot: RecognitionJobSnapshot) => void>();
  private readonly connectionListeners = new Set<(state: RecognitionConnectionState) => void>();
  private connectionState: RecognitionConnectionState = "connecting";

  constructor(
    private readonly dependencies: Dependencies,
    private readonly selectedInputs: Map<string, File>,
    jobId?: string,
  ) {
    this.jobId = jobId;
    this.engines = dependencies.engines.map((engine) => ({
      id: engine.id,
      version: engine.version,
      available: engine.available,
      inputKinds: engine.inputKinds,
      label: engine.id,
      ...(engine.reason === undefined ? {} : { reason: engine.reason }),
    }));
  }

  async select() {
    const file = await this.dependencies.selectFile();
    if (file === null) return { status: "cancelled" as const };
    const inputKind = detectInputKind(file);
    this.selected = file;
    return {
      status: "selected" as const,
      fileToken: "selected-file",
      fileName: file.name,
      sizeBytes: file.size,
      inputKind,
    };
  }

  async start(fileToken: string, engineId: string) {
    if (fileToken !== "selected-file" || this.selected === undefined) throw new Error("INVALID_REQUEST");
    const body = new FormData();
    body.append("engineId", engineId);
    body.append("input", this.selected);
    const controller = new AbortController();
    this.startController = controller;
    try {
      const snapshot = recognitionJobSnapshotSchema.parse(
        await readJson(this.dependencies.fetch, `${API}/jobs`, {
          method: "POST",
          body,
          signal: controller.signal,
        }),
      );
      this.jobId = snapshot.jobId;
      this.selectedInputs.set(snapshot.jobId, this.selected);
      this.connect();
      return { jobId: snapshot.jobId, snapshot };
    } catch (error) {
      if (controller.signal.aborted) throw new Error("UPLOAD_CANCELLED");
      throw error;
    } finally {
      if (this.startController === controller) this.startController = undefined;
    }
  }

  cancelPendingStart(): void {
    this.startController?.abort();
  }

  async retry(jobId: string, engineId: string) {
    const snapshot = recognitionJobSnapshotSchema.parse(
      await readJson(this.dependencies.fetch, `${API}/jobs/${jobId}/retries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engineId }),
      }),
    );
    this.jobId = snapshot.jobId;
    this.connect();
    return { jobId: snapshot.jobId, snapshot };
  }

  async cancel(jobId: string): Promise<void> {
    await expectOk(this.dependencies.fetch, `${API}/jobs/${jobId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  }

  async getSnapshot(): Promise<RecognitionJobSnapshot | null> {
    return (await this.getDetail())?.snapshot ?? null;
  }

  async getDetail(): Promise<RecognitionJobDetail | null> {
    if (this.jobId === undefined) return null;
    const detail = recognitionJobDetailSchema.parse(
      await readJson(this.dependencies.fetch, `${API}/jobs/${this.jobId}`),
    );
    this.connect();
    return detail;
  }

  async readResult(jobId: string): Promise<PdfOmrResult | null> {
    const detail = recognitionJobDetailSchema.parse(await readJson(this.dependencies.fetch, `${API}/jobs/${jobId}`));
    if (detail.result === undefined) return null;
    const response = await expectOk(this.dependencies.fetch, `${API}/jobs/${jobId}/result`);
    return { ...detail.result, bytes: new Uint8Array(await response.arrayBuffer()) };
  }

  async readFailedValidation(jobId: string) {
    const detail = recognitionJobDetailSchema.parse(await readJson(this.dependencies.fetch, `${API}/jobs/${jobId}`));
    return detail.result?.validation ?? null;
  }

  async readInputPreview(jobId: string, pageIndex: number): Promise<PdfOmrInputPreview | null> {
    const file = this.selected ?? this.selectedInputs.get(jobId);
    return file === undefined ? null : readSelectedFilePreview(file, pageIndex);
  }

  async readSelectedInputPreview(_fileToken: string, pageIndex: number): Promise<PdfOmrInputPreview | null> {
    return this.selected === undefined ? null : readSelectedFilePreview(this.selected, pageIndex);
  }

  async exportResult(jobId: string): Promise<"saved" | "cancelled"> {
    const result = await this.readResult(jobId);
    if (result === null) return "cancelled";
    this.dependencies.save(result.fileName, result.bytes);
    return "saved";
  }

  subscribe(listener: (snapshot: RecognitionJobSnapshot) => void): () => void {
    this.listeners.add(listener);
    this.connect();
    return () => {
      this.listeners.delete(listener);
      this.disconnectIfUnused();
    };
  }

  subscribeConnection(listener: (state: RecognitionConnectionState) => void): () => void {
    this.connectionListeners.add(listener);
    listener(this.connectionState);
    this.connect();
    return () => {
      this.connectionListeners.delete(listener);
      this.disconnectIfUnused();
    };
  }

  private connect(): void {
    if (
      this.jobId === undefined ||
      this.source !== undefined ||
      (this.listeners.size === 0 && this.connectionListeners.size === 0)
    ) {
      return;
    }
    this.setConnectionState("connecting");
    this.source = this.dependencies.createEventSource(`${API}/jobs/${this.jobId}/events`);
    this.source.addEventListener("open", () => this.setConnectionState("connected"));
    this.source.addEventListener("error", () => this.setConnectionState("reconnecting"));
    this.source.addEventListener("snapshot", ((message: MessageEvent<string>) => {
      const event = recognitionSseEventSchema.parse(JSON.parse(message.data));
      if (event.kind === "snapshot") {
        this.setConnectionState("connected");
        this.listeners.forEach((listener) => listener(event.snapshot));
      }
    }) as EventListener);
  }

  private setConnectionState(state: RecognitionConnectionState): void {
    if (this.connectionState === state) return;
    this.connectionState = state;
    this.connectionListeners.forEach((listener) => listener(state));
  }

  private disconnectIfUnused(): void {
    if (this.listeners.size > 0 || this.connectionListeners.size > 0) return;
    this.source?.close();
    this.source = undefined;
    this.connectionState = "connecting";
  }
}

export function selectRecognitionFile(ownerDocument: Document): Promise<File | null> {
  return new Promise((resolve) => {
    const input = ownerDocument.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.click();
  });
}

export function saveRecognitionResult(ownerDocument: Document, fileName: string, bytes: Uint8Array): void {
  const blobBytes = new Uint8Array(bytes.byteLength);
  blobBytes.set(bytes);
  const url = URL.createObjectURL(new Blob([blobBytes], { type: "application/vnd.recordare.musicxml" }));
  const anchor = ownerDocument.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function detectInputKind(file: File): "pdf" | "image" {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g)$/.test(name)) return "image";
  throw new Error("UNSUPPORTED_INPUT");
}

async function readSelectedFilePreview(file: File, pageIndex: number): Promise<PdfOmrInputPreview | null> {
  if (pageIndex !== 0) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (detectInputKind(file) === "pdf") {
    // The raw document is rendered by the browser's built-in PDF viewer, which owns paging.
    return { pageIndex: 0, pageCount: 1, contentType: "application/pdf", bytes };
  }
  return {
    pageIndex: 0,
    pageCount: 1,
    contentType: file.name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
    bytes,
  };
}

async function readJson(fetcher: typeof globalThis.fetch, input: string, init?: RequestInit): Promise<unknown> {
  const response = await expectOk(fetcher, input, init);
  return response.json();
}

async function expectOk(fetcher: typeof globalThis.fetch, input: string, init?: RequestInit): Promise<Response> {
  const response = await fetcher(input, init);
  if (response.ok) return response;
  const parsed = recognitionApiErrorSchema.safeParse(await response.json().catch(() => null));
  throw new Error(parsed.success ? parsed.data.error.code : "INVALID_REQUEST");
}
