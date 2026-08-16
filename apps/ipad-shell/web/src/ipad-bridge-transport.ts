import {
  BRIDGE_SCHEMA_VERSION,
  bridgeResponseSchemas,
  createBridgeRequest,
  type BridgeRequestType,
} from "@zupulse/web-core";

export type NativeMessageHandler = {
  postMessage(value: unknown): Promise<unknown>;
};

export type IpadBuildMetadata = {
  appVersion: string;
  bridgeVersion: string;
  buildHash: string;
};

type PendingRequest = {
  type: BridgeRequestType;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export class IpadBridgeTransport {
  readonly #handler: NativeMessageHandler;
  readonly #timeoutMs: number;
  readonly #pending = new Map<string, PendingRequest>();
  #destroyed = false;

  constructor(handler: NativeMessageHandler, options: { timeoutMs?: number } = {}) {
    this.#handler = handler;
    this.#timeoutMs = options.timeoutMs ?? 5000;
  }

  get pendingRequestCount(): number {
    return this.#pending.size;
  }

  request<T extends BridgeRequestType>(type: T, payload: unknown): Promise<unknown> {
    if (this.#destroyed) return Promise.reject(new Error("BRIDGE_TRANSPORT_DESTROYED"));

    const correlationId = crypto.randomUUID();
    const request = createBridgeRequest(type, correlationId, payload as never);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.#pending.delete(correlationId)) return;
        reject(new Error("BRIDGE_TIMEOUT"));
      }, this.#timeoutMs);
      this.#pending.set(correlationId, { type, resolve, reject, timeout });

      Promise.resolve(this.#handler.postMessage(request)).then(
        (response) => this.#settleResponse(correlationId, response),
        (error: unknown) => this.#settleFailure(correlationId, error),
      );
    });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("BRIDGE_TRANSPORT_DESTROYED"));
    }
    this.#pending.clear();
  }

  #settleResponse(correlationId: string, value: unknown): void {
    const pending = this.#pending.get(correlationId);
    if (!pending || this.#destroyed) return;
    this.#pending.delete(correlationId);
    clearTimeout(pending.timeout);

    try {
      const response = requireResponseEnvelope(value);
      if (response.correlationId !== correlationId) throw new Error("BRIDGE_CORRELATION_MISMATCH");
      if (response.bridgeVersion !== BRIDGE_SCHEMA_VERSION) throw new Error("BRIDGE_VERSION_MISMATCH");
      if (response.type !== pending.type) throw new Error("BRIDGE_RESPONSE_TYPE_MISMATCH");
      pending.resolve(bridgeResponseSchemas[pending.type].parse(response.payload));
    } catch (error) {
      pending.reject(asError(error));
    }
  }

  #settleFailure(correlationId: string, value: unknown): void {
    const pending = this.#pending.get(correlationId);
    if (!pending || this.#destroyed) return;
    this.#pending.delete(correlationId);
    clearTimeout(pending.timeout);
    pending.reject(asError(value));
  }
}

export async function bootstrapIpadApplication(options: {
  root: HTMLElement;
  metadata: IpadBuildMetadata;
  handler: NativeMessageHandler;
  mount: (transport: IpadBridgeTransport) => void | Promise<void>;
  timeoutMs?: number;
}): Promise<boolean> {
  const transport = new IpadBridgeTransport(
    options.handler,
    options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs },
  );

  try {
    if (options.metadata.bridgeVersion !== BRIDGE_SCHEMA_VERSION) throw new Error("BRIDGE_VERSION_MISMATCH");
    const response = (await transport.request("app.handshake", {
      appVersion: options.metadata.appVersion,
      rendererBuildHash: options.metadata.buildHash,
    })) as {
      appVersion: string;
      bridgeVersion: string;
      rendererBuildHash: string;
    };
    if (
      response.appVersion !== options.metadata.appVersion ||
      response.bridgeVersion !== options.metadata.bridgeVersion ||
      response.rendererBuildHash !== options.metadata.buildHash
    ) {
      throw new Error("BRIDGE_BUILD_MISMATCH");
    }
    await options.mount(transport);
    return true;
  } catch (error) {
    transport.destroy();
    renderStartupError(options.root, asError(error));
    return false;
  }
}

export async function loadIpadBuildMetadata(fetchManifest: typeof fetch = fetch): Promise<IpadBuildMetadata> {
  const response = await fetchManifest(new URL("./asset-manifest.json", document.baseURI));
  if (!response.ok && response.status !== 0) throw new Error("IPAD_ASSET_MANIFEST_UNAVAILABLE");
  const value = (await response.json()) as Partial<IpadBuildMetadata>;
  if (
    typeof value.appVersion !== "string" ||
    typeof value.bridgeVersion !== "string" ||
    typeof value.buildHash !== "string" ||
    value.appVersion.length === 0 ||
    value.bridgeVersion.length === 0 ||
    value.buildHash.length === 0
  ) {
    throw new Error("IPAD_ASSET_MANIFEST_INVALID");
  }
  return {
    appVersion: value.appVersion,
    bridgeVersion: value.bridgeVersion,
    buildHash: value.buildHash,
  };
}

function renderStartupError(root: HTMLElement, error: Error): void {
  root.replaceChildren();
  root.setAttribute("role", "alert");
  const title = document.createElement("h1");
  title.textContent = "无法启动逐拍";
  const detail = document.createElement("p");
  detail.textContent = error.message;
  root.append(title, detail);
}

function requireResponseEnvelope(value: unknown): {
  bridgeVersion: string;
  correlationId: string;
  type: string;
  payload: unknown;
} {
  if (!isRecord(value)) throw new Error("INVALID_BRIDGE_RESPONSE");
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "bridgeVersion,correlationId,payload,type") {
    throw new Error("INVALID_BRIDGE_RESPONSE");
  }
  if (
    typeof value.bridgeVersion !== "string" ||
    typeof value.correlationId !== "string" ||
    typeof value.type !== "string"
  ) {
    throw new Error("INVALID_BRIDGE_RESPONSE");
  }
  return {
    bridgeVersion: value.bridgeVersion,
    correlationId: value.correlationId,
    type: value.type,
    payload: value.payload,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error("BRIDGE_NATIVE_FAILURE");
}
