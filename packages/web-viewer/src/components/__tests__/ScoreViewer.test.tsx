// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { PlaybackState } from "@zupulse/web-core";
import { AppStoreProvider } from "../../app/appStore";
import { ScoreViewer } from "../ScoreViewer";

afterEach(() => {
  cleanup();
  window.localStorage?.clear();
});

describe("ScoreViewer", () => {
  it("expands a compact score preview and collapses it with Escape", async () => {
    const user = userEvent.setup();
    renderScoreViewer(<ScoreViewer compact expandable />);

    const toggle = screen.getByRole("button", { name: "放大乐谱预览" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "收起乐谱预览" }).getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "放大乐谱预览" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps the alphaTab host contract without showing expansion controls in Viewer", () => {
    const view = renderScoreViewer(<ScoreViewer />);
    expect(view.container.querySelector(".score-viewer")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /乐谱预览/ })).toBeNull();
  });

  it("uses bounded buttons and emits one alphaTab commit per action", async () => {
    const commits = vi.fn();
    document.addEventListener("zupulse:score-zoom-commit", commits);
    renderScoreViewer(<ScoreViewer />);

    expect(screen.getByText("100%")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "放大谱面" }));

    expect(screen.getByText("110%")).toBeTruthy();
    expect(commits).toHaveBeenCalledTimes(1);
    expect((commits.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ zoom: 1.1 });
    document.removeEventListener("zupulse:score-zoom-commit", commits);
  });

  it("offers the same zoom actions from the compact Popover and restores focus on Escape", async () => {
    const commits = vi.fn();
    document.addEventListener("zupulse:score-zoom-commit", commits);
    renderScoreViewer(<ScoreViewer />);
    const trigger = screen.getByRole("button", { name: "调整谱面缩放" });

    await userEvent.setup().click(trigger);
    const popup = await screen.findByRole("dialog", { name: "调整谱面缩放" });
    await userEvent.setup().click(within(popup).getByRole("button", { name: "放大谱面" }));
    expect(commits).toHaveBeenCalledOnce();

    await userEvent.setup().keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "调整谱面缩放" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    document.removeEventListener("zupulse:score-zoom-commit", commits);
  });

  it("previews pinch without React commits and commits once when the gesture ends", () => {
    const commits = vi.fn();
    document.addEventListener("zupulse:score-zoom-commit", commits);
    const view = renderScoreViewer(<ScoreViewer />);
    const stage = screen.getByRole("region", { name: "乐谱工作区" });
    const viewer = view.container.querySelector(".score-viewer") as HTMLElement;

    fireEvent.touchStart(stage, { touches: [touch(0, 0), touch(0, 100)] });
    fireEvent.touchMove(stage, { touches: [touch(0, 0), touch(0, 140)] });

    expect(viewer.style.transform).toBe("scale(1.4)");
    expect(commits).not.toHaveBeenCalled();
    fireEvent.touchEnd(stage, { touches: [] });

    expect(commits).toHaveBeenCalledTimes(1);
    expect((commits.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ zoom: 1.4 });
    expect(viewer.style.transform).toBe("");
    document.removeEventListener("zupulse:score-zoom-commit", commits);
  });

  it("leaves one-finger score scrolling to the scroll host without creating a zoom commit", () => {
    const commits = vi.fn();
    document.addEventListener("zupulse:score-zoom-commit", commits);
    const view = renderScoreViewer(<ScoreViewer />);
    const stage = screen.getByRole("region", { name: "乐谱工作区" });
    const viewer = view.container.querySelector(".score-viewer") as HTMLElement;

    fireEvent.touchStart(stage, { touches: [touch(0, 100)] });
    fireEvent.touchMove(stage, { touches: [touch(0, 40)] });
    fireEvent.touchEnd(stage, { touches: [] });

    expect(viewer.style.transform).toBe("");
    expect(commits).not.toHaveBeenCalled();
    document.removeEventListener("zupulse:score-zoom-commit", commits);
  });

  it("previews loop boundaries on the score and adjusts them by beat from the keyboard", async () => {
    const dispatch = vi.fn(async () => undefined);
    const playbackState = loopPlaybackState();
    playbackState.looping = true;
    renderScoreViewer(
      <ScoreViewer
        loopEditor={{
          getMeasureBounds: () => [
            {
              systemIndex: 0,
              measureIndex: 0,
              x: 20,
              y: 40,
              width: 320,
              height: 140,
              systemX: 20,
              systemY: 40,
              systemWidth: 320,
              systemHeight: 140,
            },
          ],
          subscribe: () => () => undefined,
        }}
        playback={{
          getState: () => playbackState,
          subscribe: () => () => undefined,
          dispatch,
          timeline: {
            durationTicks: 1920,
            durationMs: 4000,
            measures: [
              {
                id: "measure-0",
                index: 0,
                startTick: 0,
                durationTicks: 1920,
                beatTicks: [0, 480, 960, 1440],
              },
            ],
          },
        }}
      />,
    );

    const pointA = screen.getByRole("slider", { name: "循环 A 点" });
    expect(screen.getByRole("slider", { name: "循环 B 点" })).toBeTruthy();
    const overlay = screen.getByLabelText("谱面循环区间");
    expect(overlay.querySelectorAll("[data-loop-segment]")).toHaveLength(1);

    pointA.focus();
    await userEvent.setup().keyboard("{ArrowRight}");

    expect(dispatch).toHaveBeenCalledWith({
      type: "set-loop-boundary",
      boundary: "start",
      position: expect.objectContaining({ tick: 960 }),
    });

    vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 340,
      bottom: 360,
      left: 0,
      width: 340,
      height: 360,
      toJSON: () => ({}),
    });
    fireEvent(pointA, pointerEvent("pointerdown", 60, 100));
    fireEvent(window, pointerEvent("pointermove", 260, 100));
    fireEvent(window, pointerEvent("pointerup", 260, 100));

    expect(dispatch).toHaveBeenCalledWith({
      type: "set-loop-boundary",
      boundary: "start",
      position: expect.objectContaining({ tick: 1440 }),
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "commit-loop-draft" });
  });

  it("hides the loop editing layer while loop mode is off", () => {
    const playbackState = loopPlaybackState();
    renderScoreViewer(
      <ScoreViewer
        loopEditor={{
          getMeasureBounds: () => [
            {
              systemIndex: 0,
              measureIndex: 0,
              x: 20,
              y: 40,
              width: 320,
              height: 140,
              systemX: 20,
              systemY: 40,
              systemWidth: 320,
              systemHeight: 140,
            },
          ],
          subscribe: () => () => undefined,
        }}
        playback={{
          getState: () => playbackState,
          subscribe: () => () => undefined,
          dispatch: vi.fn(async () => undefined),
          timeline: {
            durationTicks: 1920,
            durationMs: 4000,
            measures: [
              {
                id: "measure-0",
                index: 0,
                startTick: 0,
                durationTicks: 1920,
                beatTicks: [0, 480, 960, 1440],
              },
            ],
          },
        }}
      />,
    );

    expect(screen.queryByLabelText("谱面循环区间")).toBeNull();
  });
});

