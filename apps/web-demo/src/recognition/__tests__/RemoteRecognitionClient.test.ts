import { describe, expect, it, vi } from "vitest";
import { RemoteRecognitionClient, tryCreateRemoteRecognitionClient } from "../RemoteRecognitionClient";

const jobId = "00000000-0000-4000-8000-000000000001";
const snapshot = {
  jobId,
  attemptId: "00000000-0000-4000-8000-000000000002",
  attemptNumber: 1,
  status: "queued" as const,
  input: { fileName: "sonata.pdf", sizeBytes: 5, inputKind: "pdf" as const },
};
const availableCapabilities = {
  schemaVersion: "1.0.0" as const,
  engines: [{ id: "audiveris", version: "1", available: true, inputKinds: ["pdf" as const, "image" as const] }],
};

describe("tryCreateRemoteRecognitionClient", () => {
  it("returns a client when an engine is available", async () => {
    const client = await tryCreateRemoteRecognitionClient({
      fetch: vi.fn(async () => Response.json(availableCapabilities)),
      ownerDocument: fakeOwnerDocument(),
    });
    expect(client).toBeInstanceOf(RemoteRecognitionClient);
  });

  it("fails closed when the probe times out, is invalid, or has no available engine", async () => {
    const ownerDocument = fakeOwnerDocument();
    await expect(
      tryCreateRemoteRecognitionClient({
        fetch: vi.fn(async () => {
          throw new DOMException("Aborted", "TimeoutError");
        }),
        ownerDocument,
      }),
    ).resolves.toBeUndefined();
    await expect(
      tryCreateRemoteRecognitionClient({
        fetch: vi.fn(async () => new Response("nope", { status: 500 })),
        ownerDocument,
      }),
    ).resolves.toBeUndefined();
    await expect(
      tryCreateRemoteRecognitionClient({
        fetch: vi.fn(async () => Response.json({ schemaVersion: "1.0.0", engines: [] })),
        ownerDocument,
      }),
    ).resolves.toBeUndefined();
    await expect(
      tryCreateRemoteRecognitionClient({
        fetch: vi.fn(async () =>
          Response.json({
            schemaVersion: "1.0.0",
            engines: [{ id: "audiveris", version: "1", available: false, inputKinds: ["pdf"], reason: "offline" }],
          }),
        ),
        ownerDocument,
      }),
    ).resolves.toBeUndefined();
  });
});

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
    if (selected.status !== "selected") throw new Error("expected selection");

    const listener = vi.fn();
    port.subscribe(listener);
    await port.start(selected.fileToken, "audiveris");
    expect(requests[0]?.url).toBe("/api/recognition/v1/jobs");
    expect(requests[0]?.init?.body).toBeInstanceOf(FormData);

    source.emit("snapshot", { kind: "snapshot", snapshot: { ...snapshot, status: "running", stage: "recognize" } });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: "running", stage: "recognize" }));
  });

  it("rejects a start that does not use the selected file token", async () => {
    const client = new RemoteRecognitionClient({
      engines: [{ id: "audiveris", version: "1", available: true, inputKinds: ["pdf"] }],
      selectFile: async () => new File(["%PDF"], "sonata.pdf", { type: "application/pdf" }),
      fetch: vi.fn(),
      createEventSource: () => new FakeEventSource(),
      save: vi.fn(),
    });
    const port = client.create();
    await port.select();
    await expect(port.start("selected-file", "audiveris")).rejects.toThrow("INVALID_REQUEST");
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
    const selected = await port.select();
    if (selected.status !== "selected") throw new Error("expected selection");

    const upload = port.start(selected.fileToken, "audiveris");
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

  it("previews the selected PDF before and after the job starts", async () => {
    const client = new RemoteRecognitionClient({
      engines: [{ id: "audiveris", version: "1", available: true, inputKinds: ["pdf", "image"] }],
      selectFile: async () => new File(["%PDF-1.7"], "sonata.pdf", { type: "application/pdf" }),
      fetch: vi.fn(async () => Response.json(snapshot, { status: 201 })),
      createEventSource: () => new FakeEventSource(),
      save: vi.fn(),
    });
    const port = client.create();
    expect(await port.readSelectedInputPreview?.("missing", 0)).toBeNull();

    const selected = await port.select();
    if (selected.status !== "selected") throw new Error("expected selection");
    const preview = await port.readSelectedInputPreview?.(selected.fileToken, 0);
    expect(preview).toMatchObject({ pageIndex: 0, pageCount: 1, contentType: "application/pdf" });
    expect(Array.from(preview?.bytes ?? [])).toEqual(Array.from(new TextEncoder().encode("%PDF-1.7")));
    expect(await port.readSelectedInputPreview?.(selected.fileToken, 1)).toBeNull();
    expect(await port.readSelectedInputPreview?.("missing", 0)).toBeNull();

    await port.start(selected.fileToken, "audiveris");
    // Starting a job navigates to a fresh port opened by jobId; the input stays previewable.
    const reopened = client.open(snapshot.jobId);
    expect(await reopened.readInputPreview?.(snapshot.jobId, 0)).toMatchObject({ contentType: "application/pdf" });
  });

  it("previews selected images and reports unknown jobs as unavailable", async () => {
    const client = new RemoteRecognitionClient({
      engines: [],
      selectFile: async () => new File([1, 2, 3], "score.png", { type: "image/png" }),
      fetch: vi.fn(async () => Response.json(snapshot, { status: 201 })),
      createEventSource: () => new FakeEventSource(),
      save: vi.fn(),
    });
    const port = client.create();
    const selected = await port.select();
    if (selected.status !== "selected") throw new Error("expected selection");

    expect(await port.readSelectedInputPreview?.(selected.fileToken, 0)).toMatchObject({
      pageCount: 1,
      contentType: "image/png",
    });
    expect(
      await client
        .open("00000000-0000-4000-8000-000000000099")
        .readInputPreview?.("00000000-0000-4000-8000-000000000099", 0),
    ).toBeNull();
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

function fakeOwnerDocument(): Document {
  return {
    createElement: () => ({
      style: {},
      addEventListener: () => undefined,
      click: () => undefined,
      remove: () => undefined,
    }),
    body: { appendChild: () => undefined },
  } as unknown as Document;
}
