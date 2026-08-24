import { createAppI18n } from "@zupulse/app-i18n";
import type { i18n } from "i18next";
import { useEffect, useMemo, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { RouterProvider } from "react-router";
import type { ViewerApplication } from "./ViewerApplication";
import type { LocaleHost } from "../i18n/locale-controller";
import type { ExternalNavigationHost } from "../host";
import { applyLocaleState } from "../i18n/locale-controller";
import { AppStoreProvider, createPersistedAppStore, useApplyTheme, useAppStore } from "./appStore";
import { createAppRouter } from "./router";
import type {
  PdfOmrMidiCorrectionPort,
  RecognitionHistoryPort,
  RecognitionJobPort,
} from "../features/pdf-omr/pdf-omr-port";
import type { ViewerSessionPort } from "../viewer-session/viewer-session-types";
import type { RecognitionSettingsPort } from "../features/application-settings/recognition-settings-port";

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
  pdfOmrWorkbench?: boolean;
  pdfOmrHistory?: boolean;
  recognitionProviderSettings?: boolean;
};

export const defaultViewerProductCapabilities: ViewerProductCapabilities = {
  harmonyAnalysis: true,
  pdfOmrWorkbench: false,
  recognitionProviderSettings: false,
};

export function App({
  application,
  localeHost = fallbackLocaleHost,
  i18n: injectedI18n,
  capabilities = defaultViewerProductCapabilities,
  externalNavigationHost,
  pdfOmr,
  pdfOmrHistory,
  pdfOmrMidi,
  openPdfOmrPreview,
  recognitionSettings,
}: {
  application: ViewerApplication;
  localeHost?: LocaleHost;
  i18n?: i18n;
  capabilities?: ViewerProductCapabilities;
  externalNavigationHost?: ExternalNavigationHost;
  pdfOmr?: RecognitionJobPort | undefined;
  pdfOmrHistory?: RecognitionHistoryPort | undefined;
  pdfOmrMidi?: PdfOmrMidiCorrectionPort | undefined;
  recognitionSettings?: RecognitionSettingsPort | undefined;
  openPdfOmrPreview?:
    | ((
        file: import("../host").ViewerFile,
        domBindings?: import("../host").ViewerDomBindings,
      ) => Promise<ViewerSessionPort>)
    | undefined;
}) {
  const i18n = useMemo(
    () => injectedI18n ?? createAppI18n(localeHost.initialState.effectiveLocale),
    [injectedI18n, localeHost],
  );
  const store = useMemo(() => createPersistedAppStore(localeHost.initialState), [localeHost]);
  const router = useMemo(
    () =>
      createAppRouter({
        application,
        localeHost,
        capabilities,
        ...(externalNavigationHost === undefined ? {} : { externalNavigationHost }),
        pdfOmr,
        pdfOmrHistory,
        pdfOmrMidi,
        openPdfOmrPreview,
        recognitionSettings,
      }),
    [
      application,
      capabilities,
      externalNavigationHost,
      localeHost,
      openPdfOmrPreview,
      pdfOmr,
      pdfOmrHistory,
      pdfOmrMidi,
      recognitionSettings,
    ],
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