function renderScoreViewer(viewer: ReactElement) {
  return render(<AppStoreProvider>{viewer}</AppStoreProvider>);
}

function touch(clientX: number, clientY: number) {
  return { clientX, clientY, identifier: clientY, target: document.body };
}

function pointerEvent(type: string, clientX: number, clientY: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: 1 },
  });
  return event;
}

function loopPlaybackState(): PlaybackState {
  return {
    sessionId: "session-1",
    transport: "paused",
    position: {
      measureId: "measure-0",
      measureIndex: 0,
      beatIndex: 0,
      tick: 0,
      cachedTimeMs: 0,
    },
    durationMs: 4000,
    baseTempo: 120,
    scoreSpeed: 1,
    looping: false,
    loopDraft: {
      snapMode: "beat",
      start: {
        measureId: "measure-0",
        measureIndex: 0,
        beatIndex: 1,
        tick: 480,
        cachedTimeMs: 1000,
      },
      end: {
        measureId: "measure-0",
        measureIndex: 0,
        beatIndex: 3,
        tick: 1440,
        cachedTimeMs: 3000,
      },
    },
    loops: [],
    tracks: [],
    trackState: {
      primaryVisibleTrackId: "",
      additionalVisibleTrackIds: [],
      visibilityUpdatedAt: "2026-07-26T00:00:00Z",
      settings: {},
    },
    soundFont: "ready",
    persistence: "clean",
  };
}
