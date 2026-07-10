import {
  AlphaTabPlaybackAdapter,
  PlaybackController,
  createAlphaTabApi,
  createDefaultSidecar,
  extractAlphaTabPlaybackModel,
  waitForAlphaTabScore,
  type AlphaTabApiLike,
  type BridgePlaybackPersistence,
} from "@tab-viewer/web-core";
import type {
  ViewerAppHandle,
  ViewerFile,
  ViewerHost,
  ViewerHostEvent,
  ViewerSessionHandle,
} from "./host";
import { ALPHATAB_ASSETS } from "./playbackAssets";
import { mountPlaybackControls } from "./playbackControls";
import { presentGpFile, type DemoState } from "./gpDemoPresenter";

export type ViewerAppDependencies = {
  host: ViewerHost;
  openSession(file: ViewerFile): Promise<ViewerSessionHandle>;
};

export type DefaultOpenSessionDependencies = {
  createApi: typeof createAlphaTabApi;
  createAdapter(api: AlphaTabApiLike): AlphaTabPlaybackAdapter;
  presentFile: typeof presentGpFile;
  waitForScore: typeof waitForAlphaTabScore;
  extractModel: typeof extractAlphaTabPlaybackModel;
  createController(
    options: ConstructorParameters<typeof PlaybackController>[0],
  ): PlaybackController;
  mountControls: typeof mountPlaybackControls;
};

const defaultOpenSessionDependencies: DefaultOpenSessionDependencies = {
  createApi: createAlphaTabApi,
  createAdapter: api => new AlphaTabPlaybackAdapter(api, ALPHATAB_ASSETS.soundFont),
  presentFile: presentGpFile,
  waitForScore: waitForAlphaTabScore,
  extractModel: extractAlphaTabPlaybackModel,
  createController: options => new PlaybackController(options),
  mountControls: mountPlaybackControls,
};

export function mountViewerApp(
  ownerDocument: Document,
  dependencies: ViewerAppDependencies,
): ViewerAppHandle {
  const queriedOpenButton = ownerDocument.querySelector<HTMLButtonElement>("#open-score");
  if (!queriedOpenButton) throw new Error("Viewer DOM is missing #open-score");
  const openButton = queriedOpenButton;
  let active: ViewerSessionHandle | undefined;
  let chain = Promise.resolve();
  let queuedError: unknown;
  let destroyPromise: Promise<void> | undefined;
  const openScore = async () => {
    const file = await dependencies.host.openScore();
    if (!file) return;
    const previous = active;
    active = undefined;
    await previous?.destroy();
    active = await dependencies.openSession(file);
  };
  const enqueueOpen = () => {
    chain = chain.then(async () => {
      try {
        await openScore();
        queuedError = undefined;
      } catch (error) {
        queuedError = error;
      }
    });
  };
  const onHostEvent = (event: ViewerHostEvent) => {
    if (event.type === "open-score") enqueueOpen();
    if (event.type === "suspend" && active) void active.pauseAndFlush().catch(() => undefined);
    if (event.type === "prepare-close") void destroy().catch(() => undefined);
  };
  openButton.addEventListener("click", enqueueOpen);
  const unsubscribe = dependencies.host.subscribe(onHostEvent);
  const destroy = (): Promise<void> => {
    destroyPromise ??= destroyOnce();
    return destroyPromise;
  };
  return {
    openScore,
    pauseAndFlush: async () => { await active?.pauseAndFlush(); },
    destroy,
  };

  async function destroyOnce(): Promise<void> {
    openButton.removeEventListener("click", enqueueOpen);
    unsubscribe();
    await chain;
    const openError = queuedError;
    const session = active;
    active = undefined;
    let cleanupError: unknown;
    try {
      await session?.destroy();
    } catch (error) {
      cleanupError = error;
    }
    if (openError !== undefined && cleanupError !== undefined) {
      throw new AggregateError([openError, cleanupError], "Viewer open and cleanup both failed");
    }
    if (openError !== undefined) throw openError;
    if (cleanupError !== undefined) throw cleanupError;
  }
}

