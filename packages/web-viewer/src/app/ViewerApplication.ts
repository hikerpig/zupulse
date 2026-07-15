import type { ViewerAppHandle, ViewerFile, ViewerHost, ViewerHostEvent, ViewerSessionHandle } from "../host";
import { importLibraryScores } from "@zupulse/web-core";
import type {
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

export type ViewerApplicationSnapshot = {
  currentSessionId?: string;
  currentLibraryScoreId?: string;
  library?: { scores: readonly LibraryScoreSummary[]; loading: boolean; error?: string; importing?: boolean };
  studio?: {
    libraryScoreId: string;
    status: "loading" | "ready" | "error";
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
    const repository = this.getHarmonyAnalysisRepository();
    const current = this.snapshot.studio;
    if (!repository || current?.libraryScoreId !== id || current.status !== "ready" || !current.document) return;
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
    const saved = await repository.save({ document, expectedDocumentVersion: current.document.documentVersion });
    if (saved.status === "conflict") return this.setStudio(id, { status: "error", error: "分析文档版本冲突" });
    this.setStudio(id, { status: "ready", document: saved.document });
  }

  private async openStudioOnce(id: string): Promise<void> {
    const library = this.library;
    const repository = this.getHarmonyAnalysisRepository();
    const intent = ++this.studioIntent;
    if (!library || !repository) return this.setStudio(id, { status: "error", error: "和声分析存储不可用" });
    this.setStudio(id, { status: "loading" });
    try {
      const score = await library.repository.get(id as LibraryScore["id"]);
      if (!score) throw new Error("曲谱不存在");
      if (score.format !== "musicxml") throw new Error("仅支持 MusicXML/MXL 曲谱");
      const existing = await repository.read(id);
      if (existing) {
        if (intent === this.studioIntent) this.setStudio(id, { status: "ready", document: existing });
        return;
      }
      const file = await library.repository.readScore(id as LibraryScore["id"]);
      const adapter = library.adapters.find((candidate) => candidate.format === "musicxml");
      if (!adapter) throw new Error("MusicXML 分析器不可用");
      const parsed = await adapter.parse({ fileName: file.fileName, bytes: file.bytes });
      const includedTrackIds = parsed.document.tracks.map((track) => track.id);
      if (includedTrackIds.length === 0) throw new Error("曲谱没有可分析的音高轨道");
      const now = new Date().toISOString();
      const document: HarmonyAnalysisDocument = {
        schemaVersion: "1.0.0",
        libraryScoreId: id,
        sourceContentHash: score.scoreIdentity,
        documentVersion: 0,
        activeRevision: {
          id: crypto.randomUUID(),
          algorithmVersion: "rules-1",
          createdAt: now,
          parameters: { scope: { includedTrackIds }, topK: 8, decisionThreshold: 0.6 },
          segments: [],
        },
        corrections: [],
        annotationTarget: { trackId: includedTrackIds[0]!, staffIndex: 0 },
        updatedAt: now,
      };
      const saved = await repository.save({ document, expectedDocumentVersion: null });
      if (saved.status === "conflict") throw new Error("分析文档版本冲突");
      if (intent === this.studioIntent) this.setStudio(id, { status: "ready", document: saved.document });
    } catch (error) {
      if (intent === this.studioIntent)
        this.setStudio(id, { status: "error", error: error instanceof Error ? error.message : "分析失败" });
    }
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
    await this.library.repository.delete(id);
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

  private async destroyOnce(): Promise<void> {
    this.unsubscribe();
    this.navigationListeners.clear();
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
