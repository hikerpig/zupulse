import "@zupulse/web-viewer/styles.css";
import { mountViewerApp } from "@zupulse/web-viewer";
import { composeBrowserApp } from "./compose-browser-app";

const startedAt = performance.now();

if (typeof document !== "undefined") {
  void bootstrap(document);
}

async function bootstrap(ownerDocument: Document): Promise<void> {
  const root = ownerDocument.getElementById("root");
  if (!root) throw new Error("Viewer root is missing");
  const { dependencies, startSession } = await composeBrowserApp({ ownerDocument, startupStartedAt: startedAt });
  mountViewerApp(root, dependencies);
  startSession();
}
