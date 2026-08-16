import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRecognitionHttpServer } from "../http-server";
import { RecognitionJobStore } from "../job-store";
import type { RecognitionBlobStore } from "../recognition-service";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("Recognition HTTP server", () => {
  it("creates, lists, cancels and retries a PDF job", async () => {
    const context = await createContext();
    const capabilities = await fetch(`${context.origin}/api/recognition/v1/capabilities`);
    expect(await capabilities.json()).toMatchObject({ schemaVersion: "1.0.0", engines: [{ id: "rokot" }] });

    const form = new FormData();
    form.set("engineId", "rokot");
    form.set("input", new File(["%PDF-1.7"], "score.pdf", { type: "application/pdf" }));
    const created = await fetch(`${context.origin}/api/recognition/v1/jobs`, {
      method: "POST",
      headers: { Origin: context.origin },
      body: form,
    });
    expect(created.status).toBe(201);
    const snapshot = (await created.json()) as { jobId: string; status: string };
    expect(snapshot.status).toBe("queued");
    expect(context.objects.keys).toEqual([`jobs/${snapshot.jobId}/input.pdf`]);

    const history = await fetch(`${context.origin}/api/recognition/v1/jobs`);
    expect((await history.json()).items).toHaveLength(1);
    const detail = await fetch(`${context.origin}/api/recognition/v1/jobs/${snapshot.jobId}`);
    expect((await detail.json()).attempts).toHaveLength(1);
    const events = await fetch(`${context.origin}/api/recognition/v1/jobs/${snapshot.jobId}/events`);
    const eventReader = events.body!.getReader();
    const firstEvent = await eventReader.read();
    expect(new TextDecoder().decode(firstEvent.value)).toContain('"kind":"snapshot"');
    await eventReader.cancel();

    const cancelled = await fetch(`${context.origin}/api/recognition/v1/jobs/${snapshot.jobId}/cancel`, {
      method: "POST",
      headers: { Origin: context.origin, "Content-Type": "application/json" },
      body: "{}",
    });
    expect((await cancelled.json()).status).toBe("cancelled");
    const retried = await fetch(`${context.origin}/api/recognition/v1/jobs/${snapshot.jobId}/retries`, {
      method: "POST",
      headers: { Origin: context.origin, "Content-Type": "application/json" },
      body: JSON.stringify({ engineId: "rokot" }),
    });
    expect(await retried.json()).toMatchObject({ status: "queued", attemptNumber: 2 });
  });

  it("rejects mutation requests from another origin and invalid file bytes", async () => {
    const context = await createContext();
    const form = new FormData();
    form.set("engineId", "rokot");
    form.set("input", new File(["not a pdf"], "score.pdf", { type: "application/pdf" }));

    const crossOrigin = await fetch(`${context.origin}/api/recognition/v1/jobs`, {
      method: "POST",
      headers: { Origin: "https://attacker.invalid" },
      body: form,
    });
    expect(crossOrigin.status).toBe(403);

    const invalid = await fetch(`${context.origin}/api/recognition/v1/jobs`, {
      method: "POST",
      headers: { Origin: context.origin },
      body: form,
    });
    expect(invalid.status).toBe(415);
    expect(await invalid.json()).toEqual({ error: { code: "UNSUPPORTED_INPUT", recoverable: true } });
  });
});

async function createContext() {
  const directory = await mkdtemp(join(tmpdir(), "zupulse-recognition-http-"));
  const store = new RecognitionJobStore(join(directory, "recognition.sqlite"));
  const objects = new FakeBlobStore();
  const server = createRecognitionHttpServer({
    store,
    objects,
    tempRoot: join(directory, "uploads"),
    engines: [{ id: "rokot", version: "1.0.0", available: true, inputKinds: ["pdf"] }],
    now: () => new Date("2026-08-16T00:00:00.000Z"),
    createId: (() => {
      let value = 0;
      return () => `00000000-0000-4000-8000-${String(++value).padStart(12, "0")}`;
    })(),
    onQueued: () => undefined,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("server did not listen");
  return { store, objects, origin: `http://127.0.0.1:${address.port}` };
}

class FakeBlobStore implements RecognitionBlobStore {
  keys: string[] = [];
  values = new Map<string, Uint8Array>();

  async putFile(key: string, path: string, expectedSha256: string): Promise<{ sizeBytes: number }> {
    const bytes = new Uint8Array(await readFile(path));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(expectedSha256);
    this.keys.push(key);
    this.values.set(key, bytes);
    return { sizeBytes: bytes.byteLength };
  }

  async putBytes(key: string, bytes: Uint8Array): Promise<void> {
    this.keys.push(key);
    this.values.set(key, bytes);
  }

  async materialize(): Promise<void> {
    throw new Error("not used");
  }

  async getBytes(key: string): Promise<Uint8Array> {
    const value = this.values.get(key);
    if (value === undefined) throw new Error("missing");
    return value;
  }

  async delete(keys: readonly string[]): Promise<void> {
    for (const key of keys) this.values.delete(key);
  }
}
