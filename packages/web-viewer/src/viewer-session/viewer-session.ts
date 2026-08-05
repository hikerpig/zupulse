import {
  AlphaTabPlaybackAdapter,
  PlaybackController,
  attachAlphaTabGestureSelection,
  attachAlphaTabNavigationEvents,
  buildAlphaTabPianoKeyTimeline,
  createAlphaTabApi,
  createDefaultSidecar,
  extractAlphaTabPlaybackModel,
  extractAlphaTabPlaybackOccurrences,
  playbackPositionForWrittenSelection,
  waitForAlphaTabScore,
  type AlphaTabApiLike,
  type PlaybackCommand,
  type PlaybackPersistence,
  type PlaybackState,
  type PlaybackTimelineMap,
} from "@zupulse/web-core";
import { createAppI18n, resolveLocale } from "@zupulse/app-i18n";
import { ViewerOpenFailure, type ViewerDomBindings, type ViewerFile, type ViewerOpenFailureStage } from "../host";
import type {
  ViewerPianoKeyVisualization,
  ViewerSessionCommand,
  ViewerSessionPort,
  ViewerSessionSnapshot,
} from "./viewer-session-types";
import { ALPHATAB_ASSETS } from "../playbackAssets";
import { type DemoState } from "../gpDemoPresenter";
import { presentScoreFile } from "../importPresenter";
import { ScoreNavigationCoordinator, type ScoreViewportPort } from "../score-navigation/score-navigation-coordinator";
import {
  readAlphaTabMeasureBounds,
  readAlphaTabStaffBounds,
  readAlphaTabStaffSystems,
  type ScoreStaffBounds,
} from "../score-navigation/alpha-tab-navigation";
import { attachScoreNavigationInputs } from "../score-navigation/score-navigation-inputs";
import type { ScoreMeasureBounds } from "../practice-loop/loop-range-geometry";
import { attachScoreZoomCommit, createViewerAlphaTabSettings } from "../alpha-tab/alpha-tab-settings";

export type DefaultOpenSessionDependencies = {
  createApi: typeof createAlphaTabApi;
  createAdapter(api: AlphaTabApiLike): AlphaTabPlaybackAdapter;
  presentFile: typeof presentScoreFile;
  waitForScore: typeof waitForAlphaTabScore;
  extractModel: typeof extractAlphaTabPlaybackModel;
  createController(options: ConstructorParameters<typeof PlaybackController>[0]): PlaybackController;
  buildPianoKeyTimeline?: typeof buildAlphaTabPianoKeyTimeline;
  createNavigation?(viewport: ScoreViewportPort): ScoreNavigationCoordinator;
};

const defaultOpenSessionDependencies: DefaultOpenSessionDependencies = {
  createApi: createAlphaTabApi,
  createAdapter: (api) => new AlphaTabPlaybackAdapter(api, ALPHATAB_ASSETS.soundFont),
  presentFile: presentScoreFile,
  waitForScore: waitForAlphaTabScore,
  extractModel: extractAlphaTabPlaybackModel,
  createController: (options) => new PlaybackController(options),
  buildPianoKeyTimeline: buildAlphaTabPianoKeyTimeline,
};

function defaultCreateNavigation(viewport: ScoreViewportPort): ScoreNavigationCoordinator {
  return new ScoreNavigationCoordinator(viewport);
}

export class ViewerSession {
  private readonly ownerDocument: Document;
  private readonly persistence: PlaybackPersistence & { forLibraryScore(libraryScoreId: string): PlaybackPersistence };
  private readonly dependencies: DefaultOpenSessionDependencies;

