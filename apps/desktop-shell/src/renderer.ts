import { createAppI18n, resolveLocale, type LocaleState } from "@zupulse/app-i18n";
import {
  BridgePlaybackPersistence,
  bridgeEventSchema,
  createGpFormatAdapter,
  createMusicXmlAdapter,
  createBridgeRequest,
  parseBridgeResponse,
  type SheetLibraryRepository,
  type LibraryScoreId,
  type LibraryScoreIdentity,
  type LibraryScore,
  type LibraryScoreSummary,
  type ValidatedLibraryScoreDraft,
  type LibraryMetadata,
  type StoredScoreFile,
  type HarmonyAnalysisDocument,
  type HarmonyAnalysisRepository,
  type HarmonyAnalysisSaveResult,
  type PlaybackPersistence,
  type RecognitionProviderSummary,
  type TelemetryPort,
} from "@zupulse/web-core";
import "@zupulse/web-viewer/styles.css";
import {
  bundledSampleScores,
  createDefaultOpenSession,
  createSampleImportSource,
  mountViewerApp,
  type ViewerAppHandle,
  type ViewerHost,
  type PdfOmrWorkbenchPort,
  type RecognitionSettingsPort,
} from "@zupulse/web-viewer";
import { createDesktopDroppedImportSources, DesktopScoreFileGateway } from "./desktop-score-file-gateway";
import { createDesktopDiagnosticReporter } from "./desktop-diagnostic-reporter";
import { createDesktopExternalNavigation } from "./desktop-external-navigation";
import { createDesktopTelemetryPort } from "./telemetry/desktop-telemetry";
import { pdfOmrEngineLabel, providerEngineOption, synchronizePdfOmrEngine } from "./desktop-pdf-omr-engines";

const startedAt = performance.now();
document.documentElement.classList.add("desktop-shell");
installGlobalDragAndDropGuard(document);
let activeTelemetry: TelemetryPort | undefined;

function createDelegatingTelemetryPort(getCurrent: () => TelemetryPort): TelemetryPort {
  return {
    capture: (event) => getCurrent().capture(event),
    captureException: (error, context) => getCurrent().captureException(error, context),
    flush: (deadlineMs) => getCurrent().flush(deadlineMs),
  };
}

