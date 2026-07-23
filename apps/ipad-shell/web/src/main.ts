import "@zupulse/web-viewer/styles.css";
import { mountViewerApp, type ViewerHost } from "@zupulse/web-viewer";
import { bootstrapIpadApplication, loadIpadBuildMetadata, type NativeMessageHandler } from "./ipad-bridge-transport";

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

const handler = (
  window as typeof window & {
    webkit?: { messageHandlers?: { zupulseBridge?: NativeMessageHandler } };
  }
).webkit?.messageHandlers?.zupulseBridge;

void (async () => {
  if (!handler) {
    await bootstrapIpadApplication({
      root,
      metadata: { appVersion: "unavailable", bridgeVersion: "unavailable", buildHash: "unavailable" },
      handler: {
        async postMessage() {
          throw new Error("IPAD_BRIDGE_UNAVAILABLE");
        },
      },
      mount() {},
    });
    return;
  }
  const metadata = await loadIpadBuildMetadata();
  await bootstrapIpadApplication({
    root,
    metadata,
    handler,
    mount() {
      mountViewerApp(root, {
        host,
        async openSession() {
          throw new Error("IPAD_VIEWER_SESSION_UNAVAILABLE");
        },
      });
    },
  });
})().catch((error: unknown) => {
  root.replaceChildren();
  root.setAttribute("role", "alert");
  root.textContent = `无法启动逐拍：${error instanceof Error ? error.message : "IPAD_STARTUP_FAILED"}`;
});
