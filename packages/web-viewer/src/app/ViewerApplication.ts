import {
  ViewerOpenFailure,
  type ViewerAppHandle,
  type ViewerDomBindings,
  type ViewerFile,
  type ViewerHost,
  type ViewerHostEvent,
} from "../host";
import type { ViewerSessionPort } from "../viewer-session/viewer-session-types";
import { createNoopTelemetryPort, importLibraryScores } from "@zupulse/web-core";
import type {
  LibraryScore,
  ScoreFileGateway,
  ScoreFormatAdapter,
  SheetLibraryRepository,
  LibraryScoreSummary,
  ImportItemResult,
  ScoreImportSource,
  TelemetryPort,
} from "@zupulse/web-core";
import type { StudioScoreRuntime } from "../studio-score-runtime";
import type { BundledSampleScore, BundledSampleSource } from "../sample-scores";
import { ApplicationFailure, applicationIssue, type ApplicationIssue } from "./applicationIssue";
import { createDefaultHarmonyAnalysisRunner, StudioApplication } from "../features/harmony-studio/StudioApplication";
import type { HarmonyAnalysisRunner } from "../harmony-analysis-worker-client";
import { WorkspaceCoordinator } from "./workspace-coordinator";

export type ViewerApplicationSnapshot = {
  currentSessionId?: string;
  currentLibraryScoreId?: string;
  viewer?: {
    libraryScoreId: string;
    status: "loading" | "ready" | "error";
    error?: ApplicationIssue;
  };
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
};

export class ViewerApplication implements ViewerAppHandle {
  private destroyPromise?: Promise<void>;
  private destroying = false;
  private importAbortController: AbortController | undefined;
  private snapshot: ViewerApplicationSnapshot = {};
  private readonly listeners = new Set<() => void>();
  private readonly navigationListeners = new Set<(libraryScoreId: string) => void>();
  private readonly unsubscribe: () => void;
  private readonly studioApplication: StudioApplication;
  private readonly coordinator: WorkspaceCoordinator;
  private readonly telemetry: TelemetryPort;
  private applicationReadyCaptured = false;

  constructor(
    private readonly host: ViewerHost,
    openSession: (
      file: ViewerFile,
      libraryScoreId?: string,
      domBindings?: ViewerDomBindings,
    ) => Promise<ViewerSessionPort>,
    private readonly library: {
      repository: SheetLibraryRepository;
      gateway: ScoreFileGateway;
      adapters: readonly ScoreFormatAdapter[];
      createDroppedImportSources?(
        files: readonly File[],
      ): readonly ScoreImportSource[] | Promise<readonly ScoreImportSource[]>;
      sampleSources?: readonly BundledSampleSource[];
    },
    openStudioRuntime?: (file: ViewerFile) => Promise<StudioScoreRuntime>,
    harmonyAnalysisRunner: HarmonyAnalysisRunner = createDefaultHarmonyAnalysisRunner(),
  ) {
    this.telemetry = host.telemetry ?? createNoopTelemetryPort();
    this.unsubscribe = host.subscribe((event) => this.onHostEvent(event));
    this.studioApplication = new StudioApplication({
      library,
      harmonyAnalysisRunner,
      reportDiagnostic: (error, operation) => this.reportDiagnostic(error, operation),
      ...(openStudioRuntime === undefined ? {} : { openStudioRuntime }),
    });
    this.coordinator = new WorkspaceCoordinator({
      openSession,
      studio: this.studioApplication,
      onViewerReleased: () => {
        const {
          currentSessionId: _currentSessionId,
          currentLibraryScoreId: _currentLibraryScoreId,
          ...snapshot
        } = this.snapshot;
        this.setSnapshot(snapshot);
      },
    });
    void this.refreshLibrary();
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
    return this.coordinator.hasSession(sessionId);
  }

  getCurrentSession(): ViewerSessionPort | undefined {
    return this.coordinator.getCurrentSession();
  }

  bindViewerDom(bindings: ViewerDomBindings | undefined): void {
    this.coordinator.bindViewerDom(bindings);
  }

  getStudioApplication(): StudioApplication {
    return this.studioApplication;
  }

  openScore(): Promise<void> {
    return this.importScores(false).then(() => undefined);
  }

  requestOpenScore(): void {
    void this.importScores(false).catch(() => undefined);
  }

  async getLibraryScore(id: string): Promise<LibraryScore | undefined> {
    return this.library.repository.get(id as LibraryScore["id"]);
  }

  openStudio(id: string): Promise<void> {
    return this.coordinator.openStudio(id);
  }

  async refreshLibrary(): Promise<void> {
    if (!this.snapshot.library) {
      this.setSnapshot({ ...this.snapshot, library: { scores: [], loading: true } });
    }
    try {
      await this.library.repository.initialize();
      const scores = await this.library.repository.list();
      this.setSnapshot({ ...this.snapshot, library: { scores, loading: false } });
      this.captureApplicationReady("ready");
    } catch (error) {
      this.reportDiagnostic(error, "library.refresh");
      this.setSnapshot({
        ...this.snapshot,
        library: { scores: [], loading: false, error: applicationIssue("library-unavailable") },
      });
      this.captureApplicationReady("degraded");
    }
  }

  async importScores(multiple: boolean): Promise<void> {
    let sources: readonly ScoreImportSource[];
    try {
      sources = await this.selectImportSources(multiple);
    } catch {
      return;
    }
    if (!sources.length) return;
    await this.importScoreSources(sources);
  }