async function start(): Promise<void> {
  const bridge = window.zupulseBridge;
  if (!bridge) throw new Error("DESKTOP_BRIDGE_UNAVAILABLE");

  const handshake = createBridgeRequest("app.handshake", crypto.randomUUID(), {
    appVersion: __APP_VERSION__,
    rendererBuildHash: __RENDERER_BUILD_HASH__,
  });
  const response = parseBridgeResponse(handshake.type, await bridge.request(handshake));
  if (response.appVersion !== __APP_VERSION__ || response.rendererBuildHash !== __RENDERER_BUILD_HASH__) {
    throw new Error("BRIDGE_VERSION_MISMATCH");
  }
  type RendererTelemetryContext = {
    enabled: boolean;
    installationId?: string;
    applicationSessionId?: string;
  };
  const createTelemetry = (context: RendererTelemetryContext) =>
    createDesktopTelemetryPort({
      context,
      runtime: "renderer",
      appVersion: __APP_VERSION__,
      buildId: __RENDERER_BUILD_HASH__,
      releaseChannel: __TELEMETRY_RELEASE_CHANNEL__,
      projectToken: __POSTHOG_PROJECT_TOKEN__,
      apiHost: __POSTHOG_API_HOST__,
      effectiveLocale: response.locale.effectiveLocale,
    });
  const initialTelemetryContext: RendererTelemetryContext = response.telemetry
    ? {
        enabled: response.telemetry.enabled,
        ...(response.telemetry.installationId === undefined
          ? {}
          : { installationId: response.telemetry.installationId }),
        ...(response.telemetry.applicationSessionId === undefined
          ? {}
          : { applicationSessionId: response.telemetry.applicationSessionId }),
      }
    : { enabled: false };
  let currentTelemetry = createTelemetry(initialTelemetryContext);
  const telemetry = createDelegatingTelemetryPort(() => currentTelemetry);
  activeTelemetry = telemetry;
  window.addEventListener("error", (event) =>
    telemetry.captureException(event.error ?? new Error(event.message), { runtime: "renderer", handled: false }),
  );
  window.addEventListener("unhandledrejection", (event) =>
    telemetry.captureException(event.reason, { runtime: "renderer", handled: false }),
  );
  let telemetryState = response.telemetry ?? { schemaVersion: 1 as const, enabled: false, noticeAcknowledged: false };
  const telemetryControl = {
    getState: () => ({
      available: response.capabilities.telemetry?.available === true,
      enabled: telemetryState.enabled,
      noticeAcknowledged: telemetryState.noticeAcknowledged,
    }),
    acknowledgeNotice: async () => {
      const request = createBridgeRequest("app.telemetry.setPreference", crypto.randomUUID(), {
        enabled: telemetryState.enabled,
      });
      telemetryState = parseBridgeResponse(request.type, await bridge.request(request));
    },
    setPreference: async (enabled: boolean) => {
      const request = createBridgeRequest("app.telemetry.setPreference", crypto.randomUUID(), { enabled });
      telemetryState = parseBridgeResponse(request.type, await bridge.request(request));
      currentTelemetry = createTelemetry({
        enabled: telemetryState.enabled,
        ...(telemetryState.installationId === undefined ? {} : { installationId: telemetryState.installationId }),
        ...(telemetryState.applicationSessionId === undefined
          ? {}
          : { applicationSessionId: telemetryState.applicationSessionId }),
      });
      if (telemetryState.enabled) currentTelemetry.capture({ name: "application_session_started" });
    },
  };

  let appHandle: ViewerAppHandle | undefined;
  const acknowledgeLifecycle = async (state: "suspend" | "prepare-close") => {
    if (!appHandle) throw new Error("VIEWER_NOT_READY");
    if (state === "suspend") await appHandle.pauseAndFlush();
    else await appHandle.destroy();
    await telemetry.flush(300);
    const ack = createBridgeRequest("app.lifecycleAck", crypto.randomUUID(), { state });
    parseBridgeResponse(ack.type, await bridge.request(ack));
  };
  const host = createElectronHost(
    bridge,
    acknowledgeLifecycle,
    response.capabilities.externalNavigation?.openUrl === true,
    telemetry,
  );
  const persistence = new BridgePlaybackPersistence(bridge);
  const root = document.getElementById("root");
  if (!root) throw new Error("VIEWER_ROOT_MISSING");
  const pdfOmr = createDesktopPdfOmrPort(bridge, response.capabilities.pdfOmrEngines);
  const recognitionSettings = createDesktopRecognitionSettingsPort(
    bridge,
    pdfOmr.synchronizeProviders,
    pdfOmr.synchronizeProvider,
  );
  appHandle = mountViewerApp(root, {
    host: { ...host, telemetry },
    telemetryControl,
    initialSurface: "library",
    startupStartedAt: startedAt,
    capabilities: {
      harmonyAnalysis: response.capabilities.harmonyAnalysis ?? false,
      pdfOmrWorkbench: response.capabilities.pdfOmrWorkbench ?? false,
      recognitionProviderSettings: response.capabilities.recognitionProviderSettings ?? false,
    },
    localeHost: createDesktopLocaleHost(bridge, response.locale),
    openSession: createDefaultOpenSession(document, persistence),
    openPdfOmrPreview: (file, domBindings) =>
      createDefaultOpenSession(document, ephemeralPlaybackPersistence())(file, undefined, domBindings),
    pdfOmr,
    recognitionSettings,
    library: {
      repository: new DesktopLibraryRepository(bridge),
      gateway: new DesktopScoreFileGateway(bridge),
      adapters: [createGpFormatAdapter(), createMusicXmlAdapter()],
      createDroppedImportSources: (files) => createDesktopDroppedImportSources(bridge, files),
      sampleSources: bundledSampleScores.map((sample) => ({
        sample,
        createSource: () =>
          createSampleImportSource(sample, async () =>
            Uint8Array.from(atob(__BUNDLED_SAMPLE_BASE64__), (character) => character.charCodeAt(0)),
          ),
      })),
    },
  });
  telemetry.capture({ name: "application_session_started" });
}

