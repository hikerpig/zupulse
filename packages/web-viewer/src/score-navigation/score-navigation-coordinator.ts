export type ScoreNavigationMode = "continuous" | "page-turn";
export type ScoreFollowState = "following" | "detached";

export type CursorSystemTarget = {
  systemIndex: number;
  y: number;
  height: number;
};

export type ScoreNavigationSnapshot = {
  mode: ScoreNavigationMode;
  followState: ScoreFollowState;
  generation: number;
  anchorSystemIndex?: number;
  currentPage: number;
  pageCount: number;
  pageTurnAvailable: boolean;
};

export type ScoreViewportPort = {
  viewportHeight(): number;
  moveTo(top: number, behavior: "direct" | "smooth"): void;
};

export class ScoreNavigationCoordinator {
  private snapshot: ScoreNavigationSnapshot = {
    mode: "continuous",
    followState: "following",
    generation: 0,
    currentPage: 0,
    pageCount: 0,
    pageTurnAvailable: false,
  };
  private currentSystemIndex: number | undefined;
  private currentSystem: CursorSystemTarget | undefined;
  private projection: ScreenScorePageProjection = { pages: [], pageIndexBySystem: {} };
  private readonly listeners = new Set<() => void>();
  private scrubPreview = false;
  private systems: readonly ScoreSystemBounds[] = [];
  private loopRange: { startMeasureIndex: number; endMeasureIndex: number } | undefined;

  constructor(private readonly viewport: ScoreViewportPort) {}

  getSnapshot(): ScoreNavigationSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  manualNavigation(): void {
    this.snapshot = { ...this.snapshot, followState: "detached" };
    this.emit();
  }

  formalSeek(): void {
    this.scrubPreview = false;
    this.currentSystemIndex = undefined;
    this.snapshot = { ...this.snapshot, followState: "following" };
    this.emit();
  }

  beginScrubPreview(): void {
    this.scrubPreview = true;
  }

  isScrubPreviewing(): boolean {
    return this.scrubPreview;
  }

  returnToPlayback(): void {
    this.snapshot = { ...this.snapshot, followState: "following" };
    this.currentSystemIndex = undefined;
    if (this.currentSystem) this.cursorSystemChanged(this.currentSystem, true);
    else this.emit();
  }

  transportChanged(state: "playing" | "paused" | "stopped"): void {
    if (state === "stopped") {
      this.snapshot = { ...this.snapshot, followState: "following" };
      this.emit();
    }
  }

  setMode(mode: ScoreNavigationMode): void {
    this.currentSystemIndex = undefined;
    this.snapshot = { ...this.snapshot, mode, followState: "following" };
    if (this.currentSystem) this.cursorSystemChanged(this.currentSystem, true);
    else this.emit();
  }

  cursorSystemChanged(system: CursorSystemTarget, direct: boolean): void {
    this.currentSystem = system;
    if (this.snapshot.followState !== "following" || this.currentSystemIndex === system.systemIndex) return;
    this.currentSystemIndex = system.systemIndex;
    const pageIndex = this.projection.pageIndexBySystem[system.systemIndex];
    const page = pageIndex === undefined ? undefined : this.projection.pages[pageIndex];
    this.snapshot = {
      ...this.snapshot,
      anchorSystemIndex: system.systemIndex,
      ...(pageIndex === undefined ? {} : { currentPage: pageIndex }),
    };
    const top =
      this.snapshot.mode === "page-turn" && page
        ? page.top
        : Math.max(0, system.y - this.viewport.viewportHeight() * 0.25);
    this.viewport.moveTo(top, direct ? "direct" : "smooth");
    this.emit();
  }

  setSystems(systems: readonly ScoreSystemBounds[]): void {
    this.systems = systems;
    this.projection = projectScreenScorePages(systems, this.viewport.viewportHeight(), this.loopRange);
    const anchorPage =
      this.snapshot.anchorSystemIndex === undefined
        ? 0
        : (this.projection.pageIndexBySystem[this.snapshot.anchorSystemIndex] ?? 0);
    this.snapshot = {
      ...this.snapshot,
      currentPage: anchorPage,
      pageCount: this.projection.pages.length,
      pageTurnAvailable: this.projection.pages.length > 0,
    };
    if (this.snapshot.mode === "page-turn") this.moveToPage(anchorPage, true, false);
    else this.emit();
  }

  setLoopMeasureRange(range: { startMeasureIndex: number; endMeasureIndex: number } | undefined): void {
    if (
      this.loopRange?.startMeasureIndex === range?.startMeasureIndex &&
      this.loopRange?.endMeasureIndex === range?.endMeasureIndex
    )
      return;
    this.loopRange = range;
    if (this.systems.length) this.setSystems(this.systems);
  }

  movePage(delta: -1 | 1): void {
    this.manualNavigation();
    this.moveToPage(this.snapshot.currentPage + delta, true, true);
  }

  beginGeneration(): number {
    const generation = this.snapshot.generation + 1;
    this.snapshot = { ...this.snapshot, generation };
    this.emit();
    return generation;
  }

  isCurrentGeneration(generation: number): boolean {
    return generation === this.snapshot.generation;
  }

  private moveToPage(index: number, direct: boolean, emit: boolean): void {
    const page = this.projection.pages[Math.min(this.projection.pages.length - 1, Math.max(0, index))];
    if (!page) {
      if (emit) this.emit();
      return;
    }
    const anchorSystemIndex = page.systemIndexes[0];
    if (anchorSystemIndex === undefined) return;
    this.snapshot = {
      ...this.snapshot,
      currentPage: page.index,
      anchorSystemIndex,
    };
    this.viewport.moveTo(page.top, direct ? "direct" : "smooth");
    if (emit) this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
import type { ScoreSystemBounds } from "./alpha-tab-navigation";
import { projectScreenScorePages, type ScreenScorePageProjection } from "./screen-score-pages";
