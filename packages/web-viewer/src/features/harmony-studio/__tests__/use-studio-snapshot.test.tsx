// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ViewerApplication, ViewerApplicationSnapshot } from "../../../app/ViewerApplication";
import { useStudioSnapshot } from "../adapters/use-studio-snapshot";

describe("useStudioSnapshot", () => {
  it("keeps the selected Studio slice stable across unrelated application updates", () => {
    const studio = { libraryScoreId: "score-1", status: "ready" as const };
    const store = createApplicationStore({ studio });
    let renders = 0;
    const { result, unmount } = renderHook(() => {
      renders += 1;
      return useStudioSnapshot(store.application, (snapshot) => snapshot.studio);
    });

    act(() =>
      store.update({
        studio,
        library: { scores: [], loading: true },
      }),
    );

    expect(result.current).toBe(studio);
    expect(renders).toBe(1);
    expect(store.listenerCount()).toBe(1);
    unmount();
    expect(store.listenerCount()).toBe(0);
  });

  it("renders when the selected Studio slice changes", () => {
    const store = createApplicationStore({
      studio: { libraryScoreId: "score-1", status: "loading" },
    });
    const { result } = renderHook(() => useStudioSnapshot(store.application, (snapshot) => snapshot.studio));

    act(() =>
      store.update({
        studio: { libraryScoreId: "score-1", status: "ready" },
      }),
    );

    expect(result.current?.status).toBe("ready");
  });
});

function createApplicationStore(initialSnapshot: ViewerApplicationSnapshot) {
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();
  return {
    application: {
      getSnapshot: () => snapshot,
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } as unknown as ViewerApplication,
    update(next: ViewerApplicationSnapshot) {
      snapshot = next;
      for (const listener of listeners) listener();
    },
    listenerCount: () => listeners.size,
  };
}
