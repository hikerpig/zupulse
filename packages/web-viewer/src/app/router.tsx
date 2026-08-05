import { useEffect } from "react";
import { createHashRouter, Outlet, useNavigate } from "react-router";
import type { LocaleHost } from "../i18n/locale-controller";
import { AppHeader } from "./AppHeader";
import type { ViewerProductCapabilities } from "./App";
import type { ViewerApplication } from "./ViewerApplication";
import { HomePage } from "./pages/HomePage";
import styles from "./App.module.css";

export function createAppRouter({
  application,
  localeHost,
  capabilities,
}: {
  application: ViewerApplication;
  localeHost: LocaleHost;
  capabilities: ViewerProductCapabilities;
}) {
  const openStudio = (id: string) => application.openStudio(id);
  return createHashRouter([
    {
      element: <ApplicationNavigation application={application} localeHost={localeHost} capabilities={capabilities} />,
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
}: {
  application: ViewerApplication;
  localeHost: LocaleHost;
  capabilities: ViewerProductCapabilities;
}) {
  const navigate = useNavigate();
  useEffect(
    () => application.subscribeNavigation((libraryScoreId) => void navigate(`/viewer/${libraryScoreId}`)),
    [application, navigate],
  );
  return (
    <div className={styles.appFrame}>
      <AppHeader localeHost={localeHost} capabilities={capabilities} />
      <div className={styles.routeViewport}>
        <Outlet />
      </div>
    </div>
  );
}
