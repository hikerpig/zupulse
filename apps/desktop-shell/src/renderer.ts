import {
  BridgePlaybackPersistence,
  bridgeEventSchema,
  createGpFormatAdapter,
  createMusicXmlAdapter,
  createBridgeRequest,
  parseBridgeResponse,
  type ScoreFileGateway,
  type ScoreImportSource,
  type SheetLibraryRepository,
  type LibraryScoreId,
  type LibraryScoreIdentity,
  type LibraryScore,
  type LibraryScoreSummary,
  type ValidatedLibraryScoreDraft,
  type LibraryMetadata,
  type StoredScoreFile,
} from "@tab-viewer/web-core";
import {
  createDefaultOpenSession,
  mountViewerApp,
  type ViewerAppHandle,
  type ViewerHost,
} from "@tab-viewer/web-viewer";
import "@tab-viewer/web-viewer/styles.css";

document.documentElement.classList.add("desktop-shell");

async function start(): Promise<void> {
  const bridge = window.tabViewerBridge;
  if (!bridge) throw new Error("DESKTOP_BRIDGE_UNAVAILABLE");

  const handshake = createBridgeRequest("app.handshake", crypto.randomUUID(), {
    appVersion: __APP_VERSION__,
    rendererBuildHash: __RENDERER_BUILD_HASH__,
  });
  const response = parseBridgeResponse(handshake.type, await bridge.request(handshake));
  if (response.appVersion !== __APP_VERSION__ || response.rendererBuildHash !== __RENDERER_BUILD_HASH__) {
    throw new Error("BRIDGE_VERSION_MISMATCH");
  }

  let appHandle: ViewerAppHandle | undefined;
  const acknowledgeLifecycle = async (state: "suspend" | "prepare-close") => {
    if (!appHandle) throw new Error("VIEWER_NOT_READY");
    if (state === "suspend") await appHandle.pauseAndFlush();
    else await appHandle.destroy();
    const ack = createBridgeRequest("app.lifecycleAck", crypto.randomUUID(), { state });
    parseBridgeResponse(ack.type, await bridge.request(ack));
  };
  const host = createElectronHost(bridge, acknowledgeLifecycle);
  const persistence = new BridgePlaybackPersistence(bridge);
  const root = document.getElementById("root");
  if (!root) throw new Error("VIEWER_ROOT_MISSING");
  appHandle = mountViewerApp(root, {
    host,
    openSession: createDefaultOpenSession(document, persistence),
    library: {
      repository: new DesktopLibraryRepository(bridge),
      gateway: new DesktopScoreFileGateway(bridge),
      adapters: [createGpFormatAdapter(), createMusicXmlAdapter()],
    },
  });
}

class DesktopLibraryRepository implements SheetLibraryRepository {
  constructor(private readonly bridge: NonNullable<Window["tabViewerBridge"]>) {}
  async initialize(): Promise<void> {}
  async list(): Promise<readonly LibraryScoreSummary[]> {
    return (await this.request("library.list", {})).scores;
  }
  async get(id: LibraryScoreId): Promise<LibraryScore | undefined> {
    return (await this.request("library.get", { id })).score;
  }
  async findByIdentity(scoreIdentity: LibraryScoreIdentity): Promise<LibraryScore | undefined> {
    return (await this.request("library.find", { scoreIdentity })).score;
  }
  async add(draft: ValidatedLibraryScoreDraft): Promise<{ status: "created" | "existing"; score: LibraryScore }> {
    return this.request("library.add", {
      draft: {
        ...draft,
        file: { ...draft.file, bytes: new Uint8Array(draft.file.bytes) },
        ...(draft.parsedTitle === undefined ? {} : { parsedTitle: draft.parsedTitle }),
        ...(draft.parsedArtist === undefined ? {} : { parsedArtist: draft.parsedArtist }),
        ...(draft.durationMs === undefined ? {} : { durationMs: draft.durationMs }),
      },
    });
  }
  async readScore(id: LibraryScoreId): Promise<StoredScoreFile> {
    return this.request("library.readScore", { id });
  }
  async updateMetadata(id: LibraryScoreId, patch: LibraryMetadata): Promise<LibraryScore> {
    return (await this.request("library.updateMetadata", { id, patch })).score;
  }
  async setFavorite(id: LibraryScoreId, favorite: boolean): Promise<void> {
    await this.request("library.setFavorite", { id, favorite });
  }
  async markOpened(id: LibraryScoreId, openedAt: string): Promise<void> {
    await this.request("library.markOpened", { id, openedAt });
  }
  async delete(id: LibraryScoreId): Promise<void> {
    await this.request("library.delete", { id });
  }
  private async request(type: any, payload: any): Promise<any> {
    const request = createBridgeRequest(type as never, crypto.randomUUID(), payload as never);
    return parseBridgeResponse(type as never, await this.bridge.request(request));
  }
}

class DesktopScoreFileGateway implements ScoreFileGateway {
  constructor(private readonly bridge: NonNullable<Window["tabViewerBridge"]>) {}
  async selectForImport(options: { multiple: boolean }): Promise<readonly ScoreImportSource[]> {
    const request = createBridgeRequest("file.select", crypto.randomUUID(), options);
    const selection = parseBridgeResponse(request.type, await this.bridge.request(request));
    if (selection.status === "cancelled") return [];
    return selection.files.map((opened) => ({
      fileName: opened.fileName,
      readBytes: async () => {
        const read = createBridgeRequest("file.readBytes", crypto.randomUUID(), { fileToken: opened.fileToken });
        return (await parseBridgeResponse(read.type, await this.bridge.request(read))).bytes;
      },
    }));
  }
  async saveExport(file: StoredScoreFile): Promise<"saved" | "cancelled"> {
    const request = createBridgeRequest("file.save", crypto.randomUUID(), {
      fileName: file.fileName,
      bytes: new Uint8Array(file.bytes),
    });
    return (await parseBridgeResponse(request.type, await this.bridge.request(request))).status;
  }
}

function createElectronHost(
  bridge: NonNullable<Window["tabViewerBridge"]>,
  acknowledgeLifecycle: (state: "suspend" | "prepare-close") => Promise<void>,
): ViewerHost {
  let storageWarningShown = false;
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
          status.textContent = error instanceof Error ? `无法打开文件：${error.message}` : "无法打开文件";
        }
        throw error;
      }
    },
    subscribe(listener) {
      return bridge.subscribe((value) => {
        const event = bridgeEventSchema.parse(value);
        if (event.type === "app.command") listener({ type: event.payload.command });
        if (event.type === "app.lifecycle") {
          void acknowledgeLifecycle(event.payload.state).catch((error) => {
            const status = document.querySelector<HTMLElement>("#status");
            if (status)
              status.textContent = error instanceof Error ? `生命周期保存失败：${error.message}` : "生命周期保存失败";
          });
        }
        if (event.type === "storage.warning" && !storageWarningShown) {
          storageWarningShown = true;
          const status = document.querySelector<HTMLElement>("#status");
          if (status) status.textContent = "本地练习数据损坏，已隔离并使用默认设置";
        }
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
