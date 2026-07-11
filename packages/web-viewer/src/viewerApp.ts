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
  const lightThemeButton = required<HTMLButtonElement>(ownerDocument, "theme-light");
  const darkThemeButton = required<HTMLButtonElement>(ownerDocument, "theme-dark");
  let active: ViewerSessionHandle | undefined;
  let chain = Promise.resolve();
  let queuedError: unknown;
  let destroyPromise: Promise<void> | undefined;
  let destroying = false;
  applyTheme(ownerDocument, readInitialTheme(ownerDocument));
  const onLightTheme = () => applyTheme(ownerDocument, "light");
  const onDarkTheme = () => applyTheme(ownerDocument, "dark");
  const openOnce = async () => {
    const file = await dependencies.host.openScore();
    if (!file) return;
    const previous = active;
    active = undefined;
    await previous?.destroy();
    active = await dependencies.openSession(file);
  };
  const scheduleOpen = (recordErrorForDestroy: boolean): Promise<void> => {
    if (destroying) return Promise.reject(new Error("Viewer app is being destroyed"));
    const operation = chain.then(openOnce);
    chain = operation.then(
      () => {
        queuedError = undefined;
      },
      error => {
        if (recordErrorForDestroy) queuedError = error;
      },
    );
    return operation;
  };
  const enqueueOpen = () => {
    void scheduleOpen(true).catch(() => undefined);
  };
  const onHostEvent = (event: ViewerHostEvent) => {
    if (event.type === "open-score") enqueueOpen();
    if (event.type === "toggle-playback" && active) void active.togglePlayback().catch(() => undefined);
    if (event.type === "suspend" && active) void active.pauseAndFlush().catch(() => undefined);
    if (event.type === "prepare-close") void destroy().catch(() => undefined);
  };
  openButton.addEventListener("click", enqueueOpen);
  lightThemeButton.addEventListener("click", onLightTheme);
  darkThemeButton.addEventListener("click", onDarkTheme);
  const unsubscribe = dependencies.host.subscribe(onHostEvent);
  const destroy = (): Promise<void> => {
    destroying = true;
    destroyPromise ??= destroyOnce();
    return destroyPromise;
  };
  return {
    openScore: () => scheduleOpen(false),
    togglePlayback: async () => { await active?.togglePlayback(); },
    pauseAndFlush: async () => { await active?.pauseAndFlush(); },
    destroy,
  };

  async function destroyOnce(): Promise<void> {
    openButton.removeEventListener("click", enqueueOpen);
    lightThemeButton.removeEventListener("click", onLightTheme);
    darkThemeButton.removeEventListener("click", onDarkTheme);
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
  const scoreScrollElement = alphaTabHost.parentElement;
  if (!scoreScrollElement) throw new Error("Viewer DOM is missing the score scroll container");
  const status = required<HTMLElement>(ownerDocument, "status");
  const summary = required<HTMLElement>(ownerDocument, "summary");

  return async file => {
    renderViewerState(status, summary, { status: "loading", message: "正在加载文件" });
    alphaTabHost.replaceChildren();
    const api = dependencies.createApi(alphaTabHost, alphaTabSettings(scoreScrollElement));
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
        async togglePlayback() {
          await sessionController.dispatch({ type: "toggle-playback" });
        },
        async pauseAndFlush() {
          await sessionController.dispatch({ type: "pause" });
          await sessionController.flush();
        },
        async destroy() {
          cleanupControls();
          await sessionController.destroy();
        },
      };
    } catch (error) {
      let cleanupError: unknown;
      try {
        if (controller) await controller.destroy();
        else adapter.destroy();
      } catch (caughtCleanupError) {
        cleanupError = caughtCleanupError;
      }
      if (cleanupError !== undefined) {
        throw new AggregateError(
          [error, cleanupError],
          "Viewer session initialization and cleanup both failed",
        );
      }
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
    summary.textContent = "未打开乐谱";
    return;
  }
  summary.textContent = state.summary.title;
}


function emptySession(): ViewerSessionHandle {
  return {
    togglePlayback: async () => undefined,
    pauseAndFlush: async () => undefined,
    destroy: async () => undefined,
  };
}

function required<T extends HTMLElement>(ownerDocument: Document, id: string): T {
  const element = ownerDocument.getElementById(id);
  if (!element) throw new Error(`Viewer DOM is missing #${id}`);
  return element as T;
}

function alphaTabSettings(scrollElement: HTMLElement): unknown {
  const chineseSerifFonts = "Georgia, 'Songti SC', 'STSong', SimSun, 'Noto Serif SC', serif";
  const chineseSansFonts = "Arial, 'PingFang SC', 'Microsoft YaHei', 'Heiti SC', 'Noto Sans SC', sans-serif";
  return {
    core: { useWorkers: false, scriptFile: ALPHATAB_ASSETS.scriptFile, fontDirectory: ALPHATAB_ASSETS.fontDirectory },
    player: {
      enablePlayer: true,
      enableCursor: true,
      enableAnimatedBeatCursor: true,
      enableElementHighlighting: true,
      scrollElement,
      soundFont: ALPHATAB_ASSETS.soundFont,
    },
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

type ViewerTheme = "light" | "dark";

function readInitialTheme(ownerDocument: Document): ViewerTheme {
  const stored = ownerDocument.defaultView?.localStorage.getItem("tab-viewer-theme");
  return stored === "light" ? "light" : "dark";
}

function applyTheme(ownerDocument: Document, theme: ViewerTheme): void {
  ownerDocument.documentElement.dataset.theme = theme;
  ownerDocument.defaultView?.localStorage.setItem("tab-viewer-theme", theme);

  const lightThemeButton = ownerDocument.getElementById("theme-light");
  const darkThemeButton = ownerDocument.getElementById("theme-dark");
  lightThemeButton?.setAttribute("aria-pressed", String(theme === "light"));
  darkThemeButton?.setAttribute("aria-pressed", String(theme === "dark"));
}
