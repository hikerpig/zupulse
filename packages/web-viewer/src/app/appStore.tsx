import type { LocaleState } from "@zupulse/app-i18n";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createStore, useStore } from "zustand";

export type ViewerTheme = "light" | "dark";
export type LocaleChangeState = "idle" | "saving" | "error";
export const DEFAULT_SCORE_ZOOM = 1;
export const MIN_SCORE_ZOOM = 0.75;
export const MAX_SCORE_ZOOM = 2;

type AppState = {
  theme: ViewerTheme;
  locale: LocaleState;
  localeChange: LocaleChangeState;
  scoreZoom: number;
  setTheme(theme: ViewerTheme): void;
  setLocaleState(locale: LocaleState): void;
  setLocaleChange(localeChange: LocaleChangeState): void;
  setScoreZoom(zoom: number): void;
};
export type AppStore = ReturnType<typeof createAppStore>;

export function createAppStore(
  initialTheme: ViewerTheme,
  initialLocale: LocaleState = { preference: "zh-CN", effectiveLocale: "zh-CN" },
  initialScoreZoom = DEFAULT_SCORE_ZOOM,
) {
  return createStore<AppState>()((set) => ({
    theme: initialTheme,
    locale: initialLocale,
    localeChange: "idle",
    scoreZoom: clampScoreZoom(initialScoreZoom),
    setTheme: (theme) => set({ theme }),
    setLocaleState: (locale) => set({ locale }),
    setLocaleChange: (localeChange) => set({ localeChange }),
    setScoreZoom: (scoreZoom) => set({ scoreZoom: clampScoreZoom(scoreZoom) }),
  }));
}

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider({ children, store: injectedStore }: { children: ReactNode; store?: AppStore }) {
  const [store] = useState(
    () => injectedStore ?? createAppStore(readInitialTheme(), undefined, readInitialScoreZoom()),
  );
  return <AppStoreContext.Provider value={store}>{children}</AppStoreContext.Provider>;
}

export function useAppStore<T>(selector: (state: AppState) => T): T {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error("useAppStore must be used within AppStoreProvider");
  return useStore(store, selector);
}

export function useApplyTheme(): ViewerTheme {
  const theme = useAppStore((state) => state.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    storage()?.setItem("zupulse-theme", theme);
  }, [theme]);
  return theme;
}

export function clampScoreZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return DEFAULT_SCORE_ZOOM;
  return Math.min(MAX_SCORE_ZOOM, Math.max(MIN_SCORE_ZOOM, Math.round(zoom * 100) / 100));
}

export function persistScoreZoom(zoom: number): void {
  storage()?.setItem("zupulse-score-zoom", String(clampScoreZoom(zoom)));
}

function readInitialTheme(): ViewerTheme {
  return storage()?.getItem("zupulse-theme") === "light" ? "light" : "dark";
}

function readInitialScoreZoom(): number {
  return clampScoreZoom(Number(storage()?.getItem("zupulse-score-zoom") ?? DEFAULT_SCORE_ZOOM));
}

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
