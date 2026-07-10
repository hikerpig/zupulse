import { BridgePlaybackPersistence } from "@tab-viewer/web-core";
import {
  createDefaultOpenSession,
  mountViewerApp,
  renderViewerShell,
} from "@tab-viewer/web-viewer";
import "@tab-viewer/web-viewer/styles.css";
import { createBrowserHost } from "./browserHost";

export const DEMO_APP_NAME = "Tab Viewer Demo";

if (typeof document !== "undefined") {
  renderViewerShell(document);
  const host = createBrowserHost(document);
  mountViewerApp(document, {
    host,
    openSession: createDefaultOpenSession(document, new BridgePlaybackPersistence(host.bridge)),
  });
}
