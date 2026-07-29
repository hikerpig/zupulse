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
import {
  ViewerOpenFailure,
  type ViewerDomBindings,
  type ViewerFile,
  type ViewerOpenFailureStage,
  type ViewerSessionHandle,
} from "./host";
import { ALPHATAB_ASSETS } from "./playbackAssets";
import { type DemoState } from "./gpDemoPresenter";
import { presentScoreFile } from "./importPresenter";
import {
  SCORE_LAYOUT_COMMIT_EVENT,
  SCORE_ZOOM_COMMIT_EVENT,
  type ScoreLayoutCommitDetail,
  type ScoreZoomCommitDetail,
} from "./scoreZoom";
import { ScoreNavigationCoordinator } from "./score-navigation/score-navigation-coordinator";
import {
  readAlphaTabMeasureBounds,
  readAlphaTabStaffBounds,
  readAlphaTabStaffSystems,
} from "./score-navigation/alpha-tab-navigation";
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
): (file: ViewerFile, libraryScoreId?: string, domBindings?: ViewerDomBindings) => Promise<ViewerSessionHandle> {
  return async (file, libraryScoreId, domBindings?: ViewerDomBindings) => {
    if (!domBindings) throw new ViewerOpenFailure("session");
    const { alphaTabHost, scoreScrollElement, status, summary } = domBindings;
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
    let loopMeasureBounds = readAlphaTabMeasureBounds(api) ?? [];
    let staffBounds = readAlphaTabStaffBounds(api) ?? [];
    const loopEditorListeners = new Set<() => void>();
    const refreshLoopMeasureBounds = () => {
      loopMeasureBounds = readAlphaTabMeasureBounds(api) ?? [];
      staffBounds = readAlphaTabStaffBounds(api) ?? [];
      for (const listener of loopEditorListeners) listener();
    };
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
        refreshLoopMeasureBounds();
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
            refreshLoopMeasureBounds();
          });
    resizeObserver?.observe(scoreScrollElement);
    const detachNavigationRuntime = () => {
      detachNavigation();
      detachNavigationInputs();
      resizeObserver?.disconnect();
    };
    let detachScoreSelection = () => {};
    let controller: PlaybackController | undefined;
    let failureStage: ViewerOpenFailureStage = "render";
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
        if (libraryScoreId !== undefined) throw new ViewerOpenFailure("render");
        return emptySession();
      }

      await dependencies.waitForScore(api);
      const model = dependencies.extractModel(api);
      failureStage = "session";
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
        const draftLoop =
          state.loopDraft.start && state.loopDraft.end && state.loopDraft.start.tick < state.loopDraft.end.tick
            ? { start: state.loopDraft.start, end: state.loopDraft.end }
            : undefined;
        const effectiveLoop = activeLoop ?? draftLoop;
        const nextLoopKey =
          state.looping && effectiveLoop ? `${effectiveLoop.start.measureIndex}:${effectiveLoop.end.measureIndex}` : "";
        if (nextLoopKey !== navigationLoopKey) {
          navigationLoopKey = nextLoopKey;
          navigation.setLoopMeasureRange(
            state.looping && effectiveLoop
              ? {
                  startMeasureIndex: effectiveLoop.start.measureIndex,
                  endMeasureIndex: effectiveLoop.end.measureIndex,
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
        loopEditor: {
          getMeasureBounds: () => loopMeasureBounds,
          getStaffBounds: () => staffBounds,
          subscribe(listener) {
            loopEditorListeners.add(listener);
            return () => loopEditorListeners.delete(listener);
          },
        },
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
          loopEditorListeners.clear();
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
      if (libraryScoreId !== undefined) {
        if (error instanceof ViewerOpenFailure) throw error;
        throw new ViewerOpenFailure(failureStage, { cause: error });
      }
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
      padding: [16, 16],
      stretchForce: 0.5,
      systemPaddingTop: 6,
      systemPaddingBottom: 6,
      resources: {
        secondaryGlyphColor: "#000000",
        titleFont: `28px ${chineseSerifFonts}`,
        subTitleFont: `18px ${chineseSerifFonts}`,
        wordsFont: `14px ${chineseSansFonts}`,
        tablatureFont: `12px ${chineseSansFonts}`,
        graceFont: `10px ${chineseSansFonts}`,
        barNumberFont: `10px ${chineseSansFonts}`,
        copyrightFont: `bold 11px ${chineseSansFonts}`,
        markerFont: `bold 13px ${chineseSerifFonts}`,
        directionsFont: `13px ${chineseSerifFonts}`,
        timerFont: `11px ${chineseSerifFonts}`,
        fretboardNumberFont: `10px ${chineseSansFonts}`,
        numberedNotationFont: `13px ${chineseSansFonts}`,
        numberedNotationGraceFont: `14px ${chineseSansFonts}`,
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
  type PendingRestore = {
    scoreAnchor: ReturnType<typeof captureScoreAnchor>;
    scrollRatio: number;
    requestedZoom?: number;
    renderingZoom?: number;
  };

  let pendingRestore: PendingRestore | undefined;
  let detachPendingRestore: (() => void) | undefined;

  const clearPendingRestore = () => {
    detachPendingRestore?.();
    detachPendingRestore = undefined;
    pendingRestore = undefined;
  };
  const restore = () => {
    const pending = pendingRestore;
    if (!pending) return;
    if (pending.requestedZoom !== undefined && pending.renderingZoom !== pending.requestedZoom) {
      startZoomRender(pending.requestedZoom);
      return;
    }
    const nextRange = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
    const anchorSystemIndex = pending.scoreAnchor?.systemIndex;
    const nextSystem =
      anchorSystemIndex === undefined
        ? undefined
        : readAlphaTabStaffSystems(api)?.find((system) => system.systemIndex === anchorSystemIndex);
    const nextScrollTop =
      nextSystem && pending.scoreAnchor
        ? nextSystem.y + pending.scoreAnchor.centerOffset - scrollElement.clientHeight / 2
        : undefined;
    scrollElement.scrollTop = Math.min(nextRange, Math.max(0, nextScrollTop ?? pending.scrollRatio * nextRange));
    clearPendingRestore();
  };
  const listenForRender = () => {
    if (detachPendingRestore) return;
    if (api.postRenderFinished) {
      detachPendingRestore = api.postRenderFinished.on(restore) ?? (() => {});
    } else {
      schedule(restore);
    }
  };
  const startZoomRender = (zoom: number) => {
    const pending = pendingRestore;
    if (!pending || !api.settings?.display) return;
    pending.renderingZoom = zoom;
    api.settings.display.scale = zoom;
    api.updateSettings?.();
    listenForRender();
    api.render?.();
  };
  const capturePendingRestore = (): PendingRestore => {
    const scoreAnchor = captureScoreAnchor(api, scrollElement);
    const scrollRange = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
    const scrollRatio = scrollRange === 0 ? 0 : scrollElement.scrollTop / scrollRange;
    return { scoreAnchor, scrollRatio };
  };
  const commitZoom = (event: Event) => {
    const zoom = (event as CustomEvent<ScoreZoomCommitDetail>).detail?.zoom;
    if (!Number.isFinite(zoom) || !api.settings?.display) return;
    if (!pendingRestore) {
      pendingRestore = capturePendingRestore();
    }
    pendingRestore.requestedZoom = zoom;
    if (pendingRestore.renderingZoom === undefined) {
      startZoomRender(zoom);
    }
  };
  const commitLayout = (event: Event) => {
    const reason = (event as CustomEvent<ScoreLayoutCommitDetail>).detail?.reason;
    if (reason !== "width") return;
    clearPendingRestore();
    pendingRestore = capturePendingRestore();
    listenForRender();
  };
  ownerDocument.addEventListener(SCORE_ZOOM_COMMIT_EVENT, commitZoom);
  ownerDocument.addEventListener(SCORE_LAYOUT_COMMIT_EVENT, commitLayout);
  return () => {
    clearPendingRestore();
    ownerDocument.removeEventListener(SCORE_ZOOM_COMMIT_EVENT, commitZoom);
    ownerDocument.removeEventListener(SCORE_LAYOUT_COMMIT_EVENT, commitLayout);
  };
}

function captureScoreAnchor(
  api: AlphaTabApiLike,
  scrollElement: HTMLElement,
): { systemIndex: number; centerOffset: number } | undefined {
  const systems = readAlphaTabStaffSystems(api);
  if (!systems?.length) return undefined;
  const viewportCenter = scrollElement.scrollTop + scrollElement.clientHeight / 2;
  const system = systems.reduce((closest, candidate) =>
    Math.abs(candidate.y + candidate.height / 2 - viewportCenter) <
    Math.abs(closest.y + closest.height / 2 - viewportCenter)
      ? candidate
      : closest,
  );
  return {
    systemIndex: system.systemIndex,
    centerOffset: viewportCenter - system.y,
  };
}
