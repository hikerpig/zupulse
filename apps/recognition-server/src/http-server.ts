import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { basename, join } from "node:path";
import { finished } from "node:stream/promises";
import type { RecognitionEngineOption } from "@zupulse/web-core";
import Busboy from "busboy";
import { RecognitionJobStore, RecognitionStoreError } from "./job-store";
import { RecognitionEventHub } from "./recognition-events";
import { RecognitionObjectStoreError } from "./s3-object-store";
import { RecognitionService, type RecognitionBlobStore } from "./recognition-service";

const API_PREFIX = "/api/recognition/v1";
const MAX_INPUT_BYTES = 64 * 1024 * 1024;

export function createRecognitionHttpServer(options: {
  store: RecognitionJobStore;
  objects: RecognitionBlobStore;
  tempRoot: string;
  engines: readonly RecognitionEngineOption[];
  now?: () => Date;
  createId?: () => string;
  onQueued?: () => void;
  onCancelRunning?: (jobId: string) => boolean;
  events?: RecognitionEventHub;
}) {
  const events = options.events ?? new RecognitionEventHub();
  const service = new RecognitionService({ ...options, events });
  return createServer((request, response) => {
    void handleRequest(request, response, service, options.tempRoot);
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  service: RecognitionService,
  tempRoot: string,
): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://recognition.invalid");
    if (request.method === "GET" && url.pathname === `${API_PREFIX}/capabilities`) {
      return writeJson(response, 200, { schemaVersion: "1.0.0", engines: service.engines });
    }
    if (request.method === "GET" && url.pathname === `${API_PREFIX}/jobs`) {
      const limit = Number(url.searchParams.get("limit") ?? 20);
      const cursor = url.searchParams.get("cursor") ?? undefined;
      return writeJson(response, 200, service.list(Number.isSafeInteger(limit) ? limit : 20, cursor));
    }
    if (request.method === "POST" && url.pathname === `${API_PREFIX}/jobs`) {
      assertMutationOrigin(request);
      const upload = await parseUpload(request, tempRoot);
      try {
        const snapshot = await service.createJob(upload);
        return writeJson(response, 201, snapshot);
      } finally {
        await rm(upload.directory, { recursive: true, force: true });
      }
    }
    const match = url.pathname.match(
      /^\/api\/recognition\/v1\/jobs\/([a-f0-9-]{36})(?:\/(cancel|retries|result|events))?$/,
    );
    if (match === null) return writeError(response, 404, "JOB_NOT_FOUND", false);
    const jobId = match[1]!;
    const action = match[2];
    if (request.method === "GET" && action === "events") {
      const detail = service.get(jobId);
      if (detail === undefined) return writeError(response, 404, "JOB_NOT_FOUND", false);
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      let sequence = 0;
      const writeSnapshot = (snapshot: typeof detail.snapshot) => {
        response.write(
          `id: ${sequence++}\nevent: snapshot\ndata: ${JSON.stringify({ kind: "snapshot", snapshot })}\n\n`,
        );
      };
      writeSnapshot(detail.snapshot);
      const unsubscribe = service.subscribe(jobId, writeSnapshot);
      request.once("close", unsubscribe);
      return;
    }
    if (request.method === "GET" && action === undefined) {
      const detail = service.get(jobId);
      return detail === undefined
        ? writeError(response, 404, "JOB_NOT_FOUND", false)
        : writeJson(response, 200, detail);
    }
    if (request.method === "POST" && action === "cancel") {
      assertMutationOrigin(request);
      await readJson(request);
      return writeJson(response, 200, service.cancel(jobId));
    }
    if (request.method === "POST" && action === "retries") {
      assertMutationOrigin(request);
      const body = (await readJson(request)) as { engineId?: unknown };
      if (typeof body.engineId !== "string") return writeError(response, 400, "INVALID_REQUEST", true);
      return writeJson(response, 201, service.retry(jobId, body.engineId));
    }
    if (request.method === "GET" && action === "result") {
      const result = await service.readResult(jobId);
      if (result === undefined) return writeError(response, 404, "JOB_NOT_FOUND", false);
      response.writeHead(200, {
        "Content-Type": "application/vnd.recordare.musicxml",
        "Content-Disposition": 'attachment; filename="score.mxl"',
        ETag: `"sha256-${result.outputSha256}"`,
        "Content-Length": result.bytes.byteLength,
      });
      response.end(result.bytes);
      return;
    }
    if (request.method === "DELETE" && action === undefined) {
      assertMutationOrigin(request);
      await service.delete(jobId);
      response.writeHead(204).end();
      return;
    }
    writeError(response, 405, "INVALID_REQUEST", false);
  } catch (error) {
    const code = errorCode(error);
    const status =
      code === "UNSUPPORTED_INPUT"
        ? 415
        : code === "FILE_TOO_LARGE"
          ? 413
          : code === "JOB_NOT_FOUND"
            ? 404
            : code.startsWith("JOB_")
              ? 409
              : code === "INVALID_ORIGIN"
                ? 403
                : 400;
    writeError(response, status, code === "INVALID_ORIGIN" ? "INVALID_REQUEST" : code, status < 500);
  }
}

