import type { ViewerAppHandle, ViewerFile, ViewerHost, ViewerHostEvent, ViewerSessionHandle } from "../host";
import {
  analyzeHarmonyRules,
  applyCorrectionCommand,
  effectiveHarmonyProjection,
  importLibraryScores,
  listMusicXmlPartIds,
  parseSourceHarmonyEvents,
  projectAlphaTabHarmonyInput,
  projectSourceHarmonyEvents,
  readMusicXmlRootXml,
  compareMoments,
  bundledHarmonyPrimaryMlp,
  bundledHarmonyRankerModel,
} from "@zupulse/web-core";
import type {
  AnnotationTarget,
  HarmonyAnalysisDocument,
  HarmonyAnalysisRepository,
  HarmonyCorrection,
  LibraryScore,
  ScoreFileGateway,
  ScoreFormatAdapter,
  SheetLibraryRepository,
  LibraryScoreSummary,
  ImportItemResult,
  PreviewTransportState,
  ScoreImportSource,
} from "@zupulse/web-core";
import { insertCorrection } from "@zupulse/web-core";
import { HarmonyStudioSession } from "../harmonyStudioSession";
import type { HarmonyStudioSessionState } from "../harmonyStudioSession";
import { exportHarmonyStudioDocument } from "../harmonyStudioExport";
import type { StudioScoreRuntime, StudioScoreRuntimeSnapshot } from "../studio-score-runtime";
import { ApplicationFailure, applicationIssue, type ApplicationIssue } from "./applicationIssue";
import {
  createHarmonyRangeViewItems,
  restoreHarmonySelection,
  selectContainingHarmonyRange,
  type HarmonyRangeViewItem,
  type HarmonySelection,
} from "../features/harmony-studio/harmony-range-view-model";

export type ViewerApplicationSnapshot = {
  currentSessionId?: string;
  currentLibraryScoreId?: string;
  library?: {
    scores: readonly LibraryScoreSummary[];
    loading: boolean;
    error?: ApplicationIssue;
    importing?: boolean;
    importSummary?: {
      total: number;
      results: readonly ImportItemResult[];
      cancelled: number;
      running: boolean;
    };
  };
  studio?: {
    libraryScoreId: string;
    status: "loading" | "analyzing" | "ready" | "unsaved" | "saving" | "error" | "conflict";
    availableTrackIds?: readonly string[];
    document?: HarmonyAnalysisDocument;
    ranges?: readonly HarmonyRangeViewItem[];
    selection?: HarmonySelection;
    selectionNotice?: "no-effective-range";
    transport?: PreviewTransportState;
    audioStatus?: StudioScoreRuntimeSnapshot["audio"];
    previewError?: ApplicationIssue;
    audioError?: ApplicationIssue;
    error?: ApplicationIssue;
  };
};

export class ViewerApplication implements ViewerAppHandle {
  private active: ViewerSessionHandle | undefined;
  private activeLibraryScoreId: string | undefined;
  private studioRuntime: StudioScoreRuntime | undefined;
  private studioRuntimeLibraryScoreId: string | undefined;
  private studioPreviewEnabled = true;
  private studioSelectionDetach: (() => void) | undefined;
  private studioErrorDetach: (() => void) | undefined;
  private studioTransportDetach: (() => void) | undefined;
  private studioAudioDetach: (() => void) | undefined;
  private chain = Promise.resolve();
  private queuedError: unknown;
  private destroyPromise?: Promise<void>;
  private studioIntent = 0;
  private studioOpening: { id: string; promise: Promise<void> } | undefined;
  private readonly studioSessions = new Map<string, HarmonyStudioSession>();
  private readonly studioAvailableTrackIds = new Map<string, string[]>();
  private readonly studioSources = new Map<string, { rootXml: string; partIds: readonly string[] }>();
  private destroying = false;
  private importAbortController: AbortController | undefined;
  private snapshot: ViewerApplicationSnapshot = {};
  private readonly listeners = new Set<() => void>();
  private readonly navigationListeners = new Set<(libraryScoreId: string) => void>();
  private readonly unsubscribe: () => void;

  constructor(
    private readonly host: ViewerHost,
    private readonly openSession: (file: ViewerFile, libraryScoreId?: string) => Promise<ViewerSessionHandle>,
    private readonly library?: {
      repository: SheetLibraryRepository;
      gateway: ScoreFileGateway;
      adapters: readonly ScoreFormatAdapter[];
    },
    private readonly openStudioRuntime?: (file: ViewerFile) => Promise<StudioScoreRuntime>,
  ) {
    this.unsubscribe = host.subscribe((event) => this.onHostEvent(event));
    if (library) void this.refreshLibrary();
  }

