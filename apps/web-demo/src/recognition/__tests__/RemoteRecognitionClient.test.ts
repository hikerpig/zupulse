import { describe, expect, it, vi } from "vitest";
import { RemoteRecognitionClient } from "../RemoteRecognitionClient";

const jobId = "00000000-0000-4000-8000-000000000001";
const snapshot = {
  jobId,
  attemptId: "00000000-0000-4000-8000-000000000002",
  attemptNumber: 1,
  status: "queued" as const,
  input: { fileName: "sonata.pdf", sizeBytes: 5, inputKind: "pdf" as const },
};

describe("RemoteRecognitionClient", () => {
  it("uploads a selected file and follows snapshot events", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const source = new FakeEventSource();
    const client = new RemoteRecognitionClient({
      engines: [{ id: "audiveris", version: "1", available: true, inputKinds: ["pdf", "image"] }],
      selectFile: async () => new File(["%PDF"], "sonata.pdf", { type: "application/pdf" }),
      fetch: vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(url), ...(init === undefined ? {} : { init }) });
        return Response.json(snapshot, { status: 201 });
      }),
      createEventSource: () => source,
      save: vi.fn(),
    });
    const port = client.create();
    const selected = await port.select();
    expect(selected).toMatchObject({ status: "selected", fileName: "sonata.pdf", inputKind: "pdf" });

    const listener = vi.fn();
    port.subscribe(listener);
    await port.start("selected-file", "audiveris");
    expect(requests[0]?.url).toBe("/api/recognition/v1/jobs");
    expect(requests[0]?.init?.body).toBeInstanceOf(FormData);

    source.emit("snapshot", { kind: "snapshot", snapshot: { ...snapshot, status: "running", stage: "recognize" } });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: "running", stage: "recognize" }));
  });

  it("reports connection recovery and returns to connected after a snapshot", async () => {
    const source = new FakeEventSource();
    const client = new RemoteRecognitionClient({
      engines: [],
      selectFile: async () => null,
      fetch: vi.fn(),
      createEventSource: () => source,
      save: vi.fn(),
    });
    const port = client.open(jobId);
    const listener = vi.fn();

    port.subscribeConnection?.(listener);
    expect(listener).toHaveBeenLastCalledWith("connecting");

    source.emit("error");
    expect(listener).toHaveBeenLastCalledWith("reconnecting");

    source.emit("snapshot", { kind: "snapshot", snapshot });
    expect(listener).toHaveBeenLastCalledWith("connected");
  });

  it("can cancel an upload before the job is created", async () => {
    const client = new RemoteRecognitionClient({
      engines: [{ id: "audiveris", version: "1", available: true, inputKinds: ["pdf"] }],
      selectFile: async () => new File(["%PDF"], "sonata.pdf", { type: "application/pdf" }),
      fetch: vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          }),
      ),
      createEventSource: () => new FakeEventSource(),
      save: vi.fn(),
    });
    const port = client.create();
    await port.select();

    const upload = port.start("selected-file", "audiveris");
    port.cancelPendingStart?.();

    await expect(upload).rejects.toThrow("UPLOAD_CANCELLED");
  });

  it("opens history jobs and reads their persisted result", async () => {
    const save = vi.fn();
    const fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/result")) return new Response(new Uint8Array([1, 2, 3]));
      return Response.json({
        snapshot: { ...snapshot, status: "succeeded", stage: "export" },
        attempts: [
          {
            attemptId: snapshot.attemptId,
            attemptNumber: 1,
            status: "succeeded",
            engineId: "audiveris",
            createdAt: "2026-08-16T00:00:00.000Z",
          },
        ],
        result: {
          fileName: "score.mxl",
          outputSha256: "a".repeat(64),
          validation: { readiness: { harmony: "ready", musicXml: "ready" }, diagnostics: [] },
        },
      });
    });
    const client = new RemoteRecognitionClient({
      engines: [],
      selectFile: async () => null,
      fetch,
      createEventSource: () => new FakeEventSource(),
      save,
    });
    const port = client.open(jobId);

    expect((await port.getSnapshot())?.status).toBe("succeeded");
    expect(await port.readResult(jobId)).toMatchObject({ fileName: "score.mxl", bytes: new Uint8Array([1, 2, 3]) });
    expect(await port.exportResult(jobId)).toBe("saved");
    expect(save).toHaveBeenCalledWith("score.mxl", new Uint8Array([1, 2, 3]));
  });
});

class FakeEventSource {
  private readonly listeners = new Map<string, EventListener>();

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, listener);
  }

  close(): void {}

  emit(type: string, value?: unknown): void {
    const event = value === undefined ? new Event(type) : ({ data: JSON.stringify(value) } as MessageEvent<string>);
    this.listeners.get(type)?.(event);
  }
}
