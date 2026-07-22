import "@zupulse/web-viewer/styles.css";
import { mountViewerApp, type ViewerHost } from "@zupulse/web-viewer";

const root = document.getElementById("root");
if (!root) throw new Error("IPAD_VIEWER_ROOT_MISSING");

const host: ViewerHost = {
  async openScore() {
    return undefined;
  },
  subscribe() {
    return () => undefined;
  },
};

mountViewerApp(root, {
  host,
  async openSession() {
    throw new Error("IPAD_VIEWER_SESSION_UNAVAILABLE");
  },
});