  getSnapshot = (): ViewerApplicationSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  subscribeNavigation(listener: (libraryScoreId: string) => void): () => void {
    this.navigationListeners.add(listener);
    return () => this.navigationListeners.delete(listener);
  }

  hasSession(sessionId: string): boolean {
    return this.activeLibraryScoreId === sessionId && this.active !== undefined;
  }

  getCurrentSession(): ViewerSessionHandle | undefined {
    return this.active;
  }

  getCurrentStudioSession(): StudioScoreRuntime | undefined {
    return this.studioRuntime;
  }

  openScore(): Promise<void> {
    return this.library ? this.importScores(false).then(() => undefined) : this.scheduleOpen(false);
  }

  requestOpenScore(): void {
    if (this.library) void this.importScores(false).catch(() => undefined);
    else this.enqueueOpen();
  }

  hasLibrary(): boolean {
    return this.library !== undefined;
  }

  hasHarmonyAnalysisStorage(): boolean {
    return this.getHarmonyAnalysisRepository() !== undefined;
  }

  getHarmonyAnalysisRepository(): HarmonyAnalysisRepository | undefined {
    const repository = this.library?.repository as Partial<HarmonyAnalysisRepository> | undefined;
    return typeof repository?.read === "function" &&
      typeof repository.save === "function" &&
      typeof repository.delete === "function"
      ? (repository as HarmonyAnalysisRepository)
      : undefined;
  }

  async getLibraryScore(id: string): Promise<LibraryScore | undefined> {
    return this.library?.repository.get(id as LibraryScore["id"]);
  }

  async openStudio(id: string): Promise<void> {
    if (this.studioOpening?.id === id) return this.studioOpening.promise;
    const operation = this.chain.then(() => this.openStudioOnce(id));
    this.chain = operation.then(
      () => undefined,
      () => undefined,
    );
    const promise = operation.finally(() => {
      if (this.studioOpening?.promise === promise) this.studioOpening = undefined;
    });
    this.studioOpening = { id, promise };
    return promise;
  }

  async setStudioCorrection(
    id: string,
    range: HarmonyCorrection["range"],
    value: HarmonyCorrection["value"],
  ): Promise<void> {
    const current = this.snapshot.studio;
    const session = this.studioSessions.get(id);
    if (!session || current?.libraryScoreId !== id || !current.document) return;
    const updatedAt = new Date().toISOString();
    const document: HarmonyAnalysisDocument = {
      ...current.document,
      corrections: insertCorrection(current.document.corrections, {
        id: crypto.randomUUID(),
        range,
        value,
        updatedAt,
      }),
      updatedAt,
    };
    session.setCorrections(document.corrections);
    await session.flush();
  }

  selectStudioRange(id: string, range: HarmonyCorrection["range"]): void {
    const studio = this.snapshot.studio;
    if (studio?.libraryScoreId !== id) return;
    this.studioRuntime?.highlight(range);
    this.setStudio(id, { ...studio, selection: { focus: range.start, range } });
  }

  toggleStudioPreview(id: string): void {
    if (this.studioRuntimeLibraryScoreId !== id) return;
    const result = this.studioRuntime?.togglePlayback();
    this.syncStudioTransport(id);
    this.setStudioAudioError(id, result?.status);
  }

  setStudioPreviewPosition(id: string, positionTicks: number): void {
    if (this.studioRuntimeLibraryScoreId !== id) return;
    const result = this.studioRuntime?.setPosition(positionTicks);
    this.syncStudioTransport(id);
    this.setStudioAudioError(id, result?.status);
  }

  setStudioPreviewSpeed(id: string, speed: number): void {
    if (this.studioRuntimeLibraryScoreId !== id) return;
    const result = this.studioRuntime?.setSpeed(speed);
    this.syncStudioTransport(id);
    this.setStudioAudioError(id, result?.status);
  }

  setStudioPreviewLoop(id: string, range: HarmonyCorrection["range"] | undefined): void {
    if (this.studioRuntimeLibraryScoreId !== id) return;
    const result = this.studioRuntime?.setLoop(range);
    this.syncStudioTransport(id);
    this.setStudioAudioError(id, result?.status);
  }

  retryStudioPreview(id: string): void {
    const studio = this.snapshot.studio;
    if (studio?.libraryScoreId !== id || !studio.ranges || this.studioRuntimeLibraryScoreId !== id) return;
    const previewError = this.applyStudioPreview(id, studio.ranges);
    if (previewError) {
      this.setStudio(id, { ...studio, previewError });
      return;
    }
    const { previewError: _previewError, ...nextStudio } = studio;
    this.setStudio(id, nextStudio);
  }

