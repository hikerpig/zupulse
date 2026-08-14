import {
  BRIDGE_SCHEMA_VERSION,
  bridgeRequestSchema,
  capabilitiesSchema,
  parseBridgeResponse,
  type BridgeRequest,
  type BridgeRequestType,
  type Capabilities,
} from "@zupulse/web-core";
import type { LocaleState } from "@zupulse/app-i18n";

type RequestFor<T extends BridgeRequestType> = Extract<BridgeRequest, { type: T }>;

export type BridgeHandlers = Partial<{
  [T in BridgeRequestType]: (request: RequestFor<T>) => unknown | Promise<unknown>;
}>;

export type BridgeDispatcherOptions = {
  appVersion: string;
  rendererBuildHash: string;
  locale: LocaleState;
  capabilities?: Capabilities;
  handlers?: BridgeHandlers;
};

export class BridgeDispatchError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly recoverable: boolean,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "BridgeDispatchError";
  }
}

export function assertBridgeAppSender(senderUrl: string): void {
  assertAppSender(senderUrl);
}

export function createDesktopCapabilities(
  pdfOmrEngines: ReadonlyArray<{
    id: string;
    version: string;
    available: boolean;
    inputKinds: readonly ("pdf" | "image")[];
    reason?: string;
  }>,
): Capabilities {
  return capabilitiesSchema.parse({
    pdfOmrWorkbench: true,
    recognitionProviderSettings: true,
    pdfOmrEngines,
    fileAccess: {
      openExternalFile: true,
      persistentFileReferences: false,
      localLibraryImport: true,
      droppedFileImport: true,
    },
    storage: { sqliteIndex: true, sidecarPayload: true },
    harmonyAnalysis: true,
    sync: { available: false, provider: "none" },
    audio: { webAudio: true, nativeBridge: false },
    localization: { changeLocale: true },
    externalNavigation: { openUrl: true },
  });
}

const DEFAULT_CAPABILITIES = createDesktopCapabilities([]);

export async function dispatchBridgeRequest(
  input: { senderUrl: string; value: unknown },
  options: BridgeDispatcherOptions,
): Promise<unknown> {
  assertAppSender(input.senderUrl);

  const parsed = bridgeRequestSchema.safeParse(input.value);
  if (!parsed.success) {
    throw new BridgeDispatchError(
      "INVALID_BRIDGE_MESSAGE",
      "Bridge request failed schema validation",
      false,
      parsed.error.issues,
    );
  }
  const request = parsed.data;

  if (request.type === "app.handshake") {
    if (
      request.payload.appVersion !== options.appVersion ||
      request.payload.rendererBuildHash !== options.rendererBuildHash
    ) {
      throw new BridgeDispatchError("BRIDGE_VERSION_MISMATCH", "Renderer and main bridge versions do not match", false);
    }
    return parseBridgeResponse(request.type, {
      appVersion: options.appVersion,
      bridgeVersion: BRIDGE_SCHEMA_VERSION,
      rendererBuildHash: options.rendererBuildHash,
      capabilities: options.capabilities ?? DEFAULT_CAPABILITIES,
      locale: options.locale,
    });
  }

  const handler = options.handlers?.[request.type] as
    ((value: BridgeRequest) => unknown | Promise<unknown>) | undefined;
  if (!handler) {
    throw new BridgeDispatchError("BRIDGE_HANDLER_UNAVAILABLE", `No handler registered for ${request.type}`, true);
  }
  return parseBridgeResponse(request.type, await handler(request));
}

function assertAppSender(senderUrl: string): void {
  let url: URL;
  try {
    url = new URL(senderUrl);
  } catch {
    throw new BridgeDispatchError("INVALID_BRIDGE_SENDER", "Invalid bridge sender URL", false);
  }
  if (
    url.protocol !== "zupulse:" ||
    url.host !== "app" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== ""
  ) {
    throw new BridgeDispatchError("INVALID_BRIDGE_SENDER", "Bridge sender is not the app origin", false);
  }
}