export function createDefaultOpenSession(
  ownerDocument: Document,
  persistence: BridgePlaybackPersistence,
  dependencies: DefaultOpenSessionDependencies = defaultOpenSessionDependencies,
): (file: ViewerFile) => Promise<ViewerSessionHandle> {
  const alphaTabHost = required<HTMLElement>(ownerDocument, "alpha-tab");
  const status = required<HTMLElement>(ownerDocument, "status");
  const summary = required<HTMLElement>(ownerDocument, "summary");

  return async file => {
    renderViewerState(status, summary, { status: "loading", message: "正在加载文件" });
    const api = dependencies.createApi(alphaTabHost, alphaTabSettings());
    const adapter = dependencies.createAdapter(api);
    let controller: PlaybackController | undefined;
    try {
      const state = await dependencies.presentFile({
        file: {
          name: file.fileName,
          async arrayBuffer() { return file.bytes.slice().buffer; },
        },
        api,
      });
      if (state.status !== "ready" || !state.identity) {
        adapter.destroy();
        renderViewerState(status, summary, state);
        return emptySession();
      }

      await dependencies.waitForScore(api);
      const model = dependencies.extractModel(api);
      const sessionController = dependencies.createController({
        sessionId: crypto.randomUUID(),
        identity: state.identity,
        engine: adapter,
        persistence,
        baseSidecar: createDefaultSidecar(state.identity),
        tracks: model.tracks,
        timeline: model.timeline,
      });
      controller = sessionController;
      await sessionController.initialize();
      const cleanupControls = dependencies.mountControls(
        ownerDocument,
        sessionController,
        model.timeline,
      );
      renderViewerState(status, summary, state);
      return {
        async pauseAndFlush() {
          await sessionController.dispatch({ type: "stop" });
          await sessionController.flush();
        },
        async destroy() {
          cleanupControls();
          await sessionController.destroy();
        },
      };
    } catch (error) {
      if (controller) await controller.destroy();
      else adapter.destroy();
      renderViewerState(status, summary, {
        status: "error",
        message: error instanceof Error ? error.message : "加载失败",
      });
      return emptySession();
    }
  };
}

export function renderViewerState(status: HTMLElement, summary: HTMLElement, state: DemoState): void {
  status.textContent = state.message;
  if (state.status !== "ready" || !state.summary) {
    summary.textContent = "";
    return;
  }
  const artist = state.summary.artist ? ` · ${state.summary.artist}` : "";
  const tempo = state.summary.tempo === undefined ? "" : ` · ${state.summary.tempo} bpm`;
  summary.textContent = `${state.summary.title}${artist} · ${state.summary.trackCount} tracks · ${state.summary.masterBarCount} bars${tempo}`;
}

function emptySession(): ViewerSessionHandle {
  return { pauseAndFlush: async () => undefined, destroy: async () => undefined };
}

function required<T extends HTMLElement>(ownerDocument: Document, id: string): T {
  const element = ownerDocument.getElementById(id);
  if (!element) throw new Error(`Viewer DOM is missing #${id}`);
  return element as T;
}

function alphaTabSettings(): unknown {
  const chineseSerifFonts = "Georgia, 'Songti SC', 'STSong', SimSun, 'Noto Serif SC', serif";
  const chineseSansFonts = "Arial, 'PingFang SC', 'Microsoft YaHei', 'Heiti SC', 'Noto Sans SC', sans-serif";
  return {
    core: { useWorkers: false, scriptFile: ALPHATAB_ASSETS.scriptFile, fontDirectory: ALPHATAB_ASSETS.fontDirectory },
    player: { enablePlayer: true, soundFont: ALPHATAB_ASSETS.soundFont },
    display: {
      scale: 1,
      resources: {
        titleFont: `32px ${chineseSerifFonts}`,
        subTitleFont: `20px ${chineseSerifFonts}`,
        wordsFont: `15px ${chineseSansFonts}`,
        tablatureFont: `13px ${chineseSansFonts}`,
        graceFont: `11px ${chineseSansFonts}`,
        barNumberFont: `11px ${chineseSansFonts}`,
        copyrightFont: `bold 12px ${chineseSansFonts}`,
        markerFont: `bold 14px ${chineseSerifFonts}`,
        directionsFont: `14px ${chineseSerifFonts}`,
        timerFont: `12px ${chineseSerifFonts}`,
        fretboardNumberFont: `11px ${chineseSansFonts}`,
        numberedNotationFont: `14px ${chineseSansFonts}`,
        numberedNotationGraceFont: `16px ${chineseSansFonts}`,
      },
    },
  };
}