function createDesktopRecognitionSettingsPort(
  bridge: NonNullable<Window["zupulseBridge"]>,
  synchronizeProviders: (providers: readonly RecognitionProviderSummary[]) => void,
  synchronizeProvider: (provider: RecognitionProviderSummary) => void,
): RecognitionSettingsPort {
  return {
    async list() {
      const request = createBridgeRequest("recognitionSettings.list", crypto.randomUUID(), {});
      const providers = parseBridgeResponse(request.type, await bridge.request(request)).providers;
      synchronizeProviders(providers);
      return providers;
    },
    async selectResource(providerId, fieldId, path) {
      const request = createBridgeRequest("recognitionSettings.selectResource", crypto.randomUUID(), {
        providerId,
        fieldId,
        ...(path === undefined ? {} : { path }),
      } as never);
      const provider = parseBridgeResponse(request.type, await bridge.request(request));
      return provider;
    },
    async save(providerId, fields) {
      const request = createBridgeRequest("recognitionSettings.save", crypto.randomUUID(), {
        providerId,
        fields,
      } as never);
      const provider = parseBridgeResponse(request.type, await bridge.request(request));
      synchronizeProvider(provider);
      return provider;
    },
    async clear(providerId) {
      const request = createBridgeRequest("recognitionSettings.clear", crypto.randomUUID(), { providerId });
      const provider = parseBridgeResponse(request.type, await bridge.request(request));
      synchronizeProvider(provider);
      return provider;
    },
  };
}

function createDesktopPdfOmrPort(
  bridge: NonNullable<Window["zupulseBridge"]>,
  configuredEngines:
    | ReadonlyArray<{
        id: string;
        version: string;
        available: boolean;
        inputKinds: readonly ("pdf" | "image")[];
        reason?: string | undefined;
      }>
    | undefined,
): PdfOmrWorkbenchPort & {
  synchronizeProviders(providers: readonly RecognitionProviderSummary[]): void;
  synchronizeProvider(provider: RecognitionProviderSummary): void;
} {
  const engines = (configuredEngines ?? []).map((engine) => ({
    id: engine.id,
    version: engine.version,
    available: engine.available,
    label: pdfOmrEngineLabel(engine.id),
    inputKinds: engine.inputKinds,
    ...(engine.reason === undefined ? {} : { reason: engine.reason }),
  }));
  return {
    engines,
    synchronizeProviders(providers) {
      engines.splice(0, engines.length, ...providers.map(providerEngineOption));
    },
    synchronizeProvider(provider) {
      synchronizePdfOmrEngine(engines, provider);
    },
    async select() {
      const request = createBridgeRequest("pdfOmr.select", crypto.randomUUID(), {});
      return parseBridgeResponse(request.type, await bridge.request(request));
    },
    async start(fileToken, engineId) {
      const request = createBridgeRequest("pdfOmr.start", crypto.randomUUID(), { fileToken, engineId });
      return parseBridgeResponse(request.type, await bridge.request(request));
    },
    async retry(jobId, engineId) {
      const request = createBridgeRequest("pdfOmr.retry", crypto.randomUUID(), { jobId, engineId });
      return parseBridgeResponse(request.type, await bridge.request(request));
    },
    async cancel(jobId) {
      const request = createBridgeRequest("pdfOmr.cancel", crypto.randomUUID(), { jobId });
      parseBridgeResponse(request.type, await bridge.request(request));
    },
    async getSnapshot() {
      const request = createBridgeRequest("pdfOmr.getSnapshot", crypto.randomUUID(), {});
      return parseBridgeResponse(request.type, await bridge.request(request)).snapshot;
    },
    async readResult(jobId) {
      const request = createBridgeRequest("pdfOmr.readResult", crypto.randomUUID(), { jobId });
      const response = parseBridgeResponse(request.type, await bridge.request(request));
      return response.status === "available" ? response : null;
    },
    async readFailedValidation(jobId) {
      const request = createBridgeRequest("pdfOmr.readResult", crypto.randomUUID(), { jobId });
      const response = parseBridgeResponse(request.type, await bridge.request(request));
      return response.status === "failed-validation" ? response.validation : null;
    },
    async readInputPreview(jobId, pageIndex) {
      const request = createBridgeRequest("pdfOmr.readInputPreview", crypto.randomUUID(), { jobId, pageIndex });
      const response = parseBridgeResponse(request.type, await bridge.request(request));
      return response.status === "available" ? response : null;
    },
    async readSelectedInputPreview(fileToken, pageIndex) {
      const request = createBridgeRequest("pdfOmr.readInputPreview", crypto.randomUUID(), { fileToken, pageIndex });
      const response = parseBridgeResponse(request.type, await bridge.request(request));
      return response.status === "available" ? response : null;
    },
    async selectMidi() {
      const request = createBridgeRequest("pdfOmr.selectMidi", crypto.randomUUID(), {});
      return parseBridgeResponse(request.type, await bridge.request(request));
    },
    async analyzeMidi(jobId, fileToken) {
      const request = createBridgeRequest("pdfOmr.analyzeMidi", crypto.randomUUID(), { jobId, fileToken });
      const response = parseBridgeResponse(request.type, await bridge.request(request));
      return {
        midiFileName: response.midiFileName,
        compatibility: response.compatibility,
        proposals: response.proposals.map((proposal) => ({
          id: proposal.id,
          type: proposal.type,
          confidence: proposal.confidence,
          reviewability: proposal.reviewability,
          ...(proposal.measureIndex === undefined ? {} : { measureIndex: proposal.measureIndex }),
          ...(proposal.before === undefined
            ? {}
            : {
                before: {
                  ...proposal.before,
                  alter: proposal.before.alter as -2 | -1 | 0 | 1 | 2,
                },
              }),
          ...(proposal.suggestedSoundingMidi === undefined
            ? {}
            : { suggestedSoundingMidi: proposal.suggestedSoundingMidi }),
        })),
      };
    },
    async applyMidiCorrections(jobId, decisions) {
      const request = createBridgeRequest("pdfOmr.applyMidiCorrections", crypto.randomUUID(), {
        jobId,
        decisions: [...decisions],
      });
      return parseBridgeResponse(request.type, await bridge.request(request));
    },
    async exportResult(jobId) {
      const result = await this.readResult(jobId);
      if (result === null) return "cancelled";
      const request = createBridgeRequest("file.save", crypto.randomUUID(), {
        fileName: result.fileName,
        bytes: Uint8Array.from(result.bytes),
      });
      const status = parseBridgeResponse(request.type, await bridge.request(request)).status;
      if (status === "saved") {
        const mark = createBridgeRequest("pdfOmr.markExported", crypto.randomUUID(), { jobId });
        parseBridgeResponse(mark.type, await bridge.request(mark));
      }
      return status;
    },
    subscribe(listener) {
      return bridge.subscribe((value) => {
        const event = bridgeEventSchema.parse(value);
        if (event.type !== "pdfOmr.progress") return;
        const request = createBridgeRequest("pdfOmr.getSnapshot", crypto.randomUUID(), {});
        void bridge
          .request(request)
          .then((value) => {
            const response = parseBridgeResponse(request.type, value);
            if (response.snapshot?.jobId === event.payload.jobId) listener(response.snapshot);
          })
          .catch(() => undefined);
      });
    },
  };
}

