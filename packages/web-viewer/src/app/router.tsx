import { useEffect } from "react";
import { createHashRouter, Outlet, useNavigate } from "react-router";
import type { LocaleHost } from "../i18n/locale-controller";
import type { ExternalNavigationHost } from "../host";
import { AppHeader } from "./AppHeader";
import type { ViewerProductCapabilities } from "./App";
import type { ViewerApplication } from "./ViewerApplication";
import { HomePage } from "./pages/HomePage";
import styles from "./App.module.css";
import type { PdfOmrWorkbenchPort } from "../features/pdf-omr/pdf-omr-port";
import type { ViewerSessionPort } from "../viewer-session/viewer-session-types";
import type { RecognitionSettingsPort } from "../features/application-settings/recognition-settings-port";

export function createAppRouter({
  application,
  localeHost,
  capabilities,
  externalNavigationHost,
  pdfOmr,
  openPdfOmrPreview,
  recognitionSettings,
}: {
  application: ViewerApplication;
  localeHost: LocaleHost;
  capabilities: ViewerProductCapabilities;
  externalNavigationHost?: ExternalNavigationHost;
  pdfOmr?: PdfOmrWorkbenchPort | undefined;
  recognitionSettings?: RecognitionSettingsPort | undefined;
  openPdfOmrPreview?:
    | ((
        file: import("../host").ViewerFile,
        domBindings?: import("../host").ViewerDomBindings,
      ) => Promise<ViewerSessionPort>)
    | undefined;
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
          path: "/settings",
          hydrateFallbackElement: <main aria-busy="true" />,
          lazy: async () => {
            const { SettingsPage } = await import("../features/application-settings/SettingsPage");
            return {
              Component: () => (
                <SettingsPage
                  localeHost={localeHost}
                  recognitionSettings={capabilities.recognitionProviderSettings ? recognitionSettings : undefined}
                />
              ),
            };
          },
        },
        ...(capabilities.pdfOmrWorkbench
          ? [
              {
                path: "/pdf-omr",
                lazy: async () => {
                  const { PdfOmrPage } = await import("./pages/PdfOmrPage");
                  return { Component: () => <PdfOmrPage port={pdfOmr} openPreviewSession={openPdfOmrPreview} /> };
                },
              },
            ]
          : []),
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
                    <StudioPage application={application.getStudioApplication()} openStudio={openStudio} />
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
        localeHost={localeHost}
        capabilities={capabilities}
        {...(externalNavigationHost === undefined ? {} : { externalNavigationHost })}
      />
      <div className={styles.routeViewport}>
        <Outlet />
      </div>
    </div>
  );
}
