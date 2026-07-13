import { useEffect, useMemo, type ReactNode } from "react";
import { createHashRouter, Outlet, RouterProvider, useNavigate } from "react-router";
import type { ViewerApplication } from "./ViewerApplication";
import { AppStoreProvider, useApplyTheme } from "./appStore";
import { LibraryPage } from "./pages/LibraryPage";
import { ViewerPage } from "./pages/ViewerPage";

export function App({ application }: { application: ViewerApplication }) {
  const router = useMemo(
    () =>
      createHashRouter([
        {
          element: <ApplicationNavigation application={application} />,
          children: [
            { path: "/", element: <LibraryPage application={application} /> },
            { path: "/viewer/:libraryScoreId", element: <ViewerPage application={application} /> },
            { path: "*", element: <ViewerPage application={application} notFound /> },
          ],
        },
      ]),
    [application],
  );
  return (
    <AppStoreProvider>
      <ThemeApplicator>
        <RouterProvider router={router} />
      </ThemeApplicator>
    </AppStoreProvider>
  );
}

function ApplicationNavigation({ application }: { application: ViewerApplication }) {
  const navigate = useNavigate();
  useEffect(
    () => application.subscribeNavigation((libraryScoreId) => void navigate(`/viewer/${libraryScoreId}`)),
    [application, navigate],
  );
  return <Outlet />;
}

function ThemeApplicator({ children }: { children: ReactNode }) {
  useApplyTheme();
  return children;
}
