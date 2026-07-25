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

  it("turns exactly one page for each manual input and follows the latest cursor page directly during scrub", () => {
    const moveTo = vi.fn();
    const coordinator = new ScoreNavigationCoordinator({ moveTo, viewportHeight: () => 400 });
    coordinator.setSystems([system(0, 0, 180, 0), system(1, 420, 180, 2), system(2, 840, 180, 4)]);
    coordinator.setMode("page-turn");

    coordinator.movePage(1);
    expect(coordinator.getSnapshot()).toMatchObject({ currentPage: 1, followState: "detached" });
    coordinator.returnToPlayback();
    coordinator.beginScrubPreview();
    coordinator.cursorSystemChanged({ systemIndex: 2, y: 840, height: 180 }, coordinator.isScrubPreviewing());

    expect(moveTo).toHaveBeenLastCalledWith(840, "direct");
    expect(coordinator.getSnapshot()).toMatchObject({ currentPage: 2, followState: "following" });
  });
});

function system(systemIndex: number, y: number, height: number, firstMeasureIndex: number) {
  return {
    systemIndex,
    firstMeasureIndex,
    lastMeasureIndex: firstMeasureIndex + 1,
    x: 0,
    y,
    width: 800,
    height,
  };
}
