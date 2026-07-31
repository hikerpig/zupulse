import { createAppI18n } from "@zupulse/app-i18n";
import type { i18n } from "i18next";
import { useEffect, useMemo, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { RouterProvider } from "react-router";
import type { ViewerApplication } from "./ViewerApplication";
import type { LocaleHost } from "../i18n/locale-controller";
import { applyLocaleState } from "../i18n/locale-controller";
import { AppStoreProvider, createPersistedAppStore, useApplyTheme, useAppStore } from "./appStore";
import { createAppRouter } from "./router";

const fallbackLocaleHost: LocaleHost = {
  initialState: { preference: "zh-CN", effectiveLocale: "zh-CN" },
  async setPreference(preference) {
    return {
      preference,
      effectiveLocale: preference === "system" ? "zh-CN" : preference,
    };
  },
};

export type ViewerProductCapabilities = {
  harmonyAnalysis: boolean;
};

export const defaultViewerProductCapabilities: ViewerProductCapabilities = {
  harmonyAnalysis: true,
};

export function App({
  application,
  localeHost = fallbackLocaleHost,
  i18n: injectedI18n,
  capabilities = defaultViewerProductCapabilities,
}: {
  application: ViewerApplication;
  localeHost?: LocaleHost;
  i18n?: i18n;
  capabilities?: ViewerProductCapabilities;
}) {
  const i18n = useMemo(
    () => injectedI18n ?? createAppI18n(localeHost.initialState.effectiveLocale),
    [injectedI18n, localeHost],
  );
  const store = useMemo(() => createPersistedAppStore(localeHost.initialState), [localeHost]);
  const router = useMemo(
    () => createAppRouter({ application, localeHost, capabilities }),
    [application, capabilities, localeHost],
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
