import type { LocaleState } from "@zupulse/app-i18n";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createStore, useStore } from "zustand";

export type ViewerTheme = "light" | "dark";
export type LocaleChangeState = "idle" | "saving" | "error";
type AppState = {
  theme: ViewerTheme;
  locale: LocaleState;
  localeChange: LocaleChangeState;
  setTheme(theme: ViewerTheme): void;
  setLocaleState(locale: LocaleState): void;
  setLocaleChange(localeChange: LocaleChangeState): void;
};
export type AppStore = ReturnType<typeof createAppStore>;

export function createAppStore(
  initialTheme: ViewerTheme,
  initialLocale: LocaleState = { preference: "zh-CN", effectiveLocale: "zh-CN" },
) {
  return createStore<AppState>()((set) => ({
    theme: initialTheme,
    locale: initialLocale,
    localeChange: "idle",
    setTheme: (theme) => set({ theme }),
    setLocaleState: (locale) => set({ locale }),
    setLocaleChange: (localeChange) => set({ localeChange }),
  }));
}

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider({ children, store: injectedStore }: { children: ReactNode; store?: AppStore }) {
  const [store] = useState(() => injectedStore ?? createAppStore(readInitialTheme()));
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

function readInitialTheme(): ViewerTheme {
  return storage()?.getItem("zupulse-theme") === "light" ? "light" : "dark";
}

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
