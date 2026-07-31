// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { Profiler } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ViewerSessionHandle } from "../../../host";
import { RhythmPracticePanel } from "../panels/rhythm-practice-panel";

describe("Playback practice rendering boundary", () => {
  it("does not render the rhythm panel for a position-only snapshot", () => {
    const store = createPlayback();
    const onRender = vi.fn();
    render(
      <Profiler id="rhythm" onRender={onRender}>
        <RhythmPracticePanel playback={store.playback} />
      </Profiler>,
    );

    act(() => store.updatePosition(120));

    expect(onRender).toHaveBeenCalledOnce();
  });
});

function createPlayback() {
  const rhythm = {
    metronome: { enabled: false, volume: 60 },
    countIn: { enabled: false, volume: 70 },
  };
  let state = {
    rhythm,
    soundFont: "ready" as const,
    transport: "paused" as const,
    position: { tick: 0 },
  };
  const listeners = new Set<() => void>();
  const playback = {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch: vi.fn(),
  } as unknown as NonNullable<ViewerSessionHandle["playback"]>;
  return {
    playback,
    updatePosition(tick: number) {
      state = { ...state, position: { tick } };
      for (const listener of listeners) listener();
    },
  };
}
