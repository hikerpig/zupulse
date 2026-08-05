// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StudioApplication, StudioApplicationSnapshot } from "../StudioApplication";
import { useStudioSnapshot } from "../adapters/use-studio-snapshot";

describe("useStudioSnapshot", () => {
  it("keeps the selected value stable across unrelated Studio updates", () => {
    const studio: StudioApplicationSnapshot = {
      libraryScoreId: "score-1",
      status: "ready",
      document: {
        schemaVersion: "1.0.0",
        libraryScoreId: "score-1",
        sourceContentHash: "a".repeat(64),
        documentVersion: 0,
        activeRevision: {
          id: "revision-1",
          algorithmVersion: "v1",
          createdAt: "2026-07-15T00:00:00.000Z",
          parameters: { scope: { includedTrackIds: ["track-1"] }, topK: 8, decisionThreshold: 0.6 },
          segments: [],
        },
        corrections: [],
        annotationTarget: { trackId: "track-1", staffIndex: 0 },
        updatedAt: "2026-07-15T00:00:00.000Z",
      },
    };
    const store = createApplicationStore(studio);
    let renders = 0;
    const { result, unmount } = renderHook(() => {
      renders += 1;
      return useStudioSnapshot(store.application, (snapshot) => snapshot?.status);
    });

    act(() =>
      store.update({
        ...studio,
        availableTrackIds: ["track-1"],
      }),
    );

    expect(result.current).toBe("ready");
    expect(renders).toBe(1);
    expect(store.listenerCount()).toBe(1);
    unmount();
    expect(store.listenerCount()).toBe(0);
  });

  it("renders when the selected Studio state changes", () => {
    const store = createApplicationStore({ libraryScoreId: "score-1", status: "loading" });
    const { result } = renderHook(() => useStudioSnapshot(store.application, (snapshot) => snapshot?.status));

    act(() => store.update({ libraryScoreId: "score-1", status: "ready" }));

    expect(result.current).toBe("ready");
  });
});

function createApplicationStore(initialSnapshot: StudioApplicationSnapshot | undefined) {
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();
  return {
    application: {
      getSnapshot: () => snapshot,
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } as unknown as StudioApplication,
    update(next: StudioApplicationSnapshot | undefined) {
      snapshot = next;
      for (const listener of listeners) listener();
    },
    listenerCount: () => listeners.size,
  };
}
