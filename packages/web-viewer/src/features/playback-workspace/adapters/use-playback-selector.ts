import { useCallback, useRef, useSyncExternalStore } from "react";

type PlaybackStore<TState> = {
  getState(): TState;
  subscribe(listener: () => void): () => void;
};

export function usePlaybackSelector<TState, TSelected>(
  playback: PlaybackStore<TState>,
  selector: (state: TState) => TSelected,
  isEqual: (left: TSelected, right: TSelected) => boolean = Object.is,
): TSelected {
  const cache = useRef<{ value: TSelected } | null>(null);
  const getSnapshot = useCallback(() => {
    const selected = selector(playback.getState());
    if (cache.current && isEqual(cache.current.value, selected)) return cache.current.value;
    cache.current = { value: selected };
    return selected;
  }, [isEqual, playback, selector]);

  return useSyncExternalStore(playback.subscribe, getSnapshot, getSnapshot);
}