  setStudioPreviewEnabled(id: string, enabled: boolean): void {
    if (this.studioRuntimeLibraryScoreId !== id) return;
    this.studioPreviewEnabled = enabled;
    const studio = this.snapshot.studio;
    if (studio?.libraryScoreId !== id || !studio.ranges) return;
    const previewError = this.applyStudioPreview(id, studio.ranges);
    const { previewError: _previousPreviewError, ...nextStudio } = studio;
    this.setStudio(id, {
      ...nextStudio,
      ...(previewError === undefined ? {} : { previewError }),
    });
  }

  private selectStudioMoment(id: string, moment: { measureIndex: number; offsetTicks: number }): void {
    const studio = this.snapshot.studio;
    if (studio?.libraryScoreId !== id || !studio.ranges) return;
    const selection = selectContainingHarmonyRange(studio.ranges, moment);
    if (selection) {
      const { selectionNotice: _selectionNotice, ...nextStudio } = studio;
      this.setStudio(id, { ...nextStudio, selection });
      return;
    }
    this.setStudio(id, {
      ...studio,
      selectionNotice: "no-effective-range",
    });
  }

  async setStudioAnnotationTarget(id: string, annotationTarget: AnnotationTarget): Promise<void> {
    const session = this.studioSessions.get(id);
    if (!session) return;
    session.setAnnotationTarget(annotationTarget);
    await session.flush();
  }

  async resetStudioCorrection(id: string, range: HarmonyCorrection["range"]): Promise<void> {
    const session = this.studioSessions.get(id);
    const document = session?.getState().document;
    if (!session || !document) return;
    session.setCorrections(applyCorrectionCommand(document.corrections, { type: "reset", range }));
    await session.flush();
  }

  async splitStudioCorrection(id: string, range: HarmonyCorrection["range"]): Promise<void> {
    const session = this.studioSessions.get(id);
    const document = session?.getState().document;
    if (!session || !document || range.start.measureIndex !== range.end.measureIndex) return;
    const correction = document.corrections.find(
      (item) => compareMoments(item.range.start, range.start) <= 0 && compareMoments(range.end, item.range.end) <= 0,
    );
    if (!correction) return;
    const distance = range.end.offsetTicks - range.start.offsetTicks;
    if (distance < 2) return;
    const at = {
      measureIndex: range.start.measureIndex,
      offsetTicks: range.start.offsetTicks + Math.floor(distance / 2),
    };
    session.setCorrections(applyCorrectionCommand(document.corrections, { type: "split", id: correction.id, at }));
    await session.flush();
  }

  async mergeStudioCorrections(id: string, range: HarmonyCorrection["range"]): Promise<void> {
    const session = this.studioSessions.get(id);
    const document = session?.getState().document;
    if (!session || !document) return;
    const ordered = [...document.corrections].sort((left, right) =>
      compareMoments(left.range.start, right.range.start),
    );
    const pairIndex = ordered.findIndex((left, index) => {
      const right = ordered[index + 1];
      return (
        right !== undefined &&
        compareMoments(left.range.start, range.start) <= 0 &&
        compareMoments(range.end, right.range.end) <= 0 &&
        compareMoments(left.range.end, right.range.start) === 0
      );
    });
    const left = pairIndex < 0 ? undefined : ordered[pairIndex];
    const right = pairIndex < 0 ? undefined : ordered[pairIndex + 1];
    if (!left || !right) return;
    session.setCorrections(
      applyCorrectionCommand(document.corrections, { type: "merge", leftId: left.id, rightId: right.id }),
    );
    await session.flush();
  }

  async moveStudioCorrection(id: string, range: HarmonyCorrection["range"], deltaTicks: number): Promise<void> {
    if (!Number.isInteger(deltaTicks) || deltaTicks === 0) return;
    const session = this.studioSessions.get(id);
    const document = session?.getState().document;
    if (!session || !document || range.start.measureIndex !== range.end.measureIndex) return;
    const correction = document.corrections.find(
      (item) => compareMoments(item.range.start, range.start) <= 0 && compareMoments(range.end, item.range.end) <= 0,
    );
    if (!correction || correction.range.start.measureIndex !== correction.range.end.measureIndex) return;
    const start = correction.range.start.offsetTicks + deltaTicks;
    const end = correction.range.end.offsetTicks + deltaTicks;
    if (start < 0 || end <= start) return;
    session.setCorrections(
      applyCorrectionCommand(document.corrections, {
        type: "move",
        id: correction.id,
        start: { measureIndex: correction.range.start.measureIndex, offsetTicks: start },
        end: { measureIndex: correction.range.end.measureIndex, offsetTicks: end },
      }),
    );
    await session.flush();
  }

