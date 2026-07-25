import { describe, expect, it, vi } from "vitest";
import { createAppStore, persistScoreNavigationMode } from "../appStore";

describe("createAppStore", () => {
  it("keeps theme state isolated per application", () => {
    const first = createAppStore("dark");
    const second = createAppStore("dark");

    first.getState().setTheme("light");

    expect(first.getState().theme).toBe("light");
    expect(second.getState().theme).toBe("dark");
  });

  it("keeps score zoom isolated and clamps it to the supported range", () => {
    const first = createAppStore("dark", 1);
    const second = createAppStore("dark", 1);

    first.getState().setScoreZoom(4);
    expect(first.getState().scoreZoom).toBe(2);
    first.getState().setScoreZoom(0.2);
    expect(first.getState().scoreZoom).toBe(0.75);
    expect(second.getState().scoreZoom).toBe(1);
  });

  it("keeps score navigation mode device-local and defaults to continuous", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const store = createAppStore("dark");
    expect(store.getState().scoreNavigationMode).toBe("continuous");

    store.getState().setScoreNavigationMode("page-turn");
    persistScoreNavigationMode(store.getState().scoreNavigationMode);

    expect(localStorage.getItem("zupulse-score-navigation-mode")).toBe("page-turn");
    vi.unstubAllGlobals();
  });
});
