import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createStore, useStore } from 'zustand';

export type ViewerTheme = 'light' | 'dark';
type AppState = { theme: ViewerTheme; setTheme(theme: ViewerTheme): void };
export type AppStore = ReturnType<typeof createAppStore>;

export function createAppStore(initialTheme: ViewerTheme) {
  return createStore<AppState>()((set) => ({
    theme: initialTheme,
    setTheme: (theme) => set({ theme }),
  }));
}

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createAppStore(readInitialTheme()));
  return <AppStoreContext.Provider value={store}>{children}</AppStoreContext.Provider>;
}

export function useAppStore<T>(selector: (state: AppState) => T): T {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore must be used within AppStoreProvider');
  return useStore(store, selector);
}

export function useApplyTheme(): ViewerTheme {
  const theme = useAppStore((state) => state.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    storage()?.setItem('tab-viewer-theme', theme);
  }, [theme]);
  return theme;
}

function readInitialTheme(): ViewerTheme {
  return storage()?.getItem('tab-viewer-theme') === 'light' ? 'light' : 'dark';
}

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
