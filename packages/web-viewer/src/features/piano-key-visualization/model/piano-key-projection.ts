import { ALPHA_TAB_TICKS_PER_QUARTER, type PianoHandMode, type PianoKeyHintEvent } from "@zupulse/web-core";

export const PIANO_KEY_LOOKAHEAD_TICKS = ALPHA_TAB_TICKS_PER_QUARTER * 4;

export type PianoKeyFrameHint = PianoKeyHintEvent & {
  startRatio: number;
  endRatio: number;
};

export type PianoKeyFrame = {
  currentTick: number;
  activePitches: number[];
  hints: PianoKeyFrameHint[];
};

export type PianoKeyFrameProjector = {
  project(currentTick: number, mode: PianoHandMode): PianoKeyFrame;
};

export function createPianoKeyFrameProjector(events: readonly PianoKeyHintEvent[]): PianoKeyFrameProjector {
  const indexedEvents = [...events].sort(compareEvents);
  const maximumDuration = indexedEvents.reduce(
    (maximum, event) => Math.max(maximum, event.endTick - event.startTick),
    0,
  );
  return {
    project(currentTick, mode) {
      const windowEnd = currentTick + PIANO_KEY_LOOKAHEAD_TICKS;
      const firstCandidate = lowerBoundStartTick(indexedEvents, currentTick - maximumDuration);
      const afterLastCandidate = upperBoundStartTick(indexedEvents, windowEnd);
      return projectCandidateEvents(indexedEvents.slice(firstCandidate, afterLastCandidate), currentTick, mode);
    },
  };
}

export function projectPianoKeyFrame(
  events: readonly PianoKeyHintEvent[],
  currentTick: number,
  mode: PianoHandMode,
): PianoKeyFrame {
  return projectCandidateEvents(events, currentTick, mode);
}

function projectCandidateEvents(
  events: readonly PianoKeyHintEvent[],
  currentTick: number,
  mode: PianoHandMode,
): PianoKeyFrame {
  const windowEnd = currentTick + PIANO_KEY_LOOKAHEAD_TICKS;
  const visible = events.filter(
    (event) => handIsVisible(event.hand, mode) && event.endTick > currentTick && event.startTick <= windowEnd,
  );
  const activePitches = [
    ...new Set(
      visible
        .filter((event) => event.startTick <= currentTick && currentTick < event.endTick)
        .map((event) => event.pitch),
    ),
  ].sort((left, right) => left - right);
  return {
    currentTick,
    activePitches,
    hints: visible.map((event) => ({
      ...event,
      startRatio: clampRatio((event.startTick - currentTick) / PIANO_KEY_LOOKAHEAD_TICKS),
      endRatio: clampRatio((event.endTick - currentTick) / PIANO_KEY_LOOKAHEAD_TICKS),
    })),
  };
}

function lowerBoundStartTick(events: readonly PianoKeyHintEvent[], target: number): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (events[middle]!.startTick < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBoundStartTick(events: readonly PianoKeyHintEvent[], target: number): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (events[middle]!.startTick <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function compareEvents(left: PianoKeyHintEvent, right: PianoKeyHintEvent): number {
  return left.startTick - right.startTick || left.endTick - right.endTick || left.pitch - right.pitch;
}

function handIsVisible(hand: PianoKeyHintEvent["hand"], mode: PianoHandMode): boolean {
  return mode === "both-hands" || mode === `${hand}-hand`;
}

function clampRatio(value: number): number {
  return Math.min(1, Math.max(0, value));
}
