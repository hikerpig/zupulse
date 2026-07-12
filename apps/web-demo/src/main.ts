import { mountViewerApp } from "@tab-viewer/web-viewer/src/mountViewerApp";
import "@tab-viewer/web-viewer/styles.css";
import { createBrowserHost } from "./browserHost";
import { BrowserSheetLibraryRepository } from "./library/BrowserSheetLibraryRepository";
import { BrowserScoreFileGateway } from "./library/BrowserScoreFileGateway";
import { BrowserLibraryPlaybackPersistence } from "./library/BrowserLibraryPlaybackPersistence";

export const DEMO_APP_NAME = "Tab Viewer Demo";

if (typeof document !== "undefined") {
  const root = document.getElementById("root");
  if (!root) throw new Error("Viewer root is missing");
  const host = createBrowserHost(document);
  const repository = new BrowserSheetLibraryRepository();
  void navigator.storage?.persist?.().catch(() => false);
  mountViewerApp(root, {
    host,
    openSession: async (file, libraryScoreId) => {
      const { createDefaultOpenSession } = await import("@tab-viewer/web-viewer/src/viewerApp");
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
          parse: async (input) =>
            (await import("@tab-viewer/web-core/src/gp/gpFormatAdapter")).createGpFormatAdapter().parse(input),
        },
        {
          format: "musicxml",
          parse: async (input) =>
            (await import("@tab-viewer/web-core/src/musicxml/musicXmlAdapter")).createMusicXmlAdapter().parse(input),
        },
      ],
    },
  });
}
