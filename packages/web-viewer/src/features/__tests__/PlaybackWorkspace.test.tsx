// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaybackState } from "@zupulse/web-core";
import type { ViewerSessionHandle } from "../../host";
import { PlaybackWorkspace } from "../PlaybackWorkspace";

afterEach(cleanup);

describe("PlaybackWorkspace transport bar", () => {
  it.each([
    ["playing", "暂停", "lucide-pause"],
    ["paused", "播放", "lucide-play"],
  ] as const)("shows the matching icon for %s playback", (transport, label, iconClass) => {
    render(<PlaybackWorkspace session={session(state(transport))}>乐谱</PlaybackWorkspace>);

    const button = screen.getByRole("button", { name: label });
    expect(button.querySelector(`svg.${iconClass}`)).toBeTruthy();
  });

  it("opens BPM details with one-BPM input and percentage presets", async () => {
    const dispatch = vi.fn(async () => undefined);
    render(<PlaybackWorkspace session={session(state("paused"), dispatch)}>乐谱</PlaybackWorkspace>);
    const user = userEvent.setup();

    expect(screen.queryByRole("spinbutton", { name: "速度 BPM" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "速度 96 BPM" }));

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
});

function session(playbackState: PlaybackState, dispatch = vi.fn(async () => undefined)): ViewerSessionHandle {
  return {
    playback: {
      getState: () => playbackState,
      subscribe: () => () => undefined,
      dispatch,
      timeline: { durationTicks: 0, durationMs: 0, measures: [] },
    },
    togglePlayback: async () => undefined,
    pauseAndFlush: async () => undefined,
    destroy: async () => undefined,
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
