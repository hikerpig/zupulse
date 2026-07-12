import {
  BridgePlaybackPersistence,
  bridgeEventSchema,
  createBridgeRequest,
  parseBridgeResponse,
} from '@tab-viewer/web-core';
import {
  createDefaultOpenSession,
  mountViewerApp,
  type ViewerAppHandle,
  type ViewerHost,
} from '@tab-viewer/web-viewer';
import '@tab-viewer/web-viewer/styles.css';

document.documentElement.classList.add('desktop-shell');

async function start(): Promise<void> {
  const bridge = window.tabViewerBridge;
  if (!bridge) throw new Error('DESKTOP_BRIDGE_UNAVAILABLE');

  const handshake = createBridgeRequest('app.handshake', crypto.randomUUID(), {
    appVersion: __APP_VERSION__,
    rendererBuildHash: __RENDERER_BUILD_HASH__,
  });
  const response = parseBridgeResponse(handshake.type, await bridge.request(handshake));
  if (response.appVersion !== __APP_VERSION__ || response.rendererBuildHash !== __RENDERER_BUILD_HASH__) {
    throw new Error('BRIDGE_VERSION_MISMATCH');
  }

  let appHandle: ViewerAppHandle | undefined;
  const acknowledgeLifecycle = async (state: 'suspend' | 'prepare-close') => {
    if (!appHandle) throw new Error('VIEWER_NOT_READY');
    if (state === 'suspend') await appHandle.pauseAndFlush();
    else await appHandle.destroy();
    const ack = createBridgeRequest('app.lifecycleAck', crypto.randomUUID(), { state });
    parseBridgeResponse(ack.type, await bridge.request(ack));
  };
  const host = createElectronHost(bridge, acknowledgeLifecycle);
  const persistence = new BridgePlaybackPersistence(bridge);
  const root = document.getElementById('root');
  if (!root) throw new Error('VIEWER_ROOT_MISSING');
  appHandle = mountViewerApp(root, {
    host,
    openSession: createDefaultOpenSession(document, persistence),
  });
}

function createElectronHost(
  bridge: NonNullable<Window['tabViewerBridge']>,
  acknowledgeLifecycle: (state: 'suspend' | 'prepare-close') => Promise<void>,
): ViewerHost {
  let storageWarningShown = false;
  return {
    async openScore() {
      try {
        const openRequest = createBridgeRequest('file.open', crypto.randomUUID(), {});
        const opened = parseBridgeResponse(openRequest.type, await bridge.request(openRequest));
        if (opened.status === 'cancelled') return undefined;
        const readRequest = createBridgeRequest('file.readBytes', crypto.randomUUID(), {
          fileToken: opened.fileToken,
        });
        const file = parseBridgeResponse(readRequest.type, await bridge.request(readRequest));
        return { fileName: file.fileName, bytes: file.bytes };
      } catch (error) {
        const status = document.querySelector<HTMLElement>('#status');
        if (status) {
          status.textContent = error instanceof Error ? `无法打开文件：${error.message}` : '无法打开文件';
        }
        throw error;
      }
    },
    subscribe(listener) {
      return bridge.subscribe((value) => {
        const event = bridgeEventSchema.parse(value);
        if (event.type === 'app.command') listener({ type: event.payload.command });
        if (event.type === 'app.lifecycle') {
          void acknowledgeLifecycle(event.payload.state).catch((error) => {
            const status = document.querySelector<HTMLElement>('#status');
            if (status)
              status.textContent = error instanceof Error ? `生命周期保存失败：${error.message}` : '生命周期保存失败';
          });
        }
        if (event.type === 'storage.warning' && !storageWarningShown) {
          storageWarningShown = true;
          const status = document.querySelector<HTMLElement>('#status');
          if (status) status.textContent = '本地练习数据损坏，已隔离并使用默认设置';
        }
      });
    },
  };
}

function renderStartupError(error: unknown): void {
  document.body.replaceChildren();
  const message = document.createElement('p');
  message.id = 'startup-error';
  message.setAttribute('role', 'alert');
  message.textContent = error instanceof Error ? error.message : '桌面应用启动失败';
  document.body.append(message);
}

void start().catch(renderStartupError);
