import { mountViewerApp } from "@zupulse/web-viewer";
import "@zupulse/web-viewer/styles.css";
import { createBrowserHost } from "./browserHost";
import { BrowserSheetLibraryRepository } from "./library/BrowserSheetLibraryRepository";
import { BrowserScoreFileGateway } from "./library/BrowserScoreFileGateway";
import { BrowserLibraryPlaybackPersistence } from "./library/BrowserLibraryPlaybackPersistence";

export const DEMO_APP_NAME = "Zupulse";

if (typeof document !== "undefined") {
  const root = document.getElementById("root");
  if (!root) throw new Error("Viewer root is missing");
  const host = createBrowserHost(document);
  const repository = new BrowserSheetLibraryRepository();
  void navigator.storage?.persist?.().catch(() => false);
  mountViewerApp(root, {
    host,
    openSession: async (file, libraryScoreId) => {
      const { createDefaultOpenSession } = await import("@zupulse/web-viewer");
      return createDefaultOpenSession(document, new BrowserLibraryPlaybackPersistence(repository))(
        file,
        libraryScoreId,
      );
    },
    library: {
      repository,
      gateway: new BrowserScoreFileGateway(document),
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
