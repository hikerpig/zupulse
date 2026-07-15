import type { ViewerAppHandle, ViewerFile, ViewerHost, ViewerHostEvent, ViewerSessionHandle } from "../host";
import {
  analyzeHarmonyRules,
  applyCorrectionCommand,
  effectiveHarmonyProjection,
  importLibraryScores,
  listMusicXmlPartIds,
  projectAlphaTabHarmonyInput,
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
} from "@zupulse/web-core";
import { insertCorrection } from "@zupulse/web-core";
import { HarmonyStudioSession } from "../harmonyStudioSession";
import type { HarmonyStudioSessionState } from "../harmonyStudioSession";
import { exportHarmonyStudioDocument } from "../harmonyStudioExport";

export type ViewerApplicationSnapshot = {
  currentSessionId?: string;
  currentLibraryScoreId?: string;
  library?: { scores: readonly LibraryScoreSummary[]; loading: boolean; error?: string; importing?: boolean };
  studio?: {
    libraryScoreId: string;
    status: "loading" | "ready" | "unsaved" | "saving" | "error" | "conflict";
    document?: HarmonyAnalysisDocument;
    error?: string;
  };
};

export class ViewerApplication implements ViewerAppHandle {
  private active: ViewerSessionHandle | undefined;
  private activeLibraryScoreId: string | undefined;
  private chain = Promise.resolve();
  private queuedError: unknown;
  private destroyPromise?: Promise<void>;
  private studioIntent = 0;
  private studioOpening: { id: string; promise: Promise<void> } | undefined;
  private readonly studioSessions = new Map<string, HarmonyStudioSession>();
  private destroying = false;
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
    const promise = this.openStudioOnce(id).finally(() => {
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

  async setStudioScope(id: string, includedTrackIds: readonly string[]): Promise<void> {
    if (includedTrackIds.length === 0) throw new Error("STUDIO_SCOPE_EMPTY");
    const session = this.studioSessions.get(id);
    if (!session) return;
    const state = await session.setScope(includedTrackIds, ({ scope }) => this.createStudioDocument(id, scope));
    this.setStudioState(id, state);
  }

  private async openStudioOnce(id: string): Promise<void> {
    const library = this.library;
    const repository = this.getHarmonyAnalysisRepository();
    const intent = ++this.studioIntent;
    if (!library || !repository) return this.setStudio(id, { status: "error", error: "和声分析存储不可用" });
    this.setStudio(id, { status: "loading" });
    try {
      const session = this.getStudioSession(id, repository);
      const state = await session.load(() => this.createStudioDocument(id));
      if (intent === this.studioIntent) this.setStudioState(id, state);
    } catch (error) {
      if (intent === this.studioIntent)
        this.setStudio(id, { status: "error", error: error instanceof Error ? error.message : "分析失败" });
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
    return exportHarmonyStudioDocument({
      session,
      projection: effectiveHarmonyProjection({
        revision: document.activeRevision.segments,
        source: [],
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
    if (!library) throw new Error("曲谱库不可用");
    const score = await library.repository.get(id as LibraryScore["id"]);
    if (!score) throw new Error("曲谱不存在");
    if (score.format !== "musicxml") throw new Error("仅支持 MusicXML/MXL 曲谱");
    const file = await library.repository.readScore(id as LibraryScore["id"]);
    const adapter = library.adapters.find((candidate) => candidate.format === "musicxml");
    if (!adapter) throw new Error("MusicXML 分析器不可用");
    const parsed = await adapter.parse({ fileName: file.fileName, bytes: file.bytes });
    const allTrackIds = parsed.document.tracks.map((track) => track.id);
    const includedTrackIds = requestedScope === undefined ? allTrackIds : [...requestedScope];
    if (includedTrackIds.length === 0) throw new Error("曲谱没有可分析的音高轨道");
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
        algorithmVersion: "rules-1",
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
      this.setSnapshot({
        ...this.snapshot,
        library: { scores: [], loading: false, error: error instanceof Error ? error.message : "曲谱库不可用" },
      });
    }
  }

  async importScores(multiple: boolean): Promise<void> {
    if (!this.library) return this.scheduleOpen(false);
    const sources = await this.library.gateway.selectForImport({ multiple });
    if (!sources.length) return;
    this.setSnapshot({
      ...this.snapshot,
      library: { scores: this.snapshot.library?.scores ?? [], loading: false, importing: true },
    });
    const results = await importLibraryScores({
      sources,
      repository: this.library.repository,
      adapters: this.library.adapters,
    });
    await this.refreshLibrary();
    if (!multiple) {
      const result = results.find((item) => item.status === "created" || item.status === "existing");
      if (result && result.status !== "failed")
        for (const listener of this.navigationListeners) listener(result.score.id);
    }
  }

  openLibraryScore(id: string): Promise<void> {
    if (!this.library) return Promise.resolve();
    if (this.destroying) return Promise.reject(new Error("Viewer app is being destroyed"));
    const operation = this.chain.then(() => (this.hasSession(id) ? undefined : this.openLibraryScoreOnce(id)));
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
    this.active = undefined;
    this.activeLibraryScoreId = undefined;
    await previous?.destroy();
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
    this.setStudio(libraryScoreId, {
      status: state.status === "analyzing" ? "loading" : state.status,
      ...(state.document === null ? {} : { document: state.document }),
      ...(state.error === undefined ? {} : { error: state.error }),
    });
  }

  private async destroyOnce(): Promise<void> {
    this.unsubscribe();
    this.navigationListeners.clear();
    for (const studioSession of this.studioSessions.values()) studioSession.dispose();
    this.studioSessions.clear();
    await this.chain;
    const openError = this.queuedError;
    const session = this.active;
    this.active = undefined;
    this.activeLibraryScoreId = undefined;
    this.setSnapshot({});
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

function trackIndexFromId(trackId: string): number {
  const match = /^track-(\d+)$/.exec(trackId);
  if (!match || Number(match[1]) < 1) throw new Error("ANNOTATION_TARGET_NOT_FOUND");
  return Number(match[1]) - 1;
}
