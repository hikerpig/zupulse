import type { ViewerAppHandle, ViewerFile, ViewerHost, ViewerHostEvent, ViewerSessionHandle } from "../host";
import {
  importLibraryScores,
  type ScoreFileGateway,
  type ScoreFormatAdapter,
  type SheetLibraryRepository,
  type LibraryScoreSummary,
} from "@tab-viewer/web-core";

export type ViewerApplicationSnapshot = {
  currentSessionId?: string;
  currentLibraryScoreId?: string;
  library?: { scores: readonly LibraryScoreSummary[]; loading: boolean; error?: string; importing?: boolean };
};

export class ViewerApplication implements ViewerAppHandle {
  private active: ViewerSessionHandle | undefined;
  private chain = Promise.resolve();
  private queuedError: unknown;
  private destroyPromise?: Promise<void>;
  private destroying = false;
  private snapshot: ViewerApplicationSnapshot = {};
  private readonly listeners = new Set<() => void>();
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

  hasSession(sessionId: string): boolean {
    return (
      (this.snapshot.currentLibraryScoreId ?? this.snapshot.currentSessionId) === sessionId && this.active !== undefined
    );
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
      if (result && result.status !== "failed") this.selectLibraryScore(result.score.id);
    }
  }

  async openLibraryScore(id: string): Promise<void> {
    if (!this.library) return;
    const file = await this.library.repository.readScore(id);
    await this.library.repository.markOpened(id, new Date().toISOString());
    const previous = this.active;
    this.active = undefined;
    await previous?.destroy();
    this.active = await this.openSession(file, id);
    this.setSnapshot({ ...this.snapshot, currentSessionId: crypto.randomUUID(), currentLibraryScoreId: id });
  }

  selectLibraryScore(id: string): void {
    this.setSnapshot({ ...this.snapshot, currentLibraryScoreId: id });
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

  private async destroyOnce(): Promise<void> {
    this.unsubscribe();
    await this.chain;
    const openError = this.queuedError;
    const session = this.active;
    this.active = undefined;
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
