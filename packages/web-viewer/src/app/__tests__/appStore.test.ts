import { describe, expect, it, vi } from "vitest";
import {
  createAppStore,
  createPersistedAppStore,
  persistScoreNavigationMode,
  persistScoreWidthMode,
} from "../appStore";

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
    expect(first.getState().scoreZoom).toBe(0.5);
    expect(second.getState().scoreZoom).toBe(1);
  });

  it("keeps viewer preferences device-local and persists both modes", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    const store = createAppStore("dark");
    expect(store.getState().scoreWidthMode).toBe("comfortable");
    expect(store.getState().scoreNavigationMode).toBe("continuous");

    store.getState().setScoreWidthMode("full");
    store.getState().setScoreNavigationMode("page-turn");
    persistScoreWidthMode(store.getState().scoreWidthMode);
    persistScoreNavigationMode(store.getState().scoreNavigationMode);

    expect(localStorage.getItem("zupulse-score-width-mode")).toBe("full");
    expect(localStorage.getItem("zupulse-score-navigation-mode")).toBe("page-turn");
    vi.unstubAllGlobals();
  });

  it("loads the persisted score navigation mode into an injected application store", () => {
    const values = new Map([
      ["zupulse-score-navigation-mode", "page-turn"],
      ["zupulse-score-width-mode", "full"],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });

    const store = createPersistedAppStore({ preference: "zh-CN", effectiveLocale: "zh-CN" });

    expect(store.getState().scoreNavigationMode).toBe("page-turn");
    expect(store.getState().scoreWidthMode).toBe("full");
    vi.unstubAllGlobals();
  });

  it("falls back to comfortable for an invalid persisted score width mode", () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key === "zupulse-score-width-mode" ? "wide" : null),
      setItem: vi.fn(),
    });

    const store = createPersistedAppStore({ preference: "zh-CN", effectiveLocale: "zh-CN" });

    expect(store.getState().scoreWidthMode).toBe("comfortable");
    vi.unstubAllGlobals();
  });
});
