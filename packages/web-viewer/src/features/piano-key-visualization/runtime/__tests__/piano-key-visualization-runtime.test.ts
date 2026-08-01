import { describe, expect, it, vi } from "vitest";
import type { PianoKeyHintEvent } from "@zupulse/web-core";
import { createPianoKeyVisualizationRuntime } from "../piano-key-visualization-runtime";

describe("createPianoKeyVisualizationRuntime", () => {
  it("commits at most once per frame, reacts to tick discontinuities, and cancels on stop", () => {
    const frames: FrameRequestCallback[] = [];
    const cancelFrame = vi.fn();
    const render = vi.fn();
    let tick = 0;
    const events: PianoKeyHintEvent[] = [{ pitch: 60, startTick: 100, endTick: 200, hand: "right" }];
    const runtime = createPianoKeyVisualizationRuntime({
      events,
      readTick: () => tick,
      readMode: () => "both-hands",
      render,
      requestFrame(callback) {
        frames.push(callback);
        return frames.length;
      },
      cancelFrame,
    });

    runtime.start();
    expect(frames).toHaveLength(1);
    frames.shift()?.(0);
    expect(render).toHaveBeenCalledOnce();

    frames.shift()?.(16);
    expect(render).toHaveBeenCalledOnce();

    tick = 150;
    frames.shift()?.(32);
    expect(render).toHaveBeenCalledTimes(2);
    expect(render.mock.calls[1]?.[0].activePitches).toEqual([60]);

    tick = 0;
    frames.shift()?.(48);
    expect(render).toHaveBeenCalledTimes(3);
    expect(render.mock.calls[2]?.[0].activePitches).toEqual([]);

    runtime.stop();
    expect(cancelFrame).toHaveBeenCalledOnce();
  });
});
