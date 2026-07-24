import {
  AlphaTabPlaybackAdapter,
  PlaybackController,
  createAlphaTabApi,
  createDefaultSidecar,
  extractAlphaTabPlaybackModel,
  waitForAlphaTabScore,
  type AlphaTabApiLike,
  type PlaybackPersistence,
} from "@zupulse/web-core";
import { createAppI18n, resolveLocale } from "@zupulse/app-i18n";
import type { ViewerFile, ViewerSessionHandle } from "./host";
import { ALPHATAB_ASSETS } from "./playbackAssets";
import { type DemoState } from "./gpDemoPresenter";
import { presentScoreFile } from "./importPresenter";

export type DefaultOpenSessionDependencies = {
  createApi: typeof createAlphaTabApi;
  createAdapter(api: AlphaTabApiLike): AlphaTabPlaybackAdapter;
  presentFile: typeof presentScoreFile;
  waitForScore: typeof waitForAlphaTabScore;
  extractModel: typeof extractAlphaTabPlaybackModel;
  createController(options: ConstructorParameters<typeof PlaybackController>[0]): PlaybackController;
};

const defaultOpenSessionDependencies: DefaultOpenSessionDependencies = {
  createApi: createAlphaTabApi,
  createAdapter: (api) => new AlphaTabPlaybackAdapter(api, ALPHATAB_ASSETS.soundFont),
  presentFile: presentScoreFile,
  waitForScore: waitForAlphaTabScore,
  extractModel: extractAlphaTabPlaybackModel,
  createController: (options) => new PlaybackController(options),
};

export function createDefaultOpenSession(
  ownerDocument: Document,
  persistence: PlaybackPersistence & { forLibraryScore(libraryScoreId: string): PlaybackPersistence },
  dependencies: DefaultOpenSessionDependencies = defaultOpenSessionDependencies,
): (file: ViewerFile, libraryScoreId?: string) => Promise<ViewerSessionHandle> {
  return async (file, libraryScoreId) => {
    const alphaTabHost = required<HTMLElement>(ownerDocument, "alpha-tab");
    const scoreScrollElement = alphaTabHost.parentElement;
    if (!scoreScrollElement) throw new Error("Viewer DOM is missing the score scroll container");
    const status = required<HTMLElement>(ownerDocument, "status");
    const summary = required<HTMLElement>(ownerDocument, "summary");
    renderViewerState(status, summary, { status: "loading" });
    alphaTabHost.replaceChildren();
    const api = dependencies.createApi(alphaTabHost, createViewerAlphaTabSettings(scoreScrollElement));
    const adapter = dependencies.createAdapter(api);
    let controller: PlaybackController | undefined;
    try {
      const state = await dependencies.presentFile({
        file: {
          name: file.fileName,
          async arrayBuffer() {
            return file.bytes.slice().buffer;
          },
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
        persistence: libraryScoreId === undefined ? persistence : persistence.forLibraryScore(libraryScoreId),
        baseSidecar: createDefaultSidecar(state.identity),
        tracks: model.tracks,
        timeline: model.timeline,
        baseTempo: model.baseTempo,
      });
      controller = sessionController;
      await sessionController.initialize();
      let playbackSnapshot = sessionController.getState();
      const playbackListeners = new Set<(state: typeof playbackSnapshot) => void>();
      const unsubscribePlayback = sessionController.subscribe((state) => {
        playbackSnapshot = state;
        for (const listener of playbackListeners) listener(state);
      });
      renderViewerState(status, summary, state);
      return {
        playback: {
          getState: () => playbackSnapshot,
          subscribe(listener) {
            playbackListeners.add(listener);
            listener(playbackSnapshot);
            return () => playbackListeners.delete(listener);
          },
          dispatch: (command) => sessionController.dispatch(command),
          timeline: model.timeline,
        },
        async togglePlayback() {
          await sessionController.dispatch({ type: "toggle-playback" });
        },
        async pauseAndFlush() {
          await sessionController.dispatch({ type: "pause" });
          await sessionController.flush();
        },
        async destroy() {
          unsubscribePlayback();
          playbackListeners.clear();
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
        throw new AggregateError([error, cleanupError], "Viewer session initialization and cleanup both failed");
      }
      renderViewerState(status, summary, {
        status: "error",
        issueCode: "viewer-load-failed",
      });
      return emptySession();
    }
  };
}

export function renderViewerState(status: HTMLElement, summary: HTMLElement, state: DemoState): void {
  const locale = resolveLocale("system", [status.ownerDocument.documentElement.lang]);
  const t = createAppI18n(locale).getFixedT(locale, "viewer");
  status.textContent =
    state.status === "loading"
      ? t("page.loading")
      : state.status === "ready" && state.summary
        ? t("page.loaded", { title: state.summary.title })
        : demoIssueMessage(state.issueCode, t);
  if (state.status !== "ready" || !state.summary) {
    summary.textContent = t("page.title");
    return;
  }
  summary.textContent = state.summary.title;
}

function demoIssueMessage(
  issueCode: DemoState["issueCode"],
  t: ReturnType<ReturnType<typeof createAppI18n>["getFixedT"]>,
): string {
  if (issueCode === "gp-file-required") return t("page.gpRequired");
  if (issueCode === "alpha-tab-load-failed") return t("page.alphaTabFailed");
  return t("page.loadFailed");
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

export function createViewerAlphaTabSettings(scrollElement: HTMLElement): unknown {
  const chineseSerifFonts = "Georgia, 'Songti SC', 'STSong', SimSun, 'Noto Serif SC', serif";
  const chineseSansFonts = "Arial, 'PingFang SC', 'Microsoft YaHei', 'Heiti SC', 'Noto Sans SC', sans-serif";
  return {
    core: {
      useWorkers: false,
      includeNoteBounds: true,
      scriptFile: ALPHATAB_ASSETS.scriptFile,
      fontDirectory: ALPHATAB_ASSETS.fontDirectory,
    },
    player: {
      enablePlayer: true,
      enableCursor: true,
      enableAnimatedBeatCursor: true,
      enableElementHighlighting: true,
      enableUserInteraction: true,
      scrollElement,
      soundFont: ALPHATAB_ASSETS.soundFont,
    },
    display: {
      scale: 1,
      resources: {
        secondaryGlyphColor: "#000000",
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
