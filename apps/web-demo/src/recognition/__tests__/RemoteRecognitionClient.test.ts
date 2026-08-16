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

    source.emit({ kind: "snapshot", snapshot: { ...snapshot, status: "running", stage: "recognize" } });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status: "running", stage: "recognize" }));
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
  private listener?: (event: MessageEvent<string>) => void;

  addEventListener(_type: string, listener: EventListener): void {
    this.listener = listener as (event: MessageEvent<string>) => void;
  }

  close(): void {}

  emit(value: unknown): void {
    this.listener?.({ data: JSON.stringify(value) } as MessageEvent<string>);
  }
}