function ephemeralPlaybackPersistence(): PlaybackPersistence & {
  forLibraryScore(libraryScoreId: string): PlaybackPersistence;
} {
  const persistence: PlaybackPersistence & { forLibraryScore(libraryScoreId: string): PlaybackPersistence } = {
    async readSidecar() {
      return undefined;
    },
    async writeSidecar() {},
    async readResume() {
      return undefined;
    },
    async writeResume() {},
    forLibraryScore() {
      return persistence;
    },
  };
  return persistence;
}

function createDesktopLocaleHost(bridge: NonNullable<Window["zupulseBridge"]>, initialState: LocaleState) {
  return {
    initialState,
    async setPreference(preference: "system" | "zh-CN" | "en-US") {
      const request = createBridgeRequest("app.locale.setPreference", crypto.randomUUID(), { preference });
      return parseBridgeResponse(request.type, await bridge.request(request));
    },
  };
}

class DesktopLibraryRepository implements SheetLibraryRepository, HarmonyAnalysisRepository {
  constructor(private readonly bridge: NonNullable<Window["zupulseBridge"]>) {}
  async initialize(): Promise<void> {}
  async list(): Promise<readonly LibraryScoreSummary[]> {
    return (await this.request("library.list", {})).scores;
  }
  async get(id: LibraryScoreId): Promise<LibraryScore | undefined> {
    return (await this.request("library.get", { id })).score;
  }
  async findByIdentity(scoreIdentity: LibraryScoreIdentity): Promise<LibraryScore | undefined> {
    return (await this.request("library.find", { scoreIdentity })).score;
  }
  async add(draft: ValidatedLibraryScoreDraft): Promise<{ status: "created" | "existing"; score: LibraryScore }> {
    return this.request("library.add", {
      draft: {
        ...draft,
        file: { ...draft.file, bytes: new Uint8Array(draft.file.bytes) },
        ...(draft.parsedTitle === undefined ? {} : { parsedTitle: draft.parsedTitle }),
        ...(draft.parsedArtist === undefined ? {} : { parsedArtist: draft.parsedArtist }),
        ...(draft.durationMs === undefined ? {} : { durationMs: draft.durationMs }),
      },
    });
  }
  async readScore(id: LibraryScoreId): Promise<StoredScoreFile> {
    return this.request("library.readScore", { id });
  }
  async updateMetadata(id: LibraryScoreId, patch: LibraryMetadata): Promise<LibraryScore> {
    return (await this.request("library.updateMetadata", { id, patch })).score;
  }
  async setFavorite(id: LibraryScoreId, favorite: boolean): Promise<void> {
    await this.request("library.setFavorite", { id, favorite });
  }
  async markOpened(id: LibraryScoreId, openedAt: string): Promise<void> {
    await this.request("library.markOpened", { id, openedAt });
  }
  async delete(id: LibraryScoreId): Promise<void> {
    await this.request("library.delete", { id });
  }
  async read(libraryScoreId: LibraryScoreId): Promise<HarmonyAnalysisDocument | null> {
    return (await this.request("harmonyAnalysis.read", { libraryScoreId })).document;
  }
  async save(input: {
    document: HarmonyAnalysisDocument;
    expectedDocumentVersion: number | null;
  }): Promise<HarmonyAnalysisSaveResult> {
    return this.request("harmonyAnalysis.save", input);
  }
  private async request(type: any, payload: any): Promise<any> {
    const request = createBridgeRequest(type as never, crypto.randomUUID(), payload as never);
    return parseBridgeResponse(type as never, await this.bridge.request(request));
  }
}