  private api: AlphaTabApiLike | undefined;
  private adapter: AlphaTabPlaybackAdapter | undefined;
  private detachScoreZoom: (() => void) | undefined;
  private navigation: ScoreNavigationCoordinator | undefined;
  private loopMeasureBounds: ScoreMeasureBounds[] = [];
  private staffBounds: ScoreStaffBounds[] = [];
  private detachNavigationRuntime: (() => void) | undefined;
  private detachScoreSelection: (() => void) | undefined;
  private unsubscribePlayback: (() => void) | undefined;
  private unsubscribeNavigation: (() => void) | undefined;
  private controller: PlaybackController | undefined;
  private playbackSnapshot: PlaybackState | undefined;
  private playbackTimeline: PlaybackTimelineMap | undefined;
  private navigationSnapshot: ViewerSessionSnapshot["navigation"];
  private navigationLoopKey = "";
  private pianoKeyVisualization: ViewerPianoKeyVisualization | undefined;
  private snapshot: ViewerSessionSnapshot = {
    loopEditor: { measureBounds: [], staffBounds: [] },
  };
  private readonly listeners = new Set<() => void>();
  private destroyPromise: Promise<void> | undefined;
  private destroyed = false;

  constructor(
    ownerDocument: Document,
    persistence: PlaybackPersistence & { forLibraryScore(libraryScoreId: string): PlaybackPersistence },
    dependencies: DefaultOpenSessionDependencies,
  ) {
    this.ownerDocument = ownerDocument;
    this.persistence = persistence;
    this.dependencies = dependencies;
  }

  getSnapshot = (): ViewerSessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async dispatch(command: ViewerSessionCommand): Promise<void> {
    if (this.destroyed) throw new Error("Viewer session has been destroyed");
    if (command.type === "playback") {
      await this.routePlaybackCommand(command.command);
      return;
    }
    if (command.type === "preview-seek") {
      this.routePreviewSeek(command.position);
      return;
    }
    if (command.type === "pause-and-flush") {
      await this.controller?.dispatch({ type: "pause" });
      await this.controller?.flush();
      return;
    }
    const navigation = this.requireNavigation();
    if (command.command.type === "set-mode") navigation.setMode(command.command.mode);
    if (command.command.type === "return-to-playback") navigation.returnToPlayback();
    if (command.command.type === "move-page") navigation.movePage(command.command.delta);
  }

  async destroy(): Promise<void> {
    this.destroyPromise ??= this.destroySession();
    await this.destroyPromise;
  }