  async setStudioScope(id: string, includedTrackIds: readonly string[]): Promise<void> {
    if (includedTrackIds.length === 0) throw new Error("STUDIO_SCOPE_EMPTY");
    const session = this.studioSessions.get(id);
    if (!session) return;
    const state = await session.setScope(includedTrackIds, ({ scope }) => this.createStudioDocument(id, scope));
    this.setStudioState(id, state);
  }

  async reanalyzeStudio(id: string): Promise<void> {
    const session = this.studioSessions.get(id);
    if (!session) return;
    const state = await session.reanalyze(({ scope }) => this.createStudioDocument(id, scope));
    this.setStudioState(id, state);
  }

  cancelStudioReanalysis(id: string): void {
    const session = this.studioSessions.get(id);
    if (session) this.setStudioState(id, session.cancelReanalysis());
  }

  async flushStudio(id: string): Promise<void> {
    const session = this.studioSessions.get(id);
    if (session) this.setStudioState(id, await session.flush());
  }

  private async openStudioOnce(id: string): Promise<void> {
    const library = this.library;
    const repository = this.getHarmonyAnalysisRepository();
    const intent = ++this.studioIntent;
    if (!library || !repository)
      return this.setStudio(id, {
        status: "error",
        error: applicationIssue("studio-storage-unavailable", false),
      });
    this.setStudio(id, { status: "loading" });
    try {
      const score = await library.repository.get(id as LibraryScore["id"]);
      if (!score) throw new ApplicationFailure(applicationIssue("score-not-found", false));
      if (score.format !== "musicxml")
        throw new ApplicationFailure(applicationIssue("studio-format-unsupported", false));
      const source = await library.repository.readScore(id as LibraryScore["id"]);
      this.studioSources.set(id, {
        rootXml: readMusicXmlRootXml(source.bytes),
        partIds: listMusicXmlPartIds(source.bytes),
      });
      const previousViewer = this.active;
      const previousStudio = this.studioRuntime;
      this.studioSelectionDetach?.();
      this.studioSelectionDetach = undefined;
      this.studioErrorDetach?.();
      this.studioErrorDetach = undefined;
      this.studioTransportDetach?.();
      this.studioTransportDetach = undefined;
      this.studioAudioDetach?.();
      this.studioAudioDetach = undefined;
      this.active = undefined;
      this.activeLibraryScoreId = undefined;
      this.studioRuntime = undefined;
      this.studioRuntimeLibraryScoreId = undefined;
      const {
        currentSessionId: _currentSessionId,
        currentLibraryScoreId: _currentLibraryScoreId,
        ...snapshot
      } = this.snapshot;
      this.setSnapshot(snapshot);
      await previousViewer?.destroy();
      await previousStudio?.destroy();
      if (!this.openStudioRuntime) throw new ApplicationFailure(applicationIssue("studio-runtime-unavailable", false));
      this.studioRuntime = await this.openStudioRuntime(source);
      this.studioRuntimeLibraryScoreId = id;
      this.studioSelectionDetach = this.studioRuntime.subscribeSelection((moment) =>
        this.selectStudioMoment(id, moment),
      );
      this.studioErrorDetach = this.studioRuntime.subscribeErrors((error) => {
        this.reportDiagnostic(error, "studio.preview");
        const studio = this.snapshot.studio;
        if (studio?.libraryScoreId === id)
          this.setStudio(id, { ...studio, previewError: applicationIssue("studio-preview-failed") });
      });
      this.studioTransportDetach = this.studioRuntime.subscribeTransport(() => this.syncStudioTransport(id));
      this.studioAudioDetach = this.studioRuntime.subscribeAudio?.(() => this.syncStudioTransport(id));
      this.studioAvailableTrackIds.set(
        id,
        listMusicXmlPartIds(source.bytes).map((_, index) => `track-${index + 1}`),
      );
      const session = this.getStudioSession(id, repository);
      const state = await session.load(() => this.createStudioDocument(id));
      if (intent === this.studioIntent) this.setStudioState(id, state);
    } catch (error) {
      this.reportDiagnostic(error, "studio.open");
      if (intent === this.studioIntent) {
        this.setStudio(id, {
          status: "error",
          error: error instanceof ApplicationFailure ? error.issue : applicationIssue("studio-analysis-failed"),
        });
      }
    }
  }

  undoStudio(id: string): void {
    const session = this.studioSessions.get(id);
    if (session) this.setStudioState(id, session.undo());
  }

  redoStudio(id: string): void {
    const session = this.studioSessions.get(id);
    if (session) this.setStudioState(id, session.redo());
  }

