import type { LocaleState } from "@zupulse/app-i18n";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createStore, useStore } from "zustand";

export type ViewerTheme = "light" | "dark";
export type ViewerShell = "classic" | "device";
export type ScoreNavigationMode = "continuous" | "page-turn";
export type ScoreWidthMode = "comfortable" | "full";
export type LocaleChangeState = "idle" | "saving" | "error";
export const DEFAULT_SCORE_ZOOM = 1;
export const MIN_SCORE_ZOOM = 0.5;
export const MAX_SCORE_ZOOM = 2;

type AppState = {
  theme: ViewerTheme;
  shell: ViewerShell;
  locale: LocaleState;
  localeChange: LocaleChangeState;
  scoreZoom: number;
  scoreWidthMode: ScoreWidthMode;
  scoreNavigationMode: ScoreNavigationMode;
  setTheme(theme: ViewerTheme): void;
  setShell(shell: ViewerShell): void;
  setLocaleState(locale: LocaleState): void;
  setLocaleChange(localeChange: LocaleChangeState): void;
  setScoreZoom(zoom: number): void;
  setScoreWidthMode(mode: ScoreWidthMode): void;
  setScoreNavigationMode(mode: ScoreNavigationMode): void;
};
export type AppStore = ReturnType<typeof createAppStore>;

export function createAppStore(
  initialTheme: ViewerTheme,
  initialLocale: LocaleState = { preference: "zh-CN", effectiveLocale: "zh-CN" },
  initialScoreZoom = DEFAULT_SCORE_ZOOM,
  initialScoreNavigationMode: ScoreNavigationMode = "continuous",
  initialScoreWidthMode: ScoreWidthMode = "comfortable",
  initialShell: ViewerShell = "classic",
) {
  return createStore<AppState>()((set) => ({
    theme: initialTheme,
    shell: initialShell,
    locale: initialLocale,
    localeChange: "idle",
    scoreZoom: clampScoreZoom(initialScoreZoom),
    scoreWidthMode: initialScoreWidthMode,
    scoreNavigationMode: initialScoreNavigationMode,
    setTheme: (theme) => set({ theme }),
    setShell: (shell) => set({ shell }),
    setLocaleState: (locale) => set({ locale }),
    setLocaleChange: (localeChange) => set({ localeChange }),
    setScoreZoom: (scoreZoom) => set({ scoreZoom: clampScoreZoom(scoreZoom) }),
    setScoreWidthMode: (scoreWidthMode) => set({ scoreWidthMode }),
    setScoreNavigationMode: (scoreNavigationMode) => set({ scoreNavigationMode }),
  }));
}

export function createPersistedAppStore(initialLocale: LocaleState): AppStore {
  return createAppStore(
    readInitialTheme(),
    initialLocale,
    readInitialScoreZoom(),
    readInitialScoreNavigationMode(),
    readInitialScoreWidthMode(),
    readInitialShell(),
  );
}

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider({ children, store: injectedStore }: { children: ReactNode; store?: AppStore }) {
  const [store] = useState(
    () => injectedStore ?? createPersistedAppStore({ preference: "zh-CN", effectiveLocale: "zh-CN" }),
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

export function useApplyShell(): ViewerShell {
  const shell = useAppStore((state) => state.shell);
  useEffect(() => {
    document.documentElement.dataset.shell = shell;
    storage()?.setItem("zupulse-shell", shell);
  }, [shell]);
  return shell;
}

export function clampScoreZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return DEFAULT_SCORE_ZOOM;
  return Math.min(MAX_SCORE_ZOOM, Math.max(MIN_SCORE_ZOOM, Math.round(zoom * 100) / 100));
}

export function persistScoreZoom(zoom: number): void {
  storage()?.setItem("zupulse-score-zoom", String(clampScoreZoom(zoom)));
}

export function commitScoreZoom(zoom: number): number {
  const committed = clampScoreZoom(zoom);
  persistScoreZoom(committed);
  return committed;
}

export function persistScoreWidthMode(mode: ScoreWidthMode): void {
  storage()?.setItem("zupulse-score-width-mode", mode);
}

export function persistScoreNavigationMode(mode: ScoreNavigationMode): void {
  storage()?.setItem("zupulse-score-navigation-mode", mode);
}

function readInitialTheme(): ViewerTheme {
  return storage()?.getItem("zupulse-theme") === "light" ? "light" : "dark";
}

function readInitialShell(): ViewerShell {
  return storage()?.getItem("zupulse-shell") === "device" ? "device" : "classic";
}

function readInitialScoreZoom(): number {
  return clampScoreZoom(Number(storage()?.getItem("zupulse-score-zoom") ?? DEFAULT_SCORE_ZOOM));
}

function readInitialScoreWidthMode(): ScoreWidthMode {
  return storage()?.getItem("zupulse-score-width-mode") === "full" ? "full" : "comfortable";
}

function readInitialScoreNavigationMode(): ScoreNavigationMode {
  return storage()?.getItem("zupulse-score-navigation-mode") === "page-turn" ? "page-turn" : "continuous";
}

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
