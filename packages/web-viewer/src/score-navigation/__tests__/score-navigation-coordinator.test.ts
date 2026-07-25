import { describe, expect, it, vi } from "vitest";
import { ScoreNavigationCoordinator } from "../score-navigation-coordinator";

describe("ScoreNavigationCoordinator", () => {
  it("detaches only for manual navigation and restores following for positioning intents", () => {
    const coordinator = new ScoreNavigationCoordinator({ moveTo: vi.fn(), viewportHeight: () => 800 });

    coordinator.manualNavigation();
    expect(coordinator.getSnapshot().followState).toBe("detached");
    coordinator.transportChanged("paused");
    expect(coordinator.getSnapshot().followState).toBe("detached");
    coordinator.formalSeek();
    expect(coordinator.getSnapshot().followState).toBe("following");
    coordinator.manualNavigation();
    coordinator.transportChanged("stopped");
    expect(coordinator.getSnapshot().followState).toBe("following");
  });

  it("moves a new cursor system near the upper quarter only while following", () => {
    const moveTo = vi.fn();
    const coordinator = new ScoreNavigationCoordinator({ moveTo, viewportHeight: () => 800 });

    coordinator.cursorSystemChanged({ systemIndex: 2, y: 500, height: 160 }, false);
    coordinator.cursorSystemChanged({ systemIndex: 2, y: 500, height: 160 }, false);
    expect(moveTo).toHaveBeenCalledTimes(1);
    expect(moveTo).toHaveBeenCalledWith(300, "smooth");

    coordinator.manualNavigation();
    coordinator.cursorSystemChanged({ systemIndex: 3, y: 900, height: 160 }, false);
    expect(moveTo).toHaveBeenCalledTimes(1);
  });

  it("invalidates callbacks from older render generations", () => {
    const coordinator = new ScoreNavigationCoordinator({ moveTo: vi.fn(), viewportHeight: () => 800 });
    const first = coordinator.beginGeneration();
    const second = coordinator.beginGeneration();

    expect(coordinator.isCurrentGeneration(first)).toBe(false);
    expect(coordinator.isCurrentGeneration(second)).toBe(true);
  });
});