  async open(file: ViewerFile, libraryScoreId?: string, domBindings?: ViewerDomBindings): Promise<ViewerSessionPort> {
    if (this.destroyed) throw new Error("Viewer session has been destroyed");
    if (!domBindings) throw new ViewerOpenFailure("session");
    const { alphaTabHost, scoreScrollElement, status, summary } = domBindings;
    renderViewerState(status, summary, { status: "loading" });
    alphaTabHost.replaceChildren();
    const initialScoreZoom = Number(alphaTabHost.dataset.scoreZoom) || 1;
    const api = this.dependencies.createApi(
      alphaTabHost,
      createViewerAlphaTabSettings(scoreScrollElement, initialScoreZoom),
    );
    this.api = api;
    const adapter = this.dependencies.createAdapter(api);
    this.adapter = adapter;
    this.detachScoreZoom = attachScoreZoomCommit(this.ownerDocument, api, scoreScrollElement);
    const navigation = (this.dependencies.createNavigation ?? defaultCreateNavigation)({
      viewportHeight: () => scoreScrollElement.clientHeight,
      moveTo: (top, behavior) => {
        const reducedMotion = this.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
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
    this.navigation = navigation;
    this.navigationSnapshot = navigation.getSnapshot();
    this.unsubscribeNavigation = navigation.subscribe(() => {
      this.navigationSnapshot = navigation.getSnapshot();
      this.publishSnapshot();
    });
    this.refreshLoopMeasureBounds();
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
        this.refreshLoopMeasureBounds();
      },
      cursorSystemChanged: (system) =>
        navigation.cursorSystemChanged(
          { systemIndex: system.systemIndex, y: system.bounds.y, height: system.bounds.height },
          navigation.isScrubPreviewing(),
        ),
    });
    const resizeObserver =
      this.ownerDocument.defaultView?.ResizeObserver === undefined
        ? undefined
        : new this.ownerDocument.defaultView.ResizeObserver(() => {
            const systems = readAlphaTabStaffSystems(api);
            if (!systems) return;
            navigation.beginGeneration();
            navigation.setSystems(systems);
            this.refreshLoopMeasureBounds();
          });
    resizeObserver?.observe(scoreScrollElement);
    this.detachNavigationRuntime = () => {
      detachNavigation();
      detachNavigationInputs();
      resizeObserver?.disconnect();
    };
    let failureStage: ViewerOpenFailureStage = "render";
    try {
      const state = await this.dependencies.presentFile({
        file: {
          name: file.fileName,
          async arrayBuffer() {
            return file.bytes.slice().buffer;
          },
        },
        api,
      });
      if (state.status !== "ready" || !state.identity) {
        this.detachNavigationRuntime();
        this.unsubscribeNavigation?.();
        this.detachScoreZoom?.();
        adapter.destroy();
        renderViewerState(status, summary, state);
        if (libraryScoreId !== undefined) throw new ViewerOpenFailure("render");
        return emptySession();
      }

      await this.dependencies.waitForScore(api);
      const model = this.dependencies.extractModel(api);
      failureStage = "session";
      const sessionController = this.dependencies.createController({
        sessionId: crypto.randomUUID(),
        identity: state.identity,
        engine: adapter,
        persistence: libraryScoreId === undefined ? this.persistence : this.persistence.forLibraryScore(libraryScoreId),
        baseSidecar: createDefaultSidecar(state.identity),
        tracks: model.tracks,
        timeline: model.timeline,
        baseTempo: model.baseTempo,
      });
      this.controller = sessionController;
      await sessionController.initialize();
      this.pianoKeyVisualization = createPianoKeyVisualizationSource(api, sessionController, this.dependencies);
      const playbackOccurrences = extractAlphaTabPlaybackOccurrences(api, "track-0", model.timeline);
      this.detachScoreSelection = attachAlphaTabGestureSelection(api, alphaTabHost, (selection) => {
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
      this.playbackSnapshot = sessionController.getState();
      this.playbackTimeline = model.timeline;
      this.unsubscribePlayback = sessionController.subscribe((state) => this.applyNavigationPolicy(state));
      this.publishSnapshot();
      renderViewerState(status, summary, state);
      return this;
    } catch (error) {
      let cleanupError: unknown;
      try {
        this.detachScoreSelection?.();
        this.detachNavigationRuntime?.();
        this.unsubscribeNavigation?.();
        this.detachScoreZoom?.();
        if (this.controller) await this.controller.destroy();
        else this.adapter?.destroy();
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
  }

  /**
   * Navigation policy over a playback snapshot. Fires loop-range updates only when the effective
   * loop boundary changes (not on every tick) and restores following when transport enters stopped.
   */
  applyNavigationPolicy(state: PlaybackState): void {
    const previousTransport = this.playbackSnapshot?.transport;
    this.playbackSnapshot = state;
    const navigation = this.requireNavigation();
    const projection = navigationLoopProjection(state);
    if (projection.key !== this.navigationLoopKey) {
      this.navigationLoopKey = projection.key;
      navigation.setLoopMeasureRange(projection.range);
    }
    if (transportEnteredStopped(previousTransport, state.transport)) {
      navigation.transportChanged(state.transport);
    }
    this.publishSnapshot();
  }

  routePlaybackCommand(command: PlaybackCommand): Promise<void> {
    const navigation = this.requireNavigation();
    if (command.type === "seek") navigation.formalSeek();
    if (command.type === "stop") navigation.transportChanged("stopped");
    const controller = this.controller;
    if (!controller) throw new Error("Viewer playback is unavailable");
    return controller.dispatch(command);
  }

  routePreviewSeek(position: PlaybackState["position"]): void {
    this.requireNavigation().beginScrubPreview();
    const controller = this.controller;
    if (!controller) throw new Error("Viewer playback is unavailable");
    controller.previewSeek(position);
  }

  private refreshLoopMeasureBounds(): void {
    if (!this.api) return;
    this.loopMeasureBounds = readAlphaTabMeasureBounds(this.api) ?? [];
    this.staffBounds = readAlphaTabStaffBounds(this.api) ?? [];
    this.publishSnapshot();
  }

  private publishSnapshot(): void {
    this.snapshot = {
      ...(this.playbackSnapshot && this.playbackTimeline
        ? { playback: { state: this.playbackSnapshot, timeline: this.playbackTimeline } }
        : {}),
      ...(this.navigationSnapshot ? { navigation: this.navigationSnapshot } : {}),
      loopEditor: {
        measureBounds: this.loopMeasureBounds,
        staffBounds: this.staffBounds,
      },
      ...(this.pianoKeyVisualization ? { pianoKeyVisualization: this.pianoKeyVisualization } : {}),
    };
    for (const listener of this.listeners) listener();
  }

  private requireNavigation(): ScoreNavigationCoordinator {
    if (!this.navigation) throw new Error("Viewer session has not been opened");
    return this.navigation;
  }

  private async destroySession(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.detachScoreSelection?.();
    this.detachNavigationRuntime?.();
    this.detachScoreZoom?.();
    this.unsubscribePlayback?.();
    this.unsubscribeNavigation?.();
    this.listeners.clear();
    await this.controller?.destroy();
  }
}

export function createDefaultOpenSession(
  ownerDocument: Document,
  persistence: PlaybackPersistence & { forLibraryScore(libraryScoreId: string): PlaybackPersistence },
  dependencies: DefaultOpenSessionDependencies = defaultOpenSessionDependencies,
): (file: ViewerFile, libraryScoreId?: string, domBindings?: ViewerDomBindings) => Promise<ViewerSessionPort> {
  return (file, libraryScoreId, domBindings) =>
    new ViewerSession(ownerDocument, persistence, dependencies).open(file, libraryScoreId, domBindings);
}

function createPianoKeyVisualizationSource(
  api: AlphaTabApiLike,
  controller: PlaybackController,
  dependencies: DefaultOpenSessionDependencies,
): ViewerPianoKeyVisualization | undefined {
  const practice = controller.getState().pianoPractice;
  const buildTimeline = dependencies.buildPianoKeyTimeline ?? buildAlphaTabPianoKeyTimeline;
  if (!practice?.mapping || !api.score || !api.settings) return undefined;
  let loaded = false;
  let events: ReturnType<typeof buildTimeline> | undefined;
  return {
    loadEvents: () => {
      if (!loaded) {
        loaded = true;
        try {
          const generated = buildTimeline(api.score as never, api.settings as never, practice.mapping!);
          events = generated.length > 0 ? generated : undefined;
        } catch {
          events = undefined;
        }
      }
      return events;
    },
    getTick: () => api.tickPosition ?? controller.getState().position?.tick ?? 0,
  };
}

function navigationLoopProjection(state: PlaybackState): {
  key: string;
  range: { startMeasureIndex: number; endMeasureIndex: number } | undefined;
} {
  const activeLoop = state.loops.find((loop) => loop.id === state.activeLoopId);
  const draftLoop =
    state.loopDraft.start && state.loopDraft.end && state.loopDraft.start.tick < state.loopDraft.end.tick
      ? { start: state.loopDraft.start, end: state.loopDraft.end }
      : undefined;
  const effectiveLoop = activeLoop ?? draftLoop;
  if (!state.looping || !effectiveLoop) return { key: "", range: undefined };
  return {
    key: `${effectiveLoop.start.measureIndex}:${effectiveLoop.end.measureIndex}`,
    range: {
      startMeasureIndex: effectiveLoop.start.measureIndex,
      endMeasureIndex: effectiveLoop.end.measureIndex,
    },
  };
}

export function transportEnteredStopped(previous: string | undefined, current: string): current is "stopped" {
  return previous !== undefined && previous !== "stopped" && current === "stopped";
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

function emptySession(): ViewerSessionPort {
  return {
    getSnapshot: () => ({ loopEditor: { measureBounds: [], staffBounds: [] } }),
    subscribe: () => () => undefined,
    dispatch: async () => undefined,
    destroy: async () => undefined,
  };
}
