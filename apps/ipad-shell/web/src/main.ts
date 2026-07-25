import "@zupulse/web-viewer/styles.css";
import { bootstrapIpadApplication, loadIpadBuildMetadata, type NativeMessageHandler } from "./ipad-bridge-transport";
import { mountIpadViewerApplication } from "./ipad-viewer-host";
import { createDefaultResourceOriginChecks, runResourceOriginProbe } from "./resource-origin-probe";

const root = document.getElementById("root");
if (!root) throw new Error("IPAD_VIEWER_ROOT_MISSING");

(
  window as typeof window & {
    __zupulseResourceOriginProbe?: ReturnType<typeof runResourceOriginProbe>;
  }
).__zupulseResourceOriginProbe = runResourceOriginProbe(createDefaultResourceOriginChecks());

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
    async mount(transport) {
      await mountIpadViewerApplication(root, transport);
    },
  });
})().catch((error: unknown) => {
  root.replaceChildren();
  root.setAttribute("role", "alert");
  root.textContent = `无法启动逐拍：${error instanceof Error ? error.message : "IPAD_STARTUP_FAILED"}`;
});
