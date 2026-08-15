import "@zupulse/web-viewer/styles.css";
import { IndexedDbSheetLibraryRepository } from "@zupulse/web-storage";
import { bundledSampleScores, createSampleImportSource, mountViewerApp } from "@zupulse/web-viewer";
import { createBrowserHost, createBrowserLocaleHost } from "./browserHost";
import { createBrowserTelemetry } from "./telemetry/browser-telemetry";
import { BrowserScoreFileGateway, createBrowserImportSources } from "./library/BrowserScoreFileGateway";
import { BrowserLibraryPlaybackPersistence } from "./library/BrowserLibraryPlaybackPersistence";

export const DEMO_APP_NAME = "Zupulse";

if (typeof document !== "undefined") {
  const root = document.getElementById("root");
  if (!root) throw new Error("Viewer root is missing");
  const host = createBrowserHost(document);
  const telemetry = createBrowserTelemetry({
    ownerDocument: document,
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
  const localeHost = createBrowserLocaleHost(document);
  const repository = new IndexedDbSheetLibraryRepository();
  void navigator.storage?.persist?.().catch(() => false);
  mountViewerApp(root, {
    host: {
      ...host,
      telemetry: telemetry.port,
      reportDiagnostic: (error: unknown, operation: string) => captureBrowserException(error, true, operation),
    },
    telemetryControl: telemetry.getControl(),
    initialSurface: initialSurfaceForHash(window.location.hash),
    localeHost,
    openSession: async (file, libraryScoreId, domBindings) => {
      const { createDefaultOpenSession } = await import("@zupulse/web-viewer");
      return createDefaultOpenSession(document, new BrowserLibraryPlaybackPersistence(repository))(
        file,
        libraryScoreId,
        domBindings,
      );
    },
    library: {
      repository,
      gateway: new BrowserScoreFileGateway(document),
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

function initialSurfaceForHash(hash: string): "library" | "viewer" | "studio" | "not-found" {
  const route = hash.replace(/^#/, "").split("?")[0] || "/";
  if (route === "/library" || route === "/") return "library";
  if (route.startsWith("/viewer/")) return "viewer";
  if (route.startsWith("/studio/")) return "studio";
  return "not-found";
}
