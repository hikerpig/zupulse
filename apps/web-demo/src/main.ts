import { createGpFormatAdapter, createMusicXmlAdapter } from "@tab-viewer/web-core";
import { createDefaultOpenSession, mountViewerApp } from "@tab-viewer/web-viewer";
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
    openSession: createDefaultOpenSession(document, new BrowserLibraryPlaybackPersistence(repository)),
    library: {
      repository,
      gateway: new BrowserScoreFileGateway(document),
      adapters: [createGpFormatAdapter(), createMusicXmlAdapter()],
    },
  });
}
