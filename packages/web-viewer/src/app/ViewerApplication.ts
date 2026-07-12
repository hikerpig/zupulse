import type {
  ViewerAppHandle,
  ViewerFile,
  ViewerHost,
  ViewerHostEvent,
  ViewerSessionHandle,
} from '../host';

export type ViewerApplicationSnapshot = {
  currentSessionId?: string;
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
    private readonly openSession: (file: ViewerFile) => Promise<ViewerSessionHandle>,
  ) {
    this.unsubscribe = host.subscribe((event) => this.onHostEvent(event));
  }

  getSnapshot = (): ViewerApplicationSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  hasSession(sessionId: string): boolean {
    return this.snapshot.currentSessionId === sessionId && this.active !== undefined;
  }

  getCurrentSession(): ViewerSessionHandle | undefined {
    return this.active;
  }

  openScore(): Promise<void> {
    return this.scheduleOpen(false);
  }

  requestOpenScore(): void {
    this.enqueueOpen();
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
    if (this.destroying) return Promise.reject(new Error('Viewer app is being destroyed'));
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
    if (event.type === 'open-score') this.enqueueOpen();
    if (event.type === 'toggle-playback') void this.togglePlayback().catch(() => undefined);
    if (event.type === 'suspend') void this.pauseAndFlush().catch(() => undefined);
    if (event.type === 'prepare-close') void this.destroy().catch(() => undefined);
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
      throw new AggregateError([openError, cleanupError], 'Viewer open and cleanup both failed');
    }
    if (openError !== undefined) throw openError;
    if (cleanupError !== undefined) throw cleanupError;
  }
}
