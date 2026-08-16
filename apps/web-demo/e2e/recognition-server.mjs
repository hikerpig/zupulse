import { createServer } from "node:http";

const port = Number(process.env.RECOGNITION_E2E_PORT ?? "4174");
const jobId = "00000000-0000-4000-8000-000000000001";
const attemptId = "00000000-0000-4000-8000-000000000002";
const createdAt = "2026-08-16T00:00:00.000Z";
let created = false;
let status = "queued";

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname.endsWith("/capabilities")) {
    return json(response, 200, {
      schemaVersion: "1.0.0",
      engines: [{ id: "audiveris", version: "5.11.0", available: true, inputKinds: ["pdf", "image"] }],
    });
  }
  if (request.method === "GET" && url.pathname === "/api/recognition/v1/jobs") {
    return json(response, 200, { items: created ? [summary()] : [] });
  }
  if (request.method === "POST" && url.pathname === "/api/recognition/v1/jobs") {
    for await (const _chunk of request) {
      // Consume the multipart request before publishing the queued snapshot.
    }
    created = true;
    status = "queued";
    return json(response, 201, snapshot());
  }
  if (request.method === "GET" && url.pathname.endsWith("/events")) {
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    writeSnapshot(response);
    setTimeout(() => {
      status = "running";
      writeSnapshot(response, "recognize");
    }, 50);
    setTimeout(() => {
      status = "succeeded";
      writeSnapshot(response, "export");
    }, 120);
    return;
  }
  if (request.method === "GET" && url.pathname.endsWith("/result")) {
    const bytes = Buffer.from("PK fake-mxl");
    response.writeHead(200, { "Content-Type": "application/vnd.recordare.musicxml", "Content-Length": bytes.length });
    return response.end(bytes);
  }
  if (request.method === "GET" && url.pathname === `/api/recognition/v1/jobs/${jobId}`) {
    return json(response, 200, detail());
  }
  response.writeHead(404).end();
}).listen(port, "127.0.0.1");

function snapshot(stage) {
  return {
    jobId,
    attemptId,
    attemptNumber: 1,
    status,
    ...(stage === undefined ? {} : { stage }),
    input: { fileName: "browser-score.pdf", sizeBytes: 9, inputKind: "pdf", pageCount: 1 },
    ...(status === "succeeded" ? { engine: { id: "audiveris", version: "5.11.0" } } : {}),
    createdAt,
    updatedAt: createdAt,
    expiresAt: "2026-09-15T00:00:00.000Z",
  };
}

function summary() {
  return {
    jobId,
    status,
    input: snapshot().input,
    attemptCount: 1,
    engineId: "audiveris",
    createdAt,
    updatedAt: createdAt,
    expiresAt: "2026-09-15T00:00:00.000Z",
  };
}

function detail() {
  return {
    snapshot: snapshot(status === "succeeded" ? "export" : status === "running" ? "recognize" : undefined),
    attempts: [{ attemptId, attemptNumber: 1, status, engineId: "audiveris", createdAt }],
    ...(status === "succeeded"
      ? {
          result: {
            fileName: "score.mxl",
            outputSha256: "a".repeat(64),
            validation: { readiness: { harmony: "ready", musicXml: "ready" }, diagnostics: [] },
          },
        }
      : {}),
  };
}

function writeSnapshot(response, stage) {
  response.write(`event: snapshot\ndata: ${JSON.stringify({ kind: "snapshot", snapshot: snapshot(stage) })}\n\n`);
}

function json(response, statusCode, value) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  response.end(body);
}
