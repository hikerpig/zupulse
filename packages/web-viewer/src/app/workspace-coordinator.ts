import type { ViewerDomBindings, ViewerFile } from "../host";
import type { ViewerSessionPort } from "../viewer-session/viewer-session-types";
import type { StudioApplication } from "../features/harmony-studio/StudioApplication";

export type WorkspaceCoordinatorDependencies = {
  openSession(file: ViewerFile, libraryScoreId?: string, domBindings?: ViewerDomBindings): Promise<ViewerSessionPort>;
  studio: StudioApplication;
  /** The active Viewer session was released; the owner clears its session fields. */
  onViewerReleased?(): void;
};

/**
 * Shell coordinator that guarantees at most one alphaTab/audio runtime at a
 * time across Viewer and Studio workspaces. Both session kinds stay
 * independently rebuildable; only the hand-over (teardown ordering) lives here.
 *
 * The Studio open keeps its validation-before-teardown order: the viewer is
 * released through the `acquireWorkspace` hook, which the Studio application
 * invokes only after the library score has been validated.
 */
export class WorkspaceCoordinator {
  private active: ViewerSessionPort | undefined;
  private activeLibraryScoreId: string | undefined;
  private chain = Promise.resolve();
  private viewerDomBindings: ViewerDomBindings | undefined;

  constructor(private readonly dependencies: WorkspaceCoordinatorDependencies) {}

  getCurrentSession(): ViewerSessionPort | undefined {
    return this.active;
  }

  hasSession(sessionId: string): boolean {
    return this.activeLibraryScoreId === sessionId && this.active !== undefined;
  }

  bindViewerDom(bindings: ViewerDomBindings | undefined): void {
    this.viewerDomBindings = bindings;
  }

  openStudio(id: string): Promise<void> {
    const operation = this.chain.then(() => this.dependencies.studio.open(id, () => this.releaseViewerForStudio()));
    this.chain = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  /** Opens a Viewer session for a library score, releasing the previous runtimes first. */
  openViewer(id: string, readFile: () => Promise<ViewerFile>): Promise<void> {
    const operation = this.chain.then(async () => {
      if (this.hasSession(id)) return;
      const file = await readFile();
      const previous = this.active;
      this.active = undefined;
      this.activeLibraryScoreId = undefined;
      await previous?.destroy();
      await this.dependencies.studio.releaseRuntime();
      this.active = await this.dependencies.openSession(file, id, this.viewerDomBindings);
      this.activeLibraryScoreId = id;
    });
    this.chain = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  /** Route leave: flushes and destroys the Viewer session for a library score. */
  releaseViewer(id: string): Promise<void> {
    const operation = this.chain.then(async () => {
      if (this.activeLibraryScoreId !== id) return;
      const session = this.active;
      this.active = undefined;
      this.activeLibraryScoreId = undefined;
      this.dependencies.onViewerReleased?.();
      await session?.dispatch({ type: "pause-and-flush" });
      await session?.destroy();
    });
    this.chain = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  /** Deletes the Viewer session for a library score without flushing (score removal). */
  deleteViewer(id: string): Promise<void> {
    const operation = this.chain.then(async () => {
      if (this.activeLibraryScoreId !== id) return;
      const session = this.active;
      this.active = undefined;
      this.activeLibraryScoreId = undefined;
      await session?.destroy();
    });
    this.chain = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  destroy(): Promise<void> {
    const operation = this.chain.then(async () => {
      const session = this.active;
      this.active = undefined;
      this.activeLibraryScoreId = undefined;
      await session?.destroy();
      await this.dependencies.studio.destroy();
    });
    this.chain = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async releaseViewerForStudio(): Promise<void> {
    const previousViewer = this.active;
    this.active = undefined;
    this.activeLibraryScoreId = undefined;
    this.dependencies.onViewerReleased?.();
    await previousViewer?.destroy();
  }
}
