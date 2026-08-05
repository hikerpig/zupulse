import type { PlaybackCommand } from "@zupulse/web-core";
import type { ViewerPlaybackSlice } from "../../../viewer-session/viewer-session-types";

type SeekPlayback = Pick<ViewerPlaybackSlice, "dispatch" | "previewSeek">;

export function createSeekPreviewScheduler(
  playback: SeekPlayback,
  requestFrame: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancelFrame: (handle: number) => void = cancelAnimationFrame,
) {
  let frame: number | undefined;
  let pending: Extract<PlaybackCommand, { type: "seek" }>["position"] | undefined;

  const cancelPendingFrame = () => {
    if (frame === undefined) return;
    cancelFrame(frame);
    frame = undefined;
  };

  return {
    preview(position: Extract<PlaybackCommand, { type: "seek" }>["position"]) {
      pending = position;
      if (frame !== undefined) return;
      frame = requestFrame(() => {
        frame = undefined;
        const next = pending;
        pending = undefined;
        if (next) playback.previewSeek?.(next);
      });
    },
    commit(position: Extract<PlaybackCommand, { type: "seek" }>["position"]) {
      cancelPendingFrame();
      pending = undefined;
      return playback.dispatch({ type: "seek", position });
    },
    destroy() {
      cancelPendingFrame();
      pending = undefined;
    },
  };
}