  async exportStudio(id: string): Promise<"saved" | "cancelled"> {
    const library = this.library;
    const session = this.studioSessions.get(id);
    const document = session?.getState().document;
    if (!library || !session || !document) throw new Error("STUDIO_DOCUMENT_NOT_SAVED");
    const source = await library.repository.readScore(id as LibraryScore["id"]);
    const trackIndex = trackIndexFromId(document.annotationTarget.trackId);
    const partId = listMusicXmlPartIds(source.bytes)[trackIndex];
    if (partId === undefined) throw new Error("ANNOTATION_TARGET_NOT_FOUND");
    const scoreEnd = document.activeRevision.segments.reduce(
      (end, segment) => (compareMoments(segment.range.end, end) > 0 ? segment.range.end : end),
      { measureIndex: 0, offsetTicks: 0 },
    );
    return exportHarmonyStudioDocument({
      session,
      projection: effectiveHarmonyProjection({
        revision: document.activeRevision.segments,
        source: projectSourceHarmonyEvents(
          parseSourceHarmonyEvents(readMusicXmlRootXml(source.bytes), partId),
          scoreEnd,
        ),
        corrections: document.corrections,
      }),
      partId,
      readScore: async () => source,
      gateway: library.gateway,
    });
  }

  private getStudioSession(id: string, repository: HarmonyAnalysisRepository): HarmonyStudioSession {
    const existing = this.studioSessions.get(id);
    if (existing) return existing;
    const session = new HarmonyStudioSession(repository, id, 500, (state) => this.setStudioState(id, state));
    this.studioSessions.set(id, session);
    return session;
  }

  private async createStudioDocument(id: string, requestedScope?: readonly string[]): Promise<HarmonyAnalysisDocument> {
    const library = this.library;
    if (!library) throw new ApplicationFailure(applicationIssue("studio-storage-unavailable", false));
    const score = await library.repository.get(id as LibraryScore["id"]);
    if (!score) throw new ApplicationFailure(applicationIssue("score-not-found", false));
    if (score.format !== "musicxml") throw new ApplicationFailure(applicationIssue("studio-format-unsupported", false));
    const file = await library.repository.readScore(id as LibraryScore["id"]);
    const adapter = library.adapters.find((candidate) => candidate.format === "musicxml");
    if (!adapter) throw new ApplicationFailure(applicationIssue("studio-analyzer-unavailable", false));
    const parsed = await adapter.parse({ fileName: file.fileName, bytes: file.bytes });
    const allTrackIds = parsed.document.tracks.map((track) => track.id);
    const includedTrackIds = requestedScope === undefined ? allTrackIds : [...requestedScope];
    if (includedTrackIds.length === 0)
      throw new ApplicationFailure(applicationIssue("studio-no-analyzable-tracks", false));
    if (includedTrackIds.some((trackId) => !allTrackIds.includes(trackId)))
      throw new Error("STUDIO_SCOPE_TRACK_NOT_FOUND");
    const now = new Date().toISOString();
    return {
      schemaVersion: "1.0.0",
      libraryScoreId: id,
      sourceContentHash: score.scoreIdentity,
      documentVersion: 0,
      activeRevision: {
        id: crypto.randomUUID(),
        algorithmVersion: `rules-${bundledHarmonyRankerModel.algorithmVersion}-${bundledHarmonyPrimaryMlp.algorithmVersion}`,
        createdAt: now,
        parameters: { scope: { includedTrackIds }, topK: 8, decisionThreshold: 0.6 },
        segments: analyzeHarmonyRules(
          projectAlphaTabHarmonyInput(parsed.runtime as Parameters<typeof projectAlphaTabHarmonyInput>[0]),
          {
            includedTrackIds,
            topK: 8,
            decisionThreshold: 0.6,
          },
        ),
      },
      corrections: [],
      annotationTarget: { trackId: includedTrackIds[0]!, staffIndex: 0 },
      updatedAt: now,
    };
  }

  async refreshLibrary(): Promise<void> {
    if (!this.library) return;
    this.setSnapshot({ ...this.snapshot, library: { scores: this.snapshot.library?.scores ?? [], loading: true } });
    try {
      await this.library.repository.initialize();
      const scores = await this.library.repository.list();
      this.setSnapshot({ ...this.snapshot, library: { scores, loading: false } });
    } catch (error) {
      this.reportDiagnostic(error, "library.refresh");
      this.setSnapshot({
        ...this.snapshot,
        library: { scores: [], loading: false, error: applicationIssue("library-unavailable") },
      });
    }
  }

  async importScores(multiple: boolean): Promise<void> {
    if (!this.library) return this.scheduleOpen(false);
    let sources: readonly ScoreImportSource[];
    try {
      sources = await this.library.gateway.selectForImport({ multiple });
    } catch (error) {
      this.reportDiagnostic(error, "library.import.select");
      this.setSnapshot({
        ...this.snapshot,
        library: {
          scores: this.snapshot.library?.scores ?? [],
          loading: false,
          error: applicationIssue("library-unavailable"),
        },
      });
      return;
    }
    if (!sources.length) return;
    await this.importScoreSources(sources, multiple);
  }

