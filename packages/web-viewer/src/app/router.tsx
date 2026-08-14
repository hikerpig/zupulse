import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createHashRouter, Outlet, useNavigate } from "react-router";
import type { LocaleHost } from "../i18n/locale-controller";
import type { ExternalNavigationHost } from "../host";
import { AppHeader } from "./AppHeader";
import type { ViewerProductCapabilities } from "./App";
import type { ViewerApplication } from "./ViewerApplication";
import { HomePage } from "./pages/HomePage";
import styles from "./App.module.css";

export const TELEMETRY_PRIVACY_NOTICE_URL = "https://zupulse.vercel.app/privacy.html";

export function createAppRouter({
  application,
  localeHost,
  capabilities,
  externalNavigationHost,
}: {
  application: ViewerApplication;
  localeHost: LocaleHost;
  capabilities: ViewerProductCapabilities;
  externalNavigationHost?: ExternalNavigationHost;
}) {
  const openStudio = (id: string) => application.openStudio(id);
  return createHashRouter([
    {
      element: (
        <ApplicationNavigation
          application={application}
          localeHost={localeHost}
          capabilities={capabilities}
          {...(externalNavigationHost === undefined ? {} : { externalNavigationHost })}
        />
      ),
      children: [
        { path: "/", element: <HomePage capabilities={capabilities} /> },
        {
          path: "/library",
          hydrateFallbackElement: <main aria-busy="true" />,
          lazy: async () => {
            const { LibraryPage } = await import("./pages/LibraryPage");
            return { Component: () => <LibraryPage application={application} /> };
          },
        },
        {
          path: "/viewer/:libraryScoreId",
          hydrateFallbackElement: <main aria-busy="true" />,
          lazy: async () => {
            const { ViewerPage } = await import("./pages/ViewerPage");
            return {
              Component: () => <ViewerPage application={application} capabilities={capabilities} />,
            };
          },
        },
        {
          path: "/studio/:libraryScoreId",
          hydrateFallbackElement: <main aria-busy="true" />,
          lazy: capabilities.harmonyAnalysis
            ? async () => {
                const { StudioPage } = await import("./pages/StudioPage");
                return {
                  Component: () => (
                    <StudioPage
                      application={application.getStudioApplication()}
                      openStudio={openStudio}
                      onIssuePresented={(issue) => application.capturePresentedIssue("studio", issue)}
                    />
                  ),
                };
              }
            : async () => {
                const { StudioUnavailablePage } = await import("./pages/StudioUnavailablePage");
                return { Component: () => <StudioUnavailablePage application={application} /> };
              },
        },
        {
          path: "*",
          hydrateFallbackElement: <main aria-busy="true" />,
          lazy: async () => {
            const { ViewerPage } = await import("./pages/ViewerPage");
            return { Component: () => <ViewerPage application={application} notFound /> };
          },
        },
      ],
    },
  ]);
}

function ApplicationNavigation({
  application,
  localeHost,
  capabilities,
  externalNavigationHost,
}: {
  application: ViewerApplication;
  localeHost: LocaleHost;
  capabilities: ViewerProductCapabilities;
  externalNavigationHost?: ExternalNavigationHost;
}) {
  const navigate = useNavigate();
  useEffect(
    () => application.subscribeNavigation((libraryScoreId) => void navigate(`/viewer/${libraryScoreId}`)),
    [application, navigate],
  );
  return (
    <div className={styles.appFrame}>
      <AppHeader
        application={application}
        localeHost={localeHost}
        capabilities={capabilities}
        {...(externalNavigationHost === undefined ? {} : { externalNavigationHost })}
      />
      <div className={styles.routeViewport}>
        <TelemetryNotice application={application} />
        <Outlet />
      </div>
    </div>
  );
}

function TelemetryNotice({ application }: { application: ViewerApplication }) {
  const { t } = useTranslation("common");
  const state = application.getTelemetryPreference();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  if (!state?.available || !state.enabled || state.noticeAcknowledged || dismissed) return null;

  const choose = (enabled: boolean) => {
    setBusy(true);
    const operation = enabled ? application.acknowledgeTelemetryNotice() : application.setTelemetryPreference(false);
    void operation
      .then(() => setDismissed(true))
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };

  return (
    <aside className={styles.telemetryNotice} aria-labelledby="telemetry-notice-title">
      <div>
        <h2 id="telemetry-notice-title">{t("telemetry.noticeTitle")}</h2>
        <p>{t("telemetry.noticeBody")}</p>
        <a href={TELEMETRY_PRIVACY_NOTICE_URL} target="_blank" rel="noreferrer">
          {t("telemetry.learnMore")}
        </a>
      </div>
      <div className="tw:flex tw:flex-wrap tw:gap-2">
        <button type="button" disabled={busy} onClick={() => choose(true)}>
          {t("telemetry.continueSharing")}
        </button>
        <button type="button" disabled={busy} onClick={() => choose(false)}>
          {t("telemetry.disableSharing")}
        </button>
      </div>
      {busy ? <p role="status">{t("telemetry.saving")}</p> : null}
    </aside>
  );
}