async function parseUpload(
  request: IncomingMessage,
  tempRoot: string,
): Promise<{
  directory: string;
  path: string;
  fileName: string;
  sizeBytes: number;
  inputKind: "pdf" | "image";
  engineId: string;
}> {
  await mkdir(tempRoot, { recursive: true });
  const directory = await mkdtemp(join(tempRoot, "upload-"));
  const path = join(directory, "input");
  let engineId: string | undefined;
  let fileName: string | undefined;
  let sizeBytes = 0;
  let prefix = new Uint8Array();
  let fileOperation: Promise<void> | undefined;
  let limitReached = false;
  try {
    const parser = Busboy({ headers: request.headers, limits: { fields: 1, files: 1, fileSize: MAX_INPUT_BYTES } });
    parser.on("field", (name, value) => {
      if (name === "engineId" && value.length <= 128) engineId = value;
    });
    parser.on("file", (name, stream, info) => {
      if (name !== "input" || fileOperation !== undefined) {
        stream.resume();
        return;
      }
      fileName = basename(info.filename).slice(0, 255);
      const writer = createWriteStream(path, { flags: "wx" });
      stream.on("limit", () => {
        limitReached = true;
      });
      stream.on("data", (chunk: Buffer) => {
        sizeBytes += chunk.byteLength;
        if (prefix.byteLength < 8) {
          prefix = new Uint8Array(Buffer.concat([Buffer.from(prefix), chunk.subarray(0, 8 - prefix.byteLength)]));
        }
      });
      stream.pipe(writer);
      fileOperation = finished(writer);
    });
    request.pipe(parser);
    await new Promise<void>((resolve, reject) => {
      parser.once("close", resolve);
      parser.once("error", reject);
      request.once("aborted", () => reject(new Error("INVALID_REQUEST")));
    });
    await fileOperation;
    if (limitReached || sizeBytes > MAX_INPUT_BYTES) throw new Error("FILE_TOO_LARGE");
    if (engineId === undefined || fileName === undefined || sizeBytes === 0) throw new Error("INVALID_REQUEST");
    const inputKind = detectInputKind(fileName, prefix);
    return { directory, path, fileName, sizeBytes, inputKind, engineId };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

function detectInputKind(fileName: string, prefix: Uint8Array): "pdf" | "image" {
  const lower = fileName.toLowerCase();
  const pdf = Buffer.from(prefix).subarray(0, 5).toString("ascii") === "%PDF-";
  const png = Buffer.from(prefix)
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff;
  if (pdf && lower.endsWith(".pdf")) return "pdf";
  if ((png && lower.endsWith(".png")) || (jpeg && /\.jpe?g$/.test(lower))) return "image";
  throw new Error("UNSUPPORTED_INPUT");
}

function assertMutationOrigin(request: IncomingMessage): void {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (origin === undefined || host === undefined || new URL(origin).host !== host) throw new Error("INVALID_ORIGIN");
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  if (!request.headers["content-type"]?.startsWith("application/json")) throw new Error("INVALID_REQUEST");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > 8192) throw new Error("INVALID_REQUEST");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function errorCode(error: unknown): string {
  if (error instanceof RecognitionStoreError || error instanceof RecognitionObjectStoreError) return error.code;
  if (error instanceof Error && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.message)) return error.message;
  return "INVALID_REQUEST";
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  response.end(body);
}

function writeError(response: ServerResponse, status: number, code: string, recoverable: boolean): void {
  if (response.headersSent) {
    response.end();
    return;
  }
  writeJson(response, status, { error: { code, recoverable } });
}
