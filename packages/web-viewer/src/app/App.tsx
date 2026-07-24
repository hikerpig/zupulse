import { createAppI18n } from "@zupulse/app-i18n";
import type { i18n } from "i18next";
import { useEffect, useMemo, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { createHashRouter, Outlet, RouterProvider, useNavigate } from "react-router";
import type { ViewerApplication } from "./ViewerApplication";
import type { LocaleHost } from "../i18n/locale-controller";
import { applyLocaleState } from "../i18n/locale-controller";
import { AppStoreProvider, createAppStore, useApplyTheme, useAppStore } from "./appStore";
import { LibraryPage } from "./pages/LibraryPage";
import { ViewerPage } from "./pages/ViewerPage";
import { StudioPage } from "./pages/StudioPage";
import { AppHeader } from "./AppHeader";
import styles from "./App.module.css";

const fallbackLocaleHost: LocaleHost = {
  initialState: { preference: "zh-CN", effectiveLocale: "zh-CN" },
  async setPreference(preference) {
    return {
      preference,
      effectiveLocale: preference === "system" ? "zh-CN" : preference,
    };
  },
};

export function App({
  application,
  localeHost = fallbackLocaleHost,
  i18n: injectedI18n,
}: {
  application: ViewerApplication;
  localeHost?: LocaleHost;
  i18n?: i18n;
}) {
  const i18n = useMemo(
    () => injectedI18n ?? createAppI18n(localeHost.initialState.effectiveLocale),
    [injectedI18n, localeHost],
  );
  const store = useMemo(() => createAppStore(readInitialTheme(), localeHost.initialState), [localeHost]);
  const router = useMemo(
    () =>
      createHashRouter([
        {
          element: <ApplicationNavigation application={application} localeHost={localeHost} />,
          children: [
            { path: "/", element: <LibraryPage application={application} /> },
            { path: "/viewer/:libraryScoreId", element: <ViewerPage application={application} /> },
            { path: "/studio/:libraryScoreId", element: <StudioPage application={application} /> },
            { path: "*", element: <ViewerPage application={application} notFound /> },
          ],
        },
      ]),
    [application, localeHost],
  );
  return (
    <I18nextProvider i18n={i18n}>
      <AppStoreProvider store={store}>
        <ThemeApplicator>
          <LocaleApplicator i18n={i18n}>
            <RouterProvider router={router} />
          </LocaleApplicator>
        </ThemeApplicator>
      </AppStoreProvider>
    </I18nextProvider>
  );
}

function ApplicationNavigation({
  application,
  localeHost,
}: {
  application: ViewerApplication;
  localeHost: LocaleHost;
}) {
  const navigate = useNavigate();
  useEffect(
    () => application.subscribeNavigation((libraryScoreId) => void navigate(`/viewer/${libraryScoreId}`)),
    [application, navigate],
  );
  return (
    <div className={styles.appFrame}>
      <AppHeader localeHost={localeHost} />
      <div className={styles.routeViewport}>
        <Outlet />
      </div>
    </div>
  );
}

function ThemeApplicator({ children }: { children: ReactNode }) {
  useApplyTheme();
  return children;
}

function LocaleApplicator({ children, i18n }: { children: ReactNode; i18n: i18n }) {
  const locale = useAppStore((state) => state.locale);
  useEffect(() => {
    void applyLocaleState({ state: locale, i18n, document });
  }, [i18n, locale]);
  return children;
}

function readInitialTheme(): "light" | "dark" {
  try {
    return globalThis.localStorage?.getItem("zupulse-theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}
