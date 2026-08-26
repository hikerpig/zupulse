import { IndexedDbSheetLibraryRepository } from "@zupulse/web-storage";
import {
  bundledSampleScores,
  createSampleImportSource,
  initialSurfaceForHash,
  type ViewerAppDependencies,
  type ViewerDomBindings,
  type ViewerFile,
} from "@zupulse/web-viewer";
import { createBrowserHost, createBrowserLocaleHost } from "./browserHost";
import { BrowserLibraryPlaybackPersistence } from "./library/BrowserLibraryPlaybackPersistence";
import { BrowserScoreFileGateway, createBrowserImportSources } from "./library/BrowserScoreFileGateway";
import { tryCreateRemoteRecognitionClient } from "./recognition/RemoteRecognitionClient";
import { createBrowserTelemetry } from "./telemetry/browser-telemetry";

export async function composeBrowserApp(input: {
  ownerDocument: Document;
  fetch?: typeof fetch;
  now?: () => Date;
  persistStorage?: () => Promise<boolean>;
  recognitionProbeTimeoutMs?: number;
  telemetryConfig?: {
    appVersion: string;
    buildId: string;
    releaseChannel: string;
    projectToken?: string;
    apiHost?: string;
  };
}): Promise<{
  dependencies: ViewerAppDependencies;
  startSession: () => void;
}> {
  const ownerDocument = input.ownerDocument;
  const view = ownerDocument.defaultView;
  const fetcher = input.fetch ?? view?.fetch.bind(view) ?? fetch;
  const localeHost = createBrowserLocaleHost(ownerDocument);
  ownerDocument.documentElement.lang = localeHost.initialState.effectiveLocale;
  const telemetryConfig = input.telemetryConfig ?? {
    appVersion: __APP_VERSION__,
    buildId: __BROWSER_BUILD_ID__,
    releaseChannel: __TELEMETRY_RELEASE_CHANNEL__,
    projectToken: __POSTHOG_PROJECT_TOKEN__,
    apiHost: __POSTHOG_API_HOST__,
  };
  const telemetry = createBrowserTelemetry({
    ownerDocument,
    config: {
      ...telemetryConfig,
      effectiveLocale: localeHost.initialState.effectiveLocale,
    },
    fetcher,
    ...(input.now === undefined ? {} : { now: input.now }),
  });
  const captureBrowserException = (error: unknown, handled: boolean, operation?: string) => {
    telemetry.port.captureException(error, {
      runtime: "browser",
      handled,
      ...(operation === undefined ? {} : { operation }),
    });
  };
  view?.addEventListener("error", (event) => captureBrowserException(event.error ?? new Error(event.message), false));
  view?.addEventListener("unhandledrejection", (event) => captureBrowserException(event.reason, false));
  const repository = new IndexedDbSheetLibraryRepository();
  void (input.persistStorage ?? (() => view?.navigator.storage?.persist?.() ?? Promise.resolve(false)))().catch(
    () => false,
  );
  const remoteRecognition = await tryCreateRemoteRecognitionClient({
    fetch: fetcher,
    ownerDocument,
    ...(input.recognitionProbeTimeoutMs === undefined ? {} : { timeoutMs: input.recognitionProbeTimeoutMs }),
  });
  const openBrowserSession = async (file: ViewerFile, libraryScoreId?: string, domBindings?: ViewerDomBindings) => {
    const { createDefaultOpenSession } = await import("@zupulse/web-viewer");
    return createDefaultOpenSession(ownerDocument, new BrowserLibraryPlaybackPersistence(repository))(
      file,
      libraryScoreId,
      domBindings,
    );
  };
  return {
    startSession: () => telemetry.startSession(),
    dependencies: {
      host: {
        ...createBrowserHost(ownerDocument),
        telemetry: telemetry.port,
        reportDiagnostic: (error: unknown, operation: string) => captureBrowserException(error, true, operation),
      },
      telemetryControl: telemetry.getControl(),
      initialSurface: initialSurfaceForHash(view?.location.hash ?? ""),
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
              const response = await fetcher(`/samples/${sample.fileName}`);
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
    },
  };
}