function createElectronHost(
  bridge: NonNullable<Window["zupulseBridge"]>,
  acknowledgeLifecycle: (state: "suspend" | "prepare-close") => Promise<void>,
  canOpenExternalUrl: boolean,
  telemetry: TelemetryPort,
): ViewerHost {
  let storageWarningShown = false;
  const reportDiagnosticBase = createDesktopDiagnosticReporter(bridge);
  const reportDiagnostic = (error: unknown, operation: string) => {
    reportDiagnosticBase(error, operation);
    telemetry.captureException(error, { runtime: "renderer", handled: true, operation });
  };
  return {
    reportDiagnostic,
    ...(canOpenExternalUrl
      ? {
          externalNavigation: createDesktopExternalNavigation(bridge),
        }
      : {}),
    subscribe(listener) {
      return bridge.subscribe((value) => {
        const event = bridgeEventSchema.parse(value);
        if (event.type === "app.command") listener({ type: event.payload.command });
        if (event.type === "app.lifecycle") {
          void acknowledgeLifecycle(event.payload.state).catch(() => {
            const status = document.querySelector<HTMLElement>("#status");
            if (status) status.textContent = desktopErrorMessage("lifecycleFailed");
          });
        }
        if (event.type === "storage.warning" && !storageWarningShown) {
          storageWarningShown = true;
          const status = document.querySelector<HTMLElement>("#status");
          if (status) status.textContent = desktopErrorMessage("storageCorrupt");
        }
      });
    },
  };
}

function renderStartupError(_error: unknown): void {
  document.body.replaceChildren();
  const message = document.createElement("p");
  message.id = "startup-error";
  message.setAttribute("role", "alert");
  message.textContent = desktopErrorMessage("startupFailed");
  document.body.append(message);
}

function desktopErrorMessage(key: "openFailed" | "lifecycleFailed" | "storageCorrupt" | "startupFailed"): string {
  const locale = resolveLocale("system", [document.documentElement.lang]);
  return createAppI18n(locale).t(`errors:desktop.${key}`);
}

function installGlobalDragAndDropGuard(target: Document): void {
  const swallowIfExternal = (event: DragEvent) => {
    if (event.defaultPrevented) return;
    if (!event.dataTransfer) return;
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
  };
  target.addEventListener("dragover", swallowIfExternal, true);
  target.addEventListener("drop", swallowIfExternal, true);
}

void start().catch((error) => {
  activeTelemetry?.captureException(error, {
    runtime: "renderer",
    handled: true,
    surface: "startup",
    operation: "renderer.preload",
  });
  activeTelemetry?.capture({
    name: "application_issue_presented",
    surface: "startup",
    issueCode: "startup-failed",
    recoverable: false,
  });
  renderStartupError(error);
});