  async selectImportSources(multiple = true): Promise<readonly ScoreImportSource[]> {
    try {
      return await this.library.gateway.selectForImport({ multiple });
    } catch (error) {
      this.reportDiagnostic(error, "library.import.select");
      throw error;
    }
  }

  supportsDroppedFileImport(): boolean {
    return this.library.createDroppedImportSources !== undefined;
  }

  createDroppedImportSources(
    files: readonly File[],
  ): readonly ScoreImportSource[] | Promise<readonly ScoreImportSource[]> {
    return this.library.createDroppedImportSources?.(files) ?? [];
  }

  getBundledSampleScores(): readonly BundledSampleScore[] {
    return this.library.sampleSources?.map(({ sample }) => sample) ?? [];
  }

  createBundledSampleSource(id: BundledSampleScore["id"]): ScoreImportSource | undefined {
    return this.library.sampleSources?.find(({ sample }) => sample.id === id)?.createSource();
  }

  async importScoreSources(sources: readonly ScoreImportSource[]): Promise<void> {
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
    for (const result of results) {
      const source = sources.find(
        (item) => item.fileName === (result.status === "failed" ? result.fileName : result.score.fileName),
      );
      this.telemetry.capture({
        name: "score_import_completed",
        source: source?.telemetrySource ?? "picker",
        outcome: result.status,
        ...(result.status === "failed" ? { issueCode: result.error.code } : { scoreFormat: result.score.format }),
      });
    }
    const successful = results.some((item) => item.status === "created" || item.status === "existing");
    if (!successful) return;
    if (sources.length === 1) {
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
    if (this.destroying) return Promise.reject(new Error("Viewer app is being destroyed"));
    this.setSnapshot({
      ...this.snapshot,
      viewer: { libraryScoreId: id, status: "loading" },
    });
    const operation = this.coordinator
      .openViewer(id, () => this.readLibraryScore(id))
      .then(() => {
        this.setSnapshot({
          ...this.snapshot,
          currentSessionId: crypto.randomUUID(),
          currentLibraryScoreId: id,
          viewer: { libraryScoreId: id, status: "ready" },
        });
        void this.library.repository.get(id).then((score) => {
          if (score)
            this.telemetry.capture({
              name: "workspace_session_started",
              workspace: "viewer",
              scoreFormat: score.format,
            });
        });
      })
      .catch((error: unknown) => {
        this.reportDiagnostic(error, "library.open");
        this.setSnapshot({
          ...this.snapshot,
          viewer: {
            libraryScoreId: id,
            status: "error",
            error: applicationIssue(
              error instanceof ApplicationFailure && error.issue.code === "viewer-library-failed"
                ? "viewer-library-failed"
                : error instanceof ViewerOpenFailure && error.stage === "render"
                  ? "viewer-render-failed"
                  : "viewer-session-failed",
            ),
          },
        });
        throw error;
      });
    return operation;
  }

  releaseLibraryScore(id: string): Promise<void> {
    return this.coordinator.releaseViewer(id);
  }

  private async readLibraryScore(id: string): Promise<ViewerFile> {
    try {
      const file = await this.library.repository.readScore(id);
      await this.library.repository.markOpened(id, new Date().toISOString());
      return file;
    } catch (error) {
      throw new ApplicationFailure(applicationIssue("viewer-library-failed"), { cause: error });
    }
  }

  async exportLibraryScore(id: string): Promise<void> {
    await this.library.gateway.saveExport(await this.library.repository.readScore(id));
  }

  async setFavorite(id: string, favorite: boolean): Promise<void> {
    await this.library.repository.setFavorite(id, favorite);
  }

  async updateLibraryMetadata(
    id: string,
    patch: { titleOverride?: string | undefined; artistOverride?: string | undefined },
  ): Promise<void> {
    await this.library.repository.updateMetadata(id, {
      ...(patch.titleOverride === undefined ? {} : { titleOverride: patch.titleOverride }),
      ...(patch.artistOverride === undefined ? {} : { artistOverride: patch.artistOverride }),
    });
  }

  async deleteLibraryScore(id: string): Promise<void> {
    await this.studioApplication.releaseScore(id);
    await this.library.repository.delete(id);
    await this.coordinator.deleteViewer(id);
    await this.refreshLibrary();
  }

  async togglePlayback(): Promise<void> {
    await this.coordinator.getCurrentSession()?.dispatch({
      type: "playback",
      command: { type: "toggle-playback" },
    });
  }

  async pauseAndFlush(): Promise<void> {
    await this.coordinator.getCurrentSession()?.dispatch({ type: "pause-and-flush" });
  }

  destroy(): Promise<void> {
    this.destroying = true;
    this.importAbortController?.abort();
    this.destroyPromise ??= this.destroyOnce();
    return this.destroyPromise;
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

  private captureApplicationReady(state: "ready" | "degraded"): void {
    if (this.applicationReadyCaptured) return;
    this.applicationReadyCaptured = true;
    this.telemetry.capture({ name: "application_ready", initialSurface: "library", state });
  }

  private setSnapshot(snapshot: ViewerApplicationSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }

  private async destroyOnce(): Promise<void> {
    this.unsubscribe();
    this.navigationListeners.clear();
    let cleanupError: unknown;
    try {
      await this.coordinator.destroy();
    } catch (error) {
      cleanupError = error;
    }
    this.setSnapshot({});
    if (cleanupError !== undefined) throw cleanupError;
  }
}
