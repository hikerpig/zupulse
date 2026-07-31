// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePlaybackSelector } from "../adapters/use-playback-selector";

describe("usePlaybackSelector", () => {
  it("does not render when an unrelated playback field changes", () => {
    const store = createStore({ position: 0, rhythm: { enabled: false } });
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return usePlaybackSelector(store.playback, (state) => state.rhythm);
    });
    const first = result.current;

    act(() => store.update({ position: 1, rhythm: first }));

    expect(result.current).toBe(first);
    expect(renders).toBe(1);
  });

  it("renders when the selected playback field changes and unsubscribes on unmount", () => {
    const store = createStore({ position: 0, rhythm: { enabled: false } });
    const { result, unmount } = renderHook(() => usePlaybackSelector(store.playback, (state) => state.rhythm));

    act(() => store.update({ position: 0, rhythm: { enabled: true } }));

    expect(result.current).toEqual({ enabled: true });
    expect(store.listenerCount()).toBe(1);
    unmount();
    expect(store.listenerCount()).toBe(0);
  });
});

function createStore<T>(initialState: T) {
  let state = initialState;
  const listeners = new Set<() => void>();
  return {
    playback: {
      getState: () => state,
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    update(next: T) {
      state = next;
      for (const listener of listeners) listener();
    },
    listenerCount: () => listeners.size,
  };
}
