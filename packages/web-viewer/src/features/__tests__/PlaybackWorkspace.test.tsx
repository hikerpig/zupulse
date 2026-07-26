// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaybackState } from "@zupulse/web-core";
import type { ViewerSessionHandle } from "../../host";
import { createSeekPreviewScheduler, PlaybackWorkspace } from "../PlaybackWorkspace";
import { AppStoreProvider, createAppStore } from "../../app/appStore";

afterEach(cleanup);

describe("PlaybackWorkspace transport bar", () => {
  it("coalesces drag previews to the latest position per frame and commits once", async () => {
    const previewSeek = vi.fn();
    const dispatch = vi.fn(async () => undefined);
    const frames: FrameRequestCallback[] = [];
    const cancelFrame = vi.fn();
    const scheduler = createSeekPreviewScheduler(
      { previewSeek, dispatch } as never,
      (callback) => {
        frames.push(callback);
        return frames.length;
      },
      cancelFrame,
    );
    const first = position(480, 1000);
    const latest = position(2400, 5000);

    scheduler.preview(first);
    scheduler.preview(latest);
    expect(frames).toHaveLength(1);
    expect(previewSeek).not.toHaveBeenCalled();

    frames[0]?.(0);
    expect(previewSeek).toHaveBeenCalledOnce();
    expect(previewSeek).toHaveBeenCalledWith(latest);
    expect(dispatch).not.toHaveBeenCalled();

    scheduler.preview(first);
    await scheduler.commit(latest);
    expect(cancelFrame).toHaveBeenCalledWith(2);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: "seek", position: latest });
  });

  it("toggles playback with Space from the workspace and prevents scrolling", () => {
    const dispatch = vi.fn(async () => undefined);
    render(<PlaybackWorkspace session={session(state("paused"), dispatch)}>乐谱</PlaybackWorkspace>);

    expect(fireEvent.keyDown(window, { key: " ", code: "Space" })).toBe(false);
    expect(dispatch).toHaveBeenCalledWith({ type: "toggle-playback" });
  });

  it("keeps native Space behavior for interactive controls", () => {
    const dispatch = vi.fn(async () => undefined);
    render(
      <PlaybackWorkspace session={session(state("paused"), dispatch)}>
        <input aria-label="批注" />
      </PlaybackWorkspace>,
    );

    fireEvent.keyDown(screen.getByRole("textbox", { name: "批注" }), { key: " ", code: "Space" });
    fireEvent.keyDown(screen.getByRole("button", { name: "播放" }), { key: " ", code: "Space" });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("ignores modified and repeated Space presses", () => {
    const dispatch = vi.fn(async () => undefined);
    render(<PlaybackWorkspace session={session(state("paused"), dispatch)}>乐谱</PlaybackWorkspace>);

    fireEvent.keyDown(window, { key: " ", code: "Space", metaKey: true });
    fireEvent.keyDown(window, { key: " ", code: "Space", repeat: true });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each([
    ["playing", "暂停", "lucide-pause"],
    ["paused", "播放", "lucide-play"],
  ] as const)("shows the matching icon for %s playback", (transport, label, iconClass) => {
    render(<PlaybackWorkspace session={session(state(transport))}>乐谱</PlaybackWorkspace>);

    const button = screen.getByRole("button", { name: label });
    expect(button.querySelector(`svg.${iconClass}`)).toBeTruthy();
    expect(button.title).toBe(`${label}（Space）`);
  });

  it("shows compact stop and loop controls beside playback", async () => {
    const dispatch = vi.fn(async () => undefined);
    const playbackState = state("paused");
    playbackState.activeLoopId = "loop-1";
    playbackState.loops = [loopRegion()];
    render(<PlaybackWorkspace session={session(playbackState, dispatch)}>乐谱</PlaybackWorkspace>);
    const user = userEvent.setup();

    expect(screen.getByRole("button", { name: "停止" }).querySelector("svg.lucide-square")).toBeTruthy();
    const loop = screen.getByRole("button", { name: "循环模式" });
    expect(loop.getAttribute("aria-pressed")).toBe("false");
    await user.click(loop);

    expect(dispatch).toHaveBeenCalledWith({ type: "set-loop-enabled", enabled: true });
  });

  it("keeps the viewer session and playback facts intact across container resizes", () => {
    const dispatch = vi.fn(async () => undefined);
    const destroy = vi.fn(async () => undefined);
    const playbackState = state("playing");
    playbackState.activeLoopId = "loop-1";
    playbackState.loops = [loopRegion()];
    playbackState.looping = true;
    render(
      <PlaybackWorkspace session={session(playbackState, dispatch, destroy)}>
        <a href="#/library">返回曲谱库</a>
      </PlaybackWorkspace>,
    );

    const playButton = screen.getByRole("button", { name: "暂停" });
    const loopButton = screen.getByRole("button", { name: "循环模式" });
    for (const width of [1194, 834, 597]) {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      fireEvent(window, new Event("resize"));
    }

    expect(screen.getByRole("button", { name: "暂停" })).toBe(playButton);
    expect(screen.getByRole("button", { name: "循环模式" })).toBe(loopButton);
    expect(loopButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("link", { name: "返回曲谱库" }).getAttribute("href")).toBe("#/library");
    expect(dispatch).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  it("activates loop mode from the transport without opening settings", async () => {
    const dispatch = vi.fn(async () => undefined);
    const viewerSession = session(state("paused"), dispatch);
    viewerSession.playback!.timeline = {
      durationTicks: 3840,
      durationMs: 8000,
      measures: [
        { id: "measure-0", index: 0, startTick: 0, durationTicks: 1920, beatTicks: [0, 480, 960, 1440] },
        {
          id: "measure-1",
          index: 1,
          startTick: 1920,
          durationTicks: 1920,
          beatTicks: [1920, 2400, 2880, 3360],
        },
      ],
    };
    render(<PlaybackWorkspace session={viewerSession}>乐谱</PlaybackWorkspace>);

    await userEvent.setup().click(screen.getByRole("button", { name: "循环模式" }));

    expect(screen.queryByRole("complementary", { name: "练习设置" })).toBeNull();
    expect(dispatch).toHaveBeenCalledWith({
      type: "set-loop-boundary",
      boundary: "start",
      position: expect.objectContaining({ tick: 0 }),
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "set-loop-boundary",
      boundary: "end",
      position: expect.objectContaining({ tick: 1920 }),
    });
    expect(dispatch).toHaveBeenCalledWith({ type: "commit-loop-draft" });
  });

  it("shows a synchronized loop mode switch in loop settings", async () => {
    const dispatch = vi.fn(async () => undefined);
    const playbackState = state("paused");
    playbackState.looping = true;
    playbackState.loopDraft = {
      snapMode: "beat",
      start: position(480, 1000),
      end: position(1920, 4000),
    };
    render(<PlaybackWorkspace session={session(playbackState, dispatch)}>乐谱</PlaybackWorkspace>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "练习设置" }));
    const practice = screen.getByRole("complementary", { name: "练习设置" });
    await user.click(within(practice).getByRole("button", { name: /设置循环区间/ }));

    const modeSwitch = within(practice).getByRole("switch", { name: "循环模式" });
    expect((modeSwitch as HTMLInputElement).checked).toBe(true);
    expect(within(practice).getByRole("button", { name: "保存区间" })).toBeTruthy();
    expect(within(practice).getByRole("combobox", { name: "边界吸附" })).toBeTruthy();

    await user.click(modeSwitch);
    expect(dispatch).toHaveBeenCalledWith({ type: "set-loop-enabled", enabled: false });
  });

  it("hides loop editing actions while loop mode is off", async () => {
    const playbackState = state("paused");
    playbackState.loopDraft = {
      snapMode: "beat",
      start: position(480, 1000),
      end: position(1920, 4000),
    };
    render(<PlaybackWorkspace session={session(playbackState)}>乐谱</PlaybackWorkspace>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "练习设置" }));
    const practice = screen.getByRole("complementary", { name: "练习设置" });
    await user.click(within(practice).getByRole("button", { name: /设置循环区间/ }));

    expect((within(practice).getByRole("switch", { name: "循环模式" }) as HTMLInputElement).checked).toBe(false);
    expect(within(practice).getByText("打开循环模式后，可在谱面拖动 A/B 边界。")).toBeTruthy();
    expect(within(practice).queryByRole("button", { name: "保存区间" })).toBeNull();
    expect(within(practice).queryByRole("combobox", { name: "边界吸附" })).toBeNull();
  });

  it("toggles a temporary loop from the outer transport control", async () => {
    const dispatch = vi.fn(async () => undefined);
    const playbackState = state("paused");
    playbackState.looping = true;
    playbackState.loopDraft = {
      snapMode: "beat",
      start: position(480, 1000),
      end: position(1920, 4000),
    };
    render(<PlaybackWorkspace session={session(playbackState, dispatch)}>乐谱</PlaybackWorkspace>);

    const loopButton = screen.getByRole("button", { name: "循环模式" });
    expect(loopButton.getAttribute("aria-pressed")).toBe("true");

    await userEvent.setup().click(loopButton);

    expect(dispatch).toHaveBeenCalledWith({ type: "set-loop-enabled", enabled: false });
    expect(screen.queryByRole("complementary", { name: "练习设置" })).toBeNull();
  });

  it("organizes practice settings around loop and track tasks", async () => {
    render(<PlaybackWorkspace session={session(state("paused"))}>乐谱</PlaybackWorkspace>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "练习设置" }));
    const practice = screen.getByRole("complementary", { name: "练习设置" });
    expect(within(practice).getByRole("button", { name: /设置循环区间/ })).toBeTruthy();
    await user.click(within(practice).getByRole("button", { name: /选择主轨道/ }));

    expect(within(practice).getByRole("heading", { name: "选择主轨道" })).toBeTruthy();
    const back = within(practice).getByRole("button", { name: "返回练习设置" });
    expect(document.activeElement).toBe(back);
    await user.click(back);

    expect(within(practice).getByRole("button", { name: /设置循环区间/ })).toBeTruthy();
    expect(within(practice).queryByText("Session")).toBeNull();
  });

  it("keeps the task overview while playback is unavailable", async () => {
    render(<PlaybackWorkspace session={undefined}>乐谱</PlaybackWorkspace>);

    await userEvent.setup().click(screen.getByRole("button", { name: "练习设置" }));

    const practice = screen.getByRole("complementary", { name: "练习设置" });
    expect((within(practice).getByRole("button", { name: "设置循环区间" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(practice).getByRole("button", { name: "选择主轨道" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(practice).getByText("打开乐谱后可调整循环和轨道")).toBeTruthy();
    expect(within(practice).queryByText("Session")).toBeNull();
  });

  it("moves focus into practice settings, closes with Escape, and restores focus", async () => {
    render(<PlaybackWorkspace session={session(state("paused"))}>乐谱</PlaybackWorkspace>);
    const user = userEvent.setup();
    const trigger = screen.getByRole("button", { name: "练习设置" });

    await user.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "关闭练习设置" }));

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary", { name: "练习设置" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps speed editing and audio retry available inside practice settings", async () => {
    const dispatch = vi.fn(async () => undefined);
    const playbackState = state("paused");
    playbackState.soundFont = "error";
    render(<PlaybackWorkspace session={session(playbackState, dispatch)}>乐谱</PlaybackWorkspace>);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "练习设置" }));
    const practice = screen.getByRole("complementary", { name: "练习设置" });
    await user.click(within(practice).getByRole("button", { name: "速度 96 BPM，80%" }));
    expect(screen.getByRole("spinbutton", { name: "速度 BPM" })).toBeTruthy();

    await user.click(within(practice).getByRole("button", { name: "重试音频" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "retry-soundfont" });
  });

  it("hides the healthy audio status but keeps non-ready status visible", () => {
    const { rerender } = render(<PlaybackWorkspace session={session(state("paused"))}>乐谱</PlaybackWorkspace>);
    expect(screen.queryByText("音频已就绪")).toBeNull();

    const loading = state("loading");
    loading.soundFont = "loading";
    rerender(<PlaybackWorkspace session={session(loading)}>乐谱</PlaybackWorkspace>);
    expect(screen.getByText("音频准备中")).toBeTruthy();
  });

  it("opens BPM details with one-BPM input and percentage presets", async () => {
    const dispatch = vi.fn(async () => undefined);
    render(<PlaybackWorkspace session={session(state("paused"), dispatch)}>乐谱</PlaybackWorkspace>);
    const user = userEvent.setup();

    expect(screen.queryByRole("spinbutton", { name: "速度 BPM" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "速度 96 BPM，80%" }));

    const input = screen.getByRole("spinbutton", { name: "速度 BPM" });
    expect((input as HTMLInputElement).value).toBe("96");
    expect((input as HTMLInputElement).step).toBe("1");
    expect(screen.queryByRole("slider", { name: "速度" })).toBeNull();
    expect(screen.getByRole("button", { name: "100%（120 BPM）" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "75%（90 BPM）" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "50%（60 BPM）" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "25%（30 BPM）" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "75%（90 BPM）" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "set-score-speed", speed: 0.75 });

    await user.clear(input);
    await user.type(input, "91");
    await user.tab();

    expect(dispatch).toHaveBeenCalledWith({ type: "set-score-speed", speed: 91 / 120 });
  });

  it("switches score navigation modes and recovers from Detached without changing playback", async () => {
    const setMode = vi.fn();
    const returnToPlayback = vi.fn();
    const viewerSession = session(state("playing"));
    const navigationState = {
      mode: "page-turn" as const,
      followState: "detached" as const,
      generation: 1,
      currentPage: 1,
      pageCount: 3,
      pageTurnAvailable: true,
    };
    viewerSession.navigation = {
      getState: () => navigationState,
      subscribe: () => () => undefined,
      setMode,
      returnToPlayback,
      movePage: vi.fn(),
    };
    render(
      <AppStoreProvider store={createAppStore("dark")}>
        <PlaybackWorkspace session={viewerSession}>乐谱</PlaybackWorkspace>
      </AppStoreProvider>,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "返回播放位置" }));
    expect(returnToPlayback).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "谱面导航模式" }));
    await user.click(screen.getByRole("button", { name: "翻页" }));
    expect(setMode).toHaveBeenLastCalledWith("page-turn");
    expect(viewerSession.playback?.dispatch).not.toHaveBeenCalled();
  });
});