  async importScoreSources(sources: readonly ScoreImportSource[], multiple: boolean): Promise<void> {
    if (!this.library || !sources.length || this.importAbortController) return;
    const controller = new AbortController();
    this.importAbortController = controller;
    this.setSnapshot({
      ...this.snapshot,
      library: {
        scores: this.snapshot.library?.scores ?? [],
        loading: false,
        importing: true,
        importSummary: { total: sources.length, results: [], cancelled: 0, running: true },
      },
    });
    const completed: ImportItemResult[] = [];
    const results = await importLibraryScores({
      sources,
      repository: this.library.repository,
      adapters: this.library.adapters,
      signal: controller.signal,
      onResult: (result) => {
        completed.push(result);
        this.setImportSummary(sources.length, completed, false, true);
      },
    }).finally(() => {
      if (this.importAbortController === controller) this.importAbortController = undefined;
    });
    await this.refreshLibrary();
    this.setImportSummary(sources.length, results, controller.signal.aborted, false);
    const successful = results.some((item) => item.status === "created" || item.status === "existing");
    if (!successful) {
      const failure = results.find((item) => item.status === "failed");
      if (multiple || controller.signal.aborted) return;
      this.reportDiagnostic(failure?.error, "library.import");
      this.setSnapshot({
        ...this.snapshot,
        library: {
          scores: this.snapshot.library?.scores ?? [],
          loading: false,
          error: applicationIssue("library-unavailable"),
        },
      });
      return;
    }
    if (!multiple) {
      const result = results.find((item) => item.status === "created" || item.status === "existing");
      if (result && result.status !== "failed")
        for (const listener of this.navigationListeners) listener(result.score.id);
    }
  }

  cancelImport(): void {
    this.importAbortController?.abort();
  }

  dismissImportSummary(): void {
    const library = this.snapshot.library;
    if (!library?.importSummary || library.importSummary.running) return;
    const { importSummary: _importSummary, ...nextLibrary } = library;
    this.setSnapshot({ ...this.snapshot, library: nextLibrary });
  }

  private setImportSummary(
    total: number,
    results: readonly ImportItemResult[],
    cancelled: boolean,
    running: boolean,
  ): void {
    this.setSnapshot({
      ...this.snapshot,
      library: {
        scores: this.snapshot.library?.scores ?? [],
        loading: false,
        importing: running,
        importSummary: {
          total,
          results: [...results],
          cancelled: cancelled ? Math.max(0, total - results.length) : 0,
          running,
        },
      },
    });
  }

