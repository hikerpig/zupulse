import "@zupulse/web-viewer/styles.css";
import { recognitionApiCapabilitiesSchema } from "@zupulse/web-core";
import { IndexedDbSheetLibraryRepository } from "@zupulse/web-storage";
import {
  bundledSampleScores,
  createSampleImportSource,
  initialSurfaceForHash,
  mountViewerApp,
} from "@zupulse/web-viewer";
import { createBrowserHost, createBrowserLocaleHost } from "./browserHost";
import { createBrowserTelemetry } from "./telemetry/browser-telemetry";
import { BrowserScoreFileGateway, createBrowserImportSources } from "./library/BrowserScoreFileGateway";
import { BrowserLibraryPlaybackPersistence } from "./library/BrowserLibraryPlaybackPersistence";
import {
  RemoteRecognitionClient,
  saveRecognitionResult,
  selectRecognitionFile,
} from "./recognition/RemoteRecognitionClient";

if (typeof document !== "undefined") {
  void bootstrap(document);
}

async function bootstrap(ownerDocument: Document): Promise<void> {
  const root = ownerDocument.getElementById("root");
  if (!root) throw new Error("Viewer root is missing");
  const host = createBrowserHost(ownerDocument);
  const telemetry = createBrowserTelemetry({
    ownerDocument,
    config: {
      appVersion: __APP_VERSION__,
      buildId: __BROWSER_BUILD_ID__,
      releaseChannel: __TELEMETRY_RELEASE_CHANNEL__,
      projectToken: __POSTHOG_PROJECT_TOKEN__,
      apiHost: __POSTHOG_API_HOST__,
    },
  });
  const captureBrowserException = (error: unknown, handled: boolean, operation?: string) => {
    telemetry.port.captureException(error, {
      runtime: "browser",
      handled,
      ...(operation === undefined ? {} : { operation }),
    });
  };
  window.addEventListener("error", (event) => captureBrowserException(event.error ?? new Error(event.message), false));
  window.addEventListener("unhandledrejection", (event) => captureBrowserException(event.reason, false));
  const localeHost = createBrowserLocaleHost(ownerDocument);
  ownerDocument.documentElement.lang = localeHost.initialState.effectiveLocale;
  const repository = new IndexedDbSheetLibraryRepository();
  void navigator.storage?.persist?.().catch(() => false);
  const remoteRecognition = await discoverRecognition(ownerDocument);
  const openBrowserSession = async (
    file: import("@zupulse/web-viewer").ViewerFile,
    libraryScoreId?: string,
    domBindings?: import("@zupulse/web-viewer").ViewerDomBindings,
  ) => {
    const { createDefaultOpenSession } = await import("@zupulse/web-viewer");
    return createDefaultOpenSession(ownerDocument, new BrowserLibraryPlaybackPersistence(repository))(
      file,
      libraryScoreId,
      domBindings,
    );
  };
  mountViewerApp(root, {
    host: {
      ...host,
      telemetry: telemetry.port,
      reportDiagnostic: (error: unknown, operation: string) => captureBrowserException(error, true, operation),
    },
    telemetryControl: telemetry.getControl(),
    initialSurface: initialSurfaceForHash(window.location.hash),
    localeHost,
    capabilities: {
      harmonyAnalysis: true,
      pdfOmrWorkbench: remoteRecognition !== undefined,
      pdfOmrHistory: remoteRecognition !== undefined,
    },
    ...(remoteRecognition === undefined ? {} : { pdfOmrHistory: remoteRecognition }),
    openSession: openBrowserSession,
    ...(remoteRecognition === undefined
      ? {}
      : { openPdfOmrPreview: (file, domBindings) => openBrowserSession(file, undefined, domBindings) }),
    library: {
      repository,
      gateway: new BrowserScoreFileGateway(ownerDocument),
      createDroppedImportSources: createBrowserImportSources,
      sampleSources: bundledSampleScores.map((sample) => ({
        sample,
        createSource: () =>
          createSampleImportSource(sample, async () => {
            const response = await fetch(`/samples/${sample.fileName}`);
            if (!response.ok) throw new Error("SAMPLE_ASSET_UNAVAILABLE");
            return new Uint8Array(await response.arrayBuffer());
          }),
      })),
      adapters: [
        {
          format: "gp",
          parse: async (input) => (await import("@zupulse/web-core")).createGpFormatAdapter().parse(input),
        },
        {
          format: "musicxml",
          parse: async (input) => (await import("@zupulse/web-core")).createMusicXmlAdapter().parse(input),
        },
      ],
    },
  });
  telemetry.startSession();
}

async function discoverRecognition(ownerDocument: Document): Promise<RemoteRecognitionClient | undefined> {
  try {
    const response = await fetch("/api/recognition/v1/capabilities", { signal: AbortSignal.timeout(800) });
    if (!response.ok) return undefined;
    const capabilities = recognitionApiCapabilitiesSchema.parse(await response.json());
    return new RemoteRecognitionClient({
      engines: capabilities.engines,
      fetch: window.fetch.bind(window),
      selectFile: () => selectRecognitionFile(ownerDocument),
      createEventSource: (url) => new EventSource(url),
      save: (fileName, bytes) => saveRecognitionResult(ownerDocument, fileName, bytes),
    });
  } catch {
    return undefined;
  }
}
