export type ResourceProbeStatus = "success" | "failure" | "unsupported";

export type ResourceProbeEntry = {
  status: ResourceProbeStatus;
  detail: string;
};

export type ResourceOriginProbeResult = {
  origin: string;
  isSecureContext: boolean;
  checks: Record<string, ResourceProbeEntry>;
};

export type ResourceOriginProbeCheck = {
  name: string;
  run?: () => Promise<string>;
  unsupportedReason?: string;
};

export async function runResourceOriginProbe(
  checks: ResourceOriginProbeCheck[],
  environment: { origin?: string; isSecureContext?: boolean } = {},
): Promise<ResourceOriginProbeResult> {
  const results: Record<string, ResourceProbeEntry> = {};

  for (const check of checks) {
    if (check.unsupportedReason !== undefined || check.run === undefined) {
      results[check.name] = {
        status: "unsupported",
        detail: check.unsupportedReason ?? "RESOURCE_PROBE_UNSUPPORTED",
      };
      continue;
    }
    try {
      results[check.name] = {
        status: "success",
        detail: await check.run(),
      };
    } catch (error) {
      results[check.name] = {
        status: "failure",
        detail: error instanceof Error ? error.message : "RESOURCE_PROBE_FAILED",
      };
    }
  }

  return {
    origin: environment.origin ?? globalThis.location?.origin ?? "unknown",
    isSecureContext: environment.isSecureContext ?? globalThis.isSecureContext ?? false,
    checks: results,
  };
}

export function createDefaultResourceOriginChecks(): ResourceOriginProbeCheck[] {
  return [
    {
      name: "webCrypto",
      run: async () => {
        await crypto.subtle.digest("SHA-256", new Uint8Array([1, 2, 3]));
        return "SHA-256";
      },
    },
    {
      name: "dynamicImport",
      run: async () => {
        const module = await import("./resource-origin-dynamic");
        return module.resourceOriginDynamicMarker;
      },
    },
    createWorkerCheck(),
    createAudioWorkletCheck(),
    {
      name: "indexedDB",
      run: probeIndexedDbPersistence,
    },
    {
      name: "font",
      run: () => fetchBundledResource("/alphatab/font/Bravura.woff2"),
    },
    {
      name: "soundFont",
      run: () => fetchBundledResource("/alphatab/soundfont/sonivox.sf3"),
    },
  ];
}

function createWorkerCheck(): ResourceOriginProbeCheck {
  if (typeof Worker === "undefined") {
    return { name: "worker", unsupportedReason: "Worker unavailable" };
  }
  return {
    name: "worker",
    run: () =>
      new Promise((resolve, reject) => {
        const worker = new Worker(new URL("/probes/resource-origin-worker.mjs", document.baseURI), {
          type: "module",
        });
        const timeout = setTimeout(() => {
          worker.terminate();
          reject(new Error("WORKER_PROBE_TIMEOUT"));
        }, 3000);
        worker.onmessage = (event: MessageEvent<unknown>) => {
          clearTimeout(timeout);
          worker.terminate();
          if (event.data === "zupulse-worker-ready") resolve("module worker");
          else reject(new Error("WORKER_PROBE_INVALID_RESPONSE"));
        };
        worker.onerror = () => {
          clearTimeout(timeout);
          worker.terminate();
          reject(new Error("WORKER_PROBE_LOAD_FAILED"));
        };
        worker.postMessage("probe");
      }),
  };
}

function createAudioWorkletCheck(): ResourceOriginProbeCheck {
  const AudioContextConstructor = globalThis.AudioContext;
  if (AudioContextConstructor === undefined) {
    return { name: "audioWorklet", unsupportedReason: "AudioContext unavailable" };
  }
  return {
    name: "audioWorklet",
    run: async () => {
      const context = new AudioContextConstructor();
      try {
        if (context.audioWorklet === undefined) throw new Error("AudioWorklet unavailable");
        await context.audioWorklet.addModule(new URL("/probes/resource-origin-worklet.mjs", document.baseURI));
        return "module loaded";
      } finally {
        await context.close();
      }
    },
  };
}

async function fetchBundledResource(path: string): Promise<string> {
  const response = await fetch(new URL(path, document.baseURI));
  if (!response.ok && response.status !== 0) throw new Error(`RESOURCE_FETCH_FAILED:${path}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0) throw new Error(`RESOURCE_EMPTY:${path}`);
  return `${bytes.byteLength} bytes`;
}

async function probeIndexedDbPersistence(): Promise<string> {
  if (globalThis.indexedDB === undefined) throw new Error("IndexedDB unavailable");
  const database = await openProbeDatabase();
  try {
    const existing = await readMarker(database);
    if (existing !== undefined) return "persisted";
    await writeMarker(database, crypto.randomUUID());
    return "created";
  } finally {
    database.close();
  }
}

function openProbeDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("zupulse-resource-origin-probe", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("probe");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("INDEXEDDB_OPEN_FAILED"));
  });
}

function readMarker(database: IDBDatabase): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const request = database.transaction("probe").objectStore("probe").get("marker");
    request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : undefined);
    request.onerror = () => reject(new Error("INDEXEDDB_READ_FAILED"));
  });
}

function writeMarker(database: IDBDatabase, marker: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("probe", "readwrite");
    transaction.objectStore("probe").put(marker, "marker");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error("INDEXEDDB_WRITE_FAILED"));
    transaction.onabort = () => reject(new Error("INDEXEDDB_WRITE_ABORTED"));
  });
}
