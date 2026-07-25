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
  };
  private currentSystemIndex: number | undefined;

  constructor(private readonly viewport: ScoreViewportPort) {}

  getSnapshot(): ScoreNavigationSnapshot {
    return { ...this.snapshot };
  }

  manualNavigation(): void {
    this.snapshot = { ...this.snapshot, followState: "detached" };
  }

  formalSeek(): void {
    this.snapshot = { ...this.snapshot, followState: "following" };
  }

  returnToPlayback(): void {
    this.snapshot = { ...this.snapshot, followState: "following" };
  }

  transportChanged(state: "playing" | "paused" | "stopped"): void {
    if (state === "stopped") this.snapshot = { ...this.snapshot, followState: "following" };
  }

  setMode(mode: ScoreNavigationMode): void {
    this.currentSystemIndex = undefined;
    this.snapshot = { ...this.snapshot, mode, followState: "following" };
  }

  cursorSystemChanged(system: CursorSystemTarget, direct: boolean): void {
    if (this.snapshot.followState !== "following" || this.currentSystemIndex === system.systemIndex) return;
    this.currentSystemIndex = system.systemIndex;
    this.snapshot = { ...this.snapshot, anchorSystemIndex: system.systemIndex };
    const top = Math.max(0, system.y - this.viewport.viewportHeight() * 0.25);
    this.viewport.moveTo(top, direct ? "direct" : "smooth");
  }

  beginGeneration(): number {
    const generation = this.snapshot.generation + 1;
    this.snapshot = { ...this.snapshot, generation };
    return generation;
  }

  isCurrentGeneration(generation: number): boolean {
    return generation === this.snapshot.generation;
  }
}