  openLibraryScore(id: string): Promise<void> {
    if (!this.library) return Promise.resolve();
    if (this.destroying) return Promise.reject(new Error("Viewer app is being destroyed"));
    const operation = this.chain
      .then(() => (this.hasSession(id) ? undefined : this.openLibraryScoreOnce(id)))
      .catch((error: unknown) => {
        this.reportDiagnostic(error, "library.open");
        this.setSnapshot({
          ...this.snapshot,
          library: {
            scores: this.snapshot.library?.scores ?? [],
            loading: false,
            error: applicationIssue("library-unavailable"),
          },
        });
        throw error;
      });
    this.chain = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  releaseLibraryScore(id: string): Promise<void> {
    const operation = this.chain.then(async () => {
      if (this.activeLibraryScoreId !== id) return;
      const session = this.active;
      this.active = undefined;
      this.activeLibraryScoreId = undefined;
      const {
        currentSessionId: _currentSessionId,
        currentLibraryScoreId: _currentLibraryScoreId,
        ...snapshot
      } = this.snapshot;
      this.setSnapshot(snapshot);
      await session?.pauseAndFlush();
      await session?.destroy();
    });
    this.chain = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async openLibraryScoreOnce(id: string): Promise<void> {
    const library = this.library;
    if (!library) return;
    const file = await library.repository.readScore(id);
    await library.repository.markOpened(id, new Date().toISOString());
    const previous = this.active;
    const previousStudio = this.studioRuntime;
    this.active = undefined;
    this.activeLibraryScoreId = undefined;
    this.studioRuntime = undefined;
    this.studioRuntimeLibraryScoreId = undefined;
    await previous?.destroy();
    await previousStudio?.destroy();
    this.active = await this.openSession(file, id);
    this.activeLibraryScoreId = id;
    this.setSnapshot({ ...this.snapshot, currentSessionId: crypto.randomUUID(), currentLibraryScoreId: id });
  }

  async exportLibraryScore(id: string): Promise<void> {
    if (this.library) await this.library.gateway.saveExport(await this.library.repository.readScore(id));
  }

  async setFavorite(id: string, favorite: boolean): Promise<void> {
    if (this.library) await this.library.repository.setFavorite(id, favorite);
  }

  async updateLibraryMetadata(
    id: string,
    patch: { titleOverride?: string | undefined; artistOverride?: string | undefined },
  ): Promise<void> {
    if (this.library)
      await this.library.repository.updateMetadata(id, {
        ...(patch.titleOverride === undefined ? {} : { titleOverride: patch.titleOverride }),
        ...(patch.artistOverride === undefined ? {} : { artistOverride: patch.artistOverride }),
      });
  }

  async deleteLibraryScore(id: string): Promise<void> {
    if (!this.library) return;
    this.studioSessions.get(id)?.dispose();
    this.studioSessions.delete(id);
    this.studioAvailableTrackIds.delete(id);
    this.studioSources.delete(id);
    await this.library.repository.delete(id);
    if (this.snapshot.studio?.libraryScoreId === id) {
      const { studio: _studio, ...snapshot } = this.snapshot;
      this.setSnapshot(snapshot);
    }
    if (this.snapshot.currentLibraryScoreId === id) {
      await this.active?.destroy();
      this.active = undefined;
      this.activeLibraryScoreId = undefined;
    }
    if (this.studioRuntimeLibraryScoreId === id) {
      await this.studioRuntime?.destroy();
      this.studioRuntime = undefined;
      this.studioRuntimeLibraryScoreId = undefined;
    }
    await this.refreshLibrary();
  }

  async togglePlayback(): Promise<void> {
    await this.active?.togglePlayback();
  }

  async pauseAndFlush(): Promise<void> {
    await this.active?.pauseAndFlush();
  }

  destroy(): Promise<void> {
    this.destroying = true;
    this.importAbortController?.abort();
    this.destroyPromise ??= this.destroyOnce();
    return this.destroyPromise;
  }

  private async openOnce(): Promise<void> {
    const file = await this.host.openScore();
    if (!file) return;
    const previous = this.active;
    this.active = undefined;
    this.activeLibraryScoreId = undefined;
    this.setSnapshot({});
    await previous?.destroy();
    this.active = await this.openSession(file);
    this.setSnapshot({ currentSessionId: crypto.randomUUID() });
  }

  private scheduleOpen(recordErrorForDestroy: boolean): Promise<void> {
    if (this.destroying) return Promise.reject(new Error("Viewer app is being destroyed"));
    const operation = this.chain.then(() => this.openOnce());
    this.chain = operation.then(
      () => {
        this.queuedError = undefined;
      },
      (error) => {
        if (recordErrorForDestroy) this.queuedError = error;
      },
    );
    return operation;
  }

  private enqueueOpen(): void {
    void this.scheduleOpen(true).catch(() => undefined);
  }

  private onHostEvent(event: ViewerHostEvent): void {
    if (event.type === "open-score") this.requestOpenScore();
    if (event.type === "toggle-playback") void this.togglePlayback().catch(() => undefined);
    if (event.type === "suspend") void this.pauseAndFlush().catch(() => undefined);
    if (event.type === "prepare-close") void this.destroy().catch(() => undefined);
  }

  private reportDiagnostic(error: unknown, operation: string): void {
    this.host.reportDiagnostic?.(error, operation);
  }

  private setSnapshot(snapshot: ViewerApplicationSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }

  private setStudio(
    libraryScoreId: string,
    studio: Omit<NonNullable<ViewerApplicationSnapshot["studio"]>, "libraryScoreId">,
  ): void {
    this.setSnapshot({ ...this.snapshot, studio: { libraryScoreId, ...studio } });
  }

  private setStudioState(libraryScoreId: string, state: HarmonyStudioSessionState): void {
    const ranges = state.document === null ? undefined : this.getStudioRanges(libraryScoreId, state.document);
    const previousSelection =
      this.snapshot.studio?.libraryScoreId === libraryScoreId ? this.snapshot.studio.selection : undefined;
    const selection =
      ranges === undefined
        ? undefined
        : previousSelection === undefined
          ? ranges[0] === undefined
            ? undefined
            : { focus: ranges[0].effective.range.start, range: ranges[0].effective.range }
          : restoreHarmonySelection(ranges, previousSelection.focus);
    const previewError = ranges === undefined ? undefined : this.applyStudioPreview(libraryScoreId, ranges);
    this.setStudio(libraryScoreId, {
      status: state.status,
      ...(this.studioAvailableTrackIds.has(libraryScoreId)
        ? { availableTrackIds: this.studioAvailableTrackIds.get(libraryScoreId)! }
        : {}),
      ...(state.document === null ? {} : { document: state.document }),
      ...(ranges === undefined ? {} : { ranges }),
      ...(selection === undefined ? {} : { selection }),
      ...(this.studioRuntimeLibraryScoreId === libraryScoreId && this.studioRuntime
        ? {
            transport: this.studioRuntime.getSnapshot().transport,
            audioStatus: this.studioRuntime.getSnapshot().audio,
          }
        : {}),
      ...(state.errorCode === undefined
        ? {}
        : {
            error:
              state.status === "conflict"
                ? applicationIssue("studio-version-conflict")
                : applicationIssue("studio-save-failed"),
          }),
      ...(previewError === undefined ? {} : { previewError }),
    });
  }

  private applyStudioPreview(
    libraryScoreId: string,
    ranges: readonly HarmonyRangeViewItem[],
  ): ApplicationIssue | undefined {
    if (this.studioRuntimeLibraryScoreId !== libraryScoreId) return undefined;
    try {
      const result = this.studioRuntime?.applyPreview(
        this.studioPreviewEnabled ? ranges.map((item) => item.effective) : [],
      );
      return result?.status === "applied" ? undefined : applicationIssue("studio-preview-unavailable");
    } catch (error) {
      this.reportDiagnostic(error, "studio.preview");
      return applicationIssue("studio-preview-failed");
    }
  }

  private syncStudioTransport(libraryScoreId: string): void {
    const studio = this.snapshot.studio;
    if (studio?.libraryScoreId !== libraryScoreId || this.studioRuntimeLibraryScoreId !== libraryScoreId) return;
    const runtimeSnapshot = this.studioRuntime?.getSnapshot();
    if (runtimeSnapshot)
      this.setStudio(libraryScoreId, {
        ...studio,
        transport: runtimeSnapshot.transport,
        audioStatus: runtimeSnapshot.audio,
      });
  }

  private setStudioAudioError(libraryScoreId: string, status: string | undefined): void {
    const studio = this.snapshot.studio;
    if (studio?.libraryScoreId !== libraryScoreId) return;
    if (status === "unavailable" || status === "unrepresentable") {
      this.setStudio(libraryScoreId, {
        ...studio,
        audioError: applicationIssue("studio-audio-unavailable"),
      });
      return;
    }
    if (studio.audioError !== undefined) {
      const { audioError: _audioError, ...nextStudio } = studio;
      this.setStudio(libraryScoreId, nextStudio);
    }
  }

  private getStudioRanges(libraryScoreId: string, document: HarmonyAnalysisDocument): HarmonyRangeViewItem[] {
    const source = this.studioSources.get(libraryScoreId);
    const scoreEnd = document.activeRevision.segments.reduce(
      (end, segment) => (compareMoments(segment.range.end, end) > 0 ? segment.range.end : end),
      { measureIndex: 0, offsetTicks: 0 },
    );
    const partId = source?.partIds[trackIndexFromId(document.annotationTarget.trackId)];
    const projection = effectiveHarmonyProjection({
      revision: document.activeRevision.segments,
      source:
        source === undefined || partId === undefined
          ? []
          : projectSourceHarmonyEvents(parseSourceHarmonyEvents(source.rootXml, partId), scoreEnd),
      corrections: document.corrections,
    });
    return createHarmonyRangeViewItems(projection, document.activeRevision.segments);
  }

  private async destroyOnce(): Promise<void> {
    this.unsubscribe();
    this.studioSelectionDetach?.();
    this.studioSelectionDetach = undefined;
    this.studioErrorDetach?.();
    this.studioErrorDetach = undefined;
    this.studioTransportDetach?.();
    this.studioTransportDetach = undefined;
    this.studioAudioDetach?.();
    this.studioAudioDetach = undefined;
    this.navigationListeners.clear();
    for (const studioSession of this.studioSessions.values()) studioSession.dispose();
    this.studioSessions.clear();
    await this.chain;
    const openError = this.queuedError;
    const session = this.active;
    const studioRuntime = this.studioRuntime;
    this.active = undefined;
    this.activeLibraryScoreId = undefined;
    this.studioRuntime = undefined;
    this.studioRuntimeLibraryScoreId = undefined;
    this.setSnapshot({});
    let cleanupError: unknown;
    try {
      await session?.destroy();
      await studioRuntime?.destroy();
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

function trackIndexFromId(trackId: string): number {
  const match = /^track-(\d+)$/.exec(trackId);
  if (!match || Number(match[1]) < 1) throw new Error("ANNOTATION_TARGET_NOT_FOUND");
  return Number(match[1]) - 1;
}
