import type { PianoHandMode, PianoKeyHintEvent } from "@zupulse/web-core";
import { createPianoKeyFrameProjector, type PianoKeyFrame } from "../model/piano-key-projection";

export type PianoKeyVisualizationRuntime = {
  start(): void;
  stop(): void;
};

export function createPianoKeyVisualizationRuntime({
  events,
  readTick,
  readMode,
  readLookaheadTicks,
  render,
  requestFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
}: {
  events: readonly PianoKeyHintEvent[];
  readTick(): number;
  readMode(): PianoHandMode;
  readLookaheadTicks(): number;
  render(frame: PianoKeyFrame): void;
  requestFrame?(callback: FrameRequestCallback): number;
  cancelFrame?(handle: number): void;
}): PianoKeyVisualizationRuntime {
  let frameHandle: number | undefined;
  let previousKey: string | undefined;
  const projector = createPianoKeyFrameProjector(events);

  const update: FrameRequestCallback = () => {
    const tick = readTick();
    const mode = readMode();
    const lookaheadTicks = readLookaheadTicks();
    const key = `${tick}:${mode}:${lookaheadTicks}`;
    if (key !== previousKey) {
      previousKey = key;
      render(projector.project(tick, mode, lookaheadTicks));
    }
    frameHandle = requestFrame(update);
  };

  return {
    start() {
      if (frameHandle !== undefined) return;
      frameHandle = requestFrame(update);
    },
    stop() {
      if (frameHandle === undefined) return;
      cancelFrame(frameHandle);
      frameHandle = undefined;
      previousKey = undefined;
    },
  };
}