function session(
  playbackState: PlaybackState,
  dispatch = vi.fn(async () => undefined),
  destroy = vi.fn(async () => undefined),
): ViewerSessionHandle {
  return {
    playback: {
      getState: () => playbackState,
      subscribe: () => () => undefined,
      dispatch,
      timeline: { durationTicks: 0, durationMs: 0, measures: [] },
    },
    togglePlayback: async () => undefined,
    pauseAndFlush: async () => undefined,
    destroy,
  };
}

function loopRegion() {
  return {
    id: "loop-1",
    label: "主歌",
    labelSource: "user" as const,
    start: { measureId: "measure-0", measureIndex: 0, beatIndex: 0, tick: 0, cachedTimeMs: 0 },
    end: { measureId: "measure-1", measureIndex: 1, beatIndex: 0, tick: 1920, cachedTimeMs: 4000 },
    snapMode: "beat" as const,
    createdAt: "2026-07-13T00:00:00Z",
    updatedAt: "2026-07-13T00:00:00Z",
  };
}

function position(tick: number, cachedTimeMs: number) {
  return {
    measureId: tick >= 1920 ? "measure-1" : "measure-0",
    measureIndex: tick >= 1920 ? 1 : 0,
    beatIndex: 1,
    tick,
    cachedTimeMs,
  };
}

function state(transport: PlaybackState["transport"]): PlaybackState {
  return {
    sessionId: "session-1",
    transport,
    position: { measureId: "measure-0", measureIndex: 0, beatIndex: 0, tick: 0, cachedTimeMs: 0 },
    durationMs: 60_000,
    baseTempo: 120,
    scoreSpeed: 0.8,
    looping: false,
    loopDraft: { snapMode: "beat" },
    loops: [],
    tracks: [],
    trackState: {
      primaryVisibleTrackId: "",
      additionalVisibleTrackIds: [],
      visibilityUpdatedAt: "2026-07-13T00:00:00Z",
      settings: {},
    },
    soundFont: "ready",
    persistence: "clean",
  };
}
