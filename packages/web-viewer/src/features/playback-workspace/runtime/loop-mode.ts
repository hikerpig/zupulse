import { musicalPositionFromTick } from "@zupulse/web-core";
import type { ViewerPlaybackSlice } from "../../../viewer-session/viewer-session-types";

type Playback = ViewerPlaybackSlice;
type PlaybackState = ReturnType<Playback["getState"]>;

export function setPlaybackLoopMode(playback: Playback, state: PlaybackState, enabled: boolean): void {
  if (enabled === state.looping) return;
  const activeLoop = state.loops.find((loop) => loop.id === state.activeLoopId && loop.deletedAt === undefined);
  const hasPlayableLoop =
    activeLoop !== undefined ||
    Boolean(state.loopDraft.start && state.loopDraft.end && state.loopDraft.start.tick < state.loopDraft.end.tick);
  if (!enabled || hasPlayableLoop) {
    void playback.dispatch({ type: "set-loop-enabled", enabled });
    return;
  }
  initializeLoopDraft(playback, state, activeLoop);
}

function initializeLoopDraft(
  playback: Playback,
  state: PlaybackState,
  activeLoop: PlaybackState["loops"][number] | undefined,
): void {
  if (state.loopDraft.start && state.loopDraft.end) return;
  const measure =
    playback.timeline.measures.find((item) => item.index === state.position.measureIndex) ??
    playback.timeline.measures[0];
  if (!measure && !activeLoop) return;
  const start =
    activeLoop?.start ??
    musicalPositionFromTick(
      measure!.startTick,
      (measure!.startTick / Math.max(1, playback.timeline.durationTicks)) * playback.timeline.durationMs,
      playback.timeline,
    );
  const endTick =
    activeLoop?.end.tick ?? Math.min(playback.timeline.durationTicks, measure!.startTick + measure!.durationTicks);
  const end =
    activeLoop?.end ??
    musicalPositionFromTick(
      endTick,
      (endTick / Math.max(1, playback.timeline.durationTicks)) * playback.timeline.durationMs,
      playback.timeline,
    );
  if (!state.loopDraft.start) {
    void playback.dispatch({ type: "set-loop-boundary", boundary: "start", position: start });
  }
  if (!state.loopDraft.end) {
    void playback.dispatch({ type: "set-loop-boundary", boundary: "end", position: end });
  }
  if (!activeLoop) {
    void playback.dispatch({ type: "commit-loop-draft" });
  }
}
