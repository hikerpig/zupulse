import "@zupulse/web-viewer/styles.css";
import { IndexedDbSheetLibraryRepository } from "@zupulse/web-storage";
import { bundledSampleScores, createSampleImportSource, mountViewerApp } from "@zupulse/web-viewer";
import { createBrowserHost, createBrowserLocaleHost } from "./browserHost";
import { BrowserScoreFileGateway, createBrowserImportSources } from "./library/BrowserScoreFileGateway";
import { BrowserLibraryPlaybackPersistence } from "./library/BrowserLibraryPlaybackPersistence";

export const DEMO_APP_NAME = "Zupulse";

if (typeof document !== "undefined") {
  const root = document.getElementById("root");
  if (!root) throw new Error("Viewer root is missing");
  const host = createBrowserHost(document);
  const localeHost = createBrowserLocaleHost(document);
  const repository = new IndexedDbSheetLibraryRepository();
  void navigator.storage?.persist?.().catch(() => false);
  mountViewerApp(root, {
    host,
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
}
