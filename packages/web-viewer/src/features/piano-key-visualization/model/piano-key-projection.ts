import { ALPHA_TAB_TICKS_PER_QUARTER, type PianoHandMode, type PianoKeyHintEvent } from "@zupulse/web-core";

export const PIANO_KEY_LOOKAHEAD_TICKS = ALPHA_TAB_TICKS_PER_QUARTER * 4;
export const PIANO_KEY_LOOKAHEAD_SECONDS = 2;
export const PIANO_KEY_MIN_LOOKAHEAD_QUARTERS = 2;
export const PIANO_KEY_MAX_LOOKAHEAD_QUARTERS = 8;

export type PianoKeyActive = {
  pitch: number;
  hand: PianoKeyHintEvent["hand"];
};

export type PianoKeyFrameHint = PianoKeyHintEvent & {
  startRatio: number;
  endRatio: number;
};

export type PianoKeyFrame = {
  currentTick: number;
  activeKeys: PianoKeyActive[];
  hints: PianoKeyFrameHint[];
};

export type PianoKeyFrameProjector = {
  project(currentTick: number, mode: PianoHandMode, lookaheadTicks?: number): PianoKeyFrame;
};

// The lookahead follows the effective playback tempo so the falling speed feels
// constant: slow practice still gets a useful preview, fast passages stay readable.
export function pianoKeyLookaheadTicks(effectiveTempo: number): number {
  if (!Number.isFinite(effectiveTempo) || effectiveTempo <= 0) return PIANO_KEY_LOOKAHEAD_TICKS;
  const quarters = (effectiveTempo / 60) * PIANO_KEY_LOOKAHEAD_SECONDS;
  const clamped = Math.min(PIANO_KEY_MAX_LOOKAHEAD_QUARTERS, Math.max(PIANO_KEY_MIN_LOOKAHEAD_QUARTERS, quarters));
  return Math.round(clamped * ALPHA_TAB_TICKS_PER_QUARTER);
}

export function createPianoKeyFrameProjector(events: readonly PianoKeyHintEvent[]): PianoKeyFrameProjector {
  const indexedEvents = [...events].sort(compareEvents);
  const maximumDuration = indexedEvents.reduce(
    (maximum, event) => Math.max(maximum, event.endTick - event.startTick),
    0,
  );
  return {
    project(currentTick, mode, lookaheadTicks = PIANO_KEY_LOOKAHEAD_TICKS) {
      const windowEnd = currentTick + lookaheadTicks;
      const firstCandidate = lowerBoundStartTick(indexedEvents, currentTick - maximumDuration);
      const afterLastCandidate = upperBoundStartTick(indexedEvents, windowEnd);
      return projectCandidateEvents(indexedEvents.slice(firstCandidate, afterLastCandidate), currentTick, mode, {
        lookaheadTicks,
      });
    },
  };
}

export function projectPianoKeyFrame(
  events: readonly PianoKeyHintEvent[],
  currentTick: number,
  mode: PianoHandMode,
  options?: { lookaheadTicks?: number },
): PianoKeyFrame {
  return projectCandidateEvents(events, currentTick, mode, options);
}

function projectCandidateEvents(
  events: readonly PianoKeyHintEvent[],
  currentTick: number,
  mode: PianoHandMode,
  options?: { lookaheadTicks?: number },
): PianoKeyFrame {
  const lookaheadTicks = options?.lookaheadTicks ?? PIANO_KEY_LOOKAHEAD_TICKS;
  const windowEnd = currentTick + lookaheadTicks;
  const visible = events.filter(
    (event) => handIsVisible(event.hand, mode) && event.endTick > currentTick && event.startTick <= windowEnd,
  );
  const activeByPitch = new Map<number, PianoKeyHintEvent["hand"]>();
  for (const event of visible) {
    if (event.startTick <= currentTick && currentTick < event.endTick && !activeByPitch.has(event.pitch)) {
      activeByPitch.set(event.pitch, event.hand);
    }
  }
  const activeKeys = [...activeByPitch.entries()]
    .map(([pitch, hand]) => ({ pitch, hand }))
    .sort((left, right) => left.pitch - right.pitch);
  return {
    currentTick,
    activeKeys,
    hints: visible.map((event) => ({
      ...event,
      startRatio: clampRatio((event.startTick - currentTick) / lookaheadTicks),
      endRatio: clampRatio((event.endTick - currentTick) / lookaheadTicks),
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
