import {
  AlphaTabPlaybackAdapter,
  PlaybackController,
  attachAlphaTabGestureSelection,
  attachAlphaTabNavigationEvents,
  createAlphaTabApi,
  createDefaultSidecar,
  extractAlphaTabPlaybackModel,
  extractAlphaTabPlaybackOccurrences,
  playbackPositionForWrittenSelection,
  waitForAlphaTabScore,
  type AlphaTabApiLike,
  type PlaybackPersistence,
} from "@zupulse/web-core";
import { createAppI18n, resolveLocale } from "@zupulse/app-i18n";
import type { ViewerFile, ViewerSessionHandle } from "./host";
import { ALPHATAB_ASSETS } from "./playbackAssets";
import { type DemoState } from "./gpDemoPresenter";
import { presentScoreFile } from "./importPresenter";
import { SCORE_ZOOM_COMMIT_EVENT, type ScoreZoomCommitDetail } from "./scoreZoom";
import { ScoreNavigationCoordinator } from "./score-navigation/score-navigation-coordinator";
import { readAlphaTabStaffSystems } from "./score-navigation/alpha-tab-navigation";
import { attachScoreNavigationInputs } from "./score-navigation/score-navigation-inputs";

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
    const scoreScrollElement =
      (alphaTabHost.closest(".scrollable") as HTMLElement | null) ?? alphaTabHost.parentElement;
    if (!scoreScrollElement) throw new Error("Viewer DOM is missing the score scroll container");
    const status = required<HTMLElement>(ownerDocument, "status");
    const summary = required<HTMLElement>(ownerDocument, "summary");
    renderViewerState(status, summary, { status: "loading" });
    alphaTabHost.replaceChildren();
    const initialScoreZoom = Number(alphaTabHost.dataset.scoreZoom) || 1;
    const api = dependencies.createApi(
      alphaTabHost,
      createViewerAlphaTabSettings(scoreScrollElement, initialScoreZoom),
    );
    const adapter = dependencies.createAdapter(api);
    const detachScoreZoom = attachScoreZoomCommit(ownerDocument, api, scoreScrollElement);
    const navigation = new ScoreNavigationCoordinator({
      viewportHeight: () => scoreScrollElement.clientHeight,
      moveTo(top, behavior) {
        const reducedMotion = ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        if (typeof scoreScrollElement.scrollTo === "function") {
          scoreScrollElement.scrollTo({
            top,
            behavior: behavior === "smooth" && !reducedMotion ? "smooth" : "auto",
          });
        } else {
          scoreScrollElement.scrollTop = top;
        }
      },
    });
    const detachNavigationInputs = attachScoreNavigationInputs(scoreScrollElement, {
      mode: () => navigation.getSnapshot().mode,
      manualNavigation: () => navigation.manualNavigation(),
      movePage: (delta) => navigation.movePage(delta),
    });
    const detachNavigation = attachAlphaTabNavigationEvents(api, {
      renderFinished: () => {
        navigation.beginGeneration();
        const systems = readAlphaTabStaffSystems(api);
        if (systems) navigation.setSystems(systems);
      },
      cursorSystemChanged: (system) =>
        navigation.cursorSystemChanged(
          { systemIndex: system.systemIndex, y: system.bounds.y, height: system.bounds.height },
          navigation.isScrubPreviewing(),
        ),
    });
    const resizeObserver =
      ownerDocument.defaultView?.ResizeObserver === undefined
        ? undefined
        : new ownerDocument.defaultView.ResizeObserver(() => {
            const systems = readAlphaTabStaffSystems(api);
            if (!systems) return;
            navigation.beginGeneration();
            navigation.setSystems(systems);
          });
    resizeObserver?.observe(scoreScrollElement);
    const detachNavigationRuntime = () => {
      detachNavigation();
      detachNavigationInputs();
      resizeObserver?.disconnect();
    };
    let detachScoreSelection = () => {};
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
        detachNavigationRuntime();
        detachScoreZoom();
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
      const playbackOccurrences = extractAlphaTabPlaybackOccurrences(api, "track-0", model.timeline);
      detachScoreSelection = attachAlphaTabGestureSelection(api, alphaTabHost, (selection) => {
        const position = playbackPositionForWrittenSelection(
          selection,
          sessionController.getState().position,
          model.timeline,
          playbackOccurrences,
        );
        if (!position) return;
        navigation.formalSeek();
        void sessionController.dispatch({
          type: "seek",
          position,
        });
      });
      let playbackSnapshot = sessionController.getState();
      let navigationLoopKey = "";
      const playbackListeners = new Set<(state: typeof playbackSnapshot) => void>();
      const unsubscribePlayback = sessionController.subscribe((state) => {
        const previousTransport = playbackSnapshot.transport;
        playbackSnapshot = state;
        const activeLoop = state.loops.find((loop) => loop.id === state.activeLoopId);
        const nextLoopKey =
          state.looping && activeLoop ? `${activeLoop.start.measureIndex}:${activeLoop.end.measureIndex}` : "";
        if (nextLoopKey !== navigationLoopKey) {
          navigationLoopKey = nextLoopKey;
          navigation.setLoopMeasureRange(
            state.looping && activeLoop
              ? {
                  startMeasureIndex: activeLoop.start.measureIndex,
                  endMeasureIndex: activeLoop.end.measureIndex,
                }
              : undefined,
          );
        }
        if (transportEnteredStopped(previousTransport, state.transport)) {
          navigation.transportChanged(state.transport);
        }
        for (const listener of playbackListeners) listener(state);
      });
      renderViewerState(status, summary, state);
      return {
        navigation: {
          getState: () => navigation.getSnapshot(),
          subscribe: (listener) => navigation.subscribe(listener),
          setMode: (mode) => navigation.setMode(mode),
          returnToPlayback: () => navigation.returnToPlayback(),
          movePage: (delta) => navigation.movePage(delta),
        },
        playback: {
          getState: () => playbackSnapshot,
          subscribe(listener) {
            playbackListeners.add(listener);
            listener(playbackSnapshot);
            return () => playbackListeners.delete(listener);
          },
          dispatch: (command) => {
            if (command.type === "seek") navigation.formalSeek();
            if (command.type === "stop") navigation.transportChanged("stopped");
            return sessionController.dispatch(command);
          },
          previewSeek: (position) => {
            navigation.beginScrubPreview();
            sessionController.previewSeek(position);
          },
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
          detachScoreSelection();
          detachNavigationRuntime();
          detachScoreZoom();
          unsubscribePlayback();
          playbackListeners.clear();
          await sessionController.destroy();
        },
      };
    } catch (error) {
      let cleanupError: unknown;
      try {
        detachScoreSelection();
        detachNavigationRuntime();
        detachScoreZoom();
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

export function transportEnteredStopped(previous: string, current: string): current is "stopped" {
  return previous !== "stopped" && current === "stopped";
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

export function createViewerAlphaTabSettings(scrollElement: HTMLElement, scoreZoom = 1): unknown {
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
      enableUserInteraction: false,
      scrollElement,
      soundFont: ALPHATAB_ASSETS.soundFont,
    },
    display: {
      scale: scoreZoom,
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

export function attachScoreZoomCommit(
  ownerDocument: Document,
  api: AlphaTabApiLike,
  scrollElement: HTMLElement,
  schedule: (callback: () => void) => void = (callback) => requestAnimationFrame(callback),
): () => void {
  const commit = (event: Event) => {
    const zoom = (event as CustomEvent<ScoreZoomCommitDetail>).detail?.zoom;
    if (!Number.isFinite(zoom) || !api.settings?.display) return;
    const scrollRange = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
    const scrollRatio = scrollRange === 0 ? 0 : scrollElement.scrollTop / scrollRange;
    api.settings.display.scale = zoom;
    api.updateSettings?.();
    schedule(() => {
      const nextRange = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
      scrollElement.scrollTop = scrollRatio * nextRange;
    });
  };
  ownerDocument.addEventListener(SCORE_ZOOM_COMMIT_EVENT, commit);
  return () => ownerDocument.removeEventListener(SCORE_ZOOM_COMMIT_EVENT, commit);
}
