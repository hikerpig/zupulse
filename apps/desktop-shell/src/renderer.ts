import {
  BridgePlaybackPersistence,
  bridgeEventSchema,
  createBridgeRequest,
  parseBridgeResponse,
} from "@tab-viewer/web-core";
import {
  createDefaultOpenSession,
  mountViewerApp,
  renderViewerShell,
  type ViewerHost,
} from "@tab-viewer/web-viewer";
import "@tab-viewer/web-viewer/styles.css";

async function start(): Promise<void> {
  const bridge = window.tabViewerBridge;
  if (!bridge) throw new Error("DESKTOP_BRIDGE_UNAVAILABLE");

  const handshake = createBridgeRequest("app.handshake", crypto.randomUUID(), {
    appVersion: __APP_VERSION__,
    rendererBuildHash: __RENDERER_BUILD_HASH__,
  });
  const response = parseBridgeResponse(handshake.type, await bridge.request(handshake));
  if (response.appVersion !== __APP_VERSION__
    || response.rendererBuildHash !== __RENDERER_BUILD_HASH__) {
    throw new Error("BRIDGE_VERSION_MISMATCH");
  }

  const host = createElectronHost(bridge);
  const persistence = new BridgePlaybackPersistence(bridge);
  renderViewerShell(document);
  mountViewerApp(document, {
    host,
    openSession: createDefaultOpenSession(document, persistence),
  });
}

function createElectronHost(bridge: NonNullable<Window["tabViewerBridge"]>): ViewerHost {
  return {
    async openScore() {
      try {
        const openRequest = createBridgeRequest("file.open", crypto.randomUUID(), {});
        const opened = parseBridgeResponse(openRequest.type, await bridge.request(openRequest));
        if (opened.status === "cancelled") return undefined;
        const readRequest = createBridgeRequest("file.readBytes", crypto.randomUUID(), {
          fileToken: opened.fileToken,
        });
        const file = parseBridgeResponse(readRequest.type, await bridge.request(readRequest));
        return { fileName: file.fileName, bytes: file.bytes };
      } catch (error) {
        const status = document.querySelector<HTMLElement>("#status");
        if (status) {
          status.textContent = error instanceof Error
            ? `无法打开文件：${error.message}`
            : "无法打开文件";
        }
        throw error;
      }
    },
    subscribe(listener) {
      return bridge.subscribe(value => {
        const event = bridgeEventSchema.parse(value);
        if (event.type === "app.command") listener({ type: event.payload.command });
        if (event.type === "app.lifecycle") listener({ type: event.payload.state });
      });
    },
  };
}

function renderStartupError(error: unknown): void {
  document.body.replaceChildren();
  const message = document.createElement("p");
  message.id = "startup-error";
  message.setAttribute("role", "alert");
  message.textContent = error instanceof Error ? error.message : "桌面应用启动失败";
  document.body.append(message);
}

void start().catch(renderStartupError);
