import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createEngineRegistry, PdfOmrError, runPdfOmrPipeline } from "@zupulse/pdf-omr-cli/pipeline";
import type { RecognitionEngineOption } from "@zupulse/web-core";
import { createRecognitionHttpServer } from "./http-server";
import { RecognitionJobStore } from "./job-store";
import { reconcileRecognitionStorage } from "./maintenance";
import { RecognitionEventHub } from "./recognition-events";
import { RecognitionWorker } from "./recognition-worker";
import { createS3RecognitionObjectStore } from "./s3-object-store";

const databasePath = resolve(process.env.RECOGNITION_DATABASE_PATH ?? "data/recognition.sqlite");
const tempRoot = resolve(process.env.RECOGNITION_TEMP_ROOT ?? "data/tmp");
const bucket = requiredEnvironment("RECOGNITION_S3_BUCKET");
const region = process.env.RECOGNITION_S3_REGION ?? "us-east-1";
const host = process.env.RECOGNITION_HOST ?? "127.0.0.1";
const port = parsePort(process.env.RECOGNITION_PORT ?? "4174");

await mkdir(dirname(databasePath), { recursive: true });
const store = new RecognitionJobStore(databasePath);
const objects = createS3RecognitionObjectStore({
  bucket,
  region,
  ...(process.env.RECOGNITION_S3_ENDPOINT === undefined
    ? {}
    : { endpoint: process.env.RECOGNITION_S3_ENDPOINT, forcePathStyle: true }),
});
const registry = createEngineRegistry();
const engines = await inspectEngines(registry);
if (!engines.some((engine) => engine.available)) throw new Error("No recognition engine is available");
await verifyObjectStorage(objects);
await rm(tempRoot, { recursive: true, force: true });
await mkdir(tempRoot, { recursive: true });
const events = new RecognitionEventHub();
const worker = new RecognitionWorker({
  store,
  objects,
  tempRoot,
  events,
  runPipeline: (request) => runPdfOmrPipeline({ ...request, engineRegistry: registry }),
});

let draining = false;
const drain = async () => {
  if (draining) return;
  draining = true;
  try {
    while (await worker.runNext()) {}
  } finally {
    draining = false;
  }
};

await reconcileRecognitionStorage({ store, objects });
const maintenance = setInterval(
  () =>
    void reconcileRecognitionStorage({ store, objects }).catch(() => {
      process.stderr.write("recognition storage maintenance failed\n");
    }),
  60 * 60 * 1000,
);
maintenance.unref();
const server = createRecognitionHttpServer({
  store,
  objects,
  tempRoot,
  engines,
  events,
  onQueued: () => void drain(),
  onCancelRunning: (jobId) => worker.cancel(jobId),
});
server.listen(port, host, () => {
  process.stdout.write(`recognition server listening on http://${host}:${port}\n`);
  void drain();
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    clearInterval(maintenance);
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}

async function inspectEngines(registry: ReturnType<typeof createEngineRegistry>): Promise<RecognitionEngineOption[]> {
  const definitions = [
    { id: "audiveris", inputKinds: ["pdf", "image"] },
    { id: "transcoda", inputKinds: ["pdf"] },
    { id: "legato", inputKinds: ["pdf"] },
    { id: "rokot", inputKinds: ["pdf"] },
  ] as const;
  return Promise.all(
    definitions.map(async (definition) => {
      try {
        const environment = await registry.get(definition.id).inspectEnvironment();
        return { ...definition, inputKinds: [...definition.inputKinds], version: environment.version, available: true };
      } catch (error) {
        return {
          ...definition,
          inputKinds: [...definition.inputKinds],
          version: "unknown",
          available: false,
          reason:
            error instanceof PdfOmrError && typeof error.context?.reason === "string"
              ? error.context.reason
              : "engine-inspection-failed",
        };
      }
    }),
  );
}

async function verifyObjectStorage(objects: ReturnType<typeof createS3RecognitionObjectStore>): Promise<void> {
  const key = "jobs/health-check/result.json";
  const bytes = new TextEncoder().encode('{"status":"ok"}');
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  try {
    await objects.putBytes(key, bytes);
    await objects.getBytes(key, sha256);
  } finally {
    await objects.delete([key]);
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parsePort(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw new Error("RECOGNITION_PORT is invalid");
  return parsed;
}
