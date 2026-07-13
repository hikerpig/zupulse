import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { LibraryBig } from "lucide-react";
import { createHashRouter, Link, RouterProvider, useNavigate, useParams } from "react-router";
import "./App.css";
import type { ViewerApplication } from "./ViewerApplication";
import { AppStoreProvider, useAppStore, useApplyTheme } from "./appStore";
import { PlaybackWorkspace } from "../features/PlaybackWorkspace";
import { SheetLibrary } from "../features/SheetLibrary";

const ApplicationContext = createContext<ViewerApplication | null>(null);

export function App({ application }: { application: ViewerApplication }) {
  const router = useMemo(
    () =>
      createHashRouter([
        { path: "/", element: <LibraryShell /> },
        { path: "/viewer/:libraryScoreId", element: <ViewerShell /> },
        { path: "*", element: <ViewerShell notFound /> },
      ]),
    [],
  );
  return (
    <ApplicationContext.Provider value={application}>
      <AppStoreProvider>
        <ThemeApplicator>
          <RouterProvider router={router} />
        </ThemeApplicator>
      </AppStoreProvider>
    </ApplicationContext.Provider>
  );
}

function ThemeApplicator({ children }: { children: ReactNode }) {
  useApplyTheme();
  return children;
}

function ViewerShell({ notFound = false }: { notFound?: boolean }) {
  const application = useApplication();
  const snapshot = useSyncExternalStore(application.subscribe, application.getSnapshot);
  const navigate = useNavigate();
  const { libraryScoreId } = useParams();
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const invalidSession = Boolean(libraryScoreId && !application.hasSession(libraryScoreId));

  useEffect(() => {
    if (
      snapshot.currentLibraryScoreId &&
      snapshot.currentLibraryScoreId !== libraryScoreId &&
      !navigator.userAgent.includes("jsdom")
    ) {
      void navigate(`/viewer/${snapshot.currentLibraryScoreId}`);
    }
  }, [libraryScoreId, navigate, snapshot.currentLibraryScoreId]);

  useEffect(() => {
    if (application.hasLibrary() && libraryScoreId && !application.hasSession(libraryScoreId))
      void application.openLibraryScore(libraryScoreId).catch(() => undefined);
  }, [application, libraryScoreId, snapshot.currentLibraryScoreId]);

  return (
    <main className="app-shell">
      <header className="context-bar">
        <div className="context-main">
          <p className="app-kicker">Zupulse</p>
          <h1 id="summary" className="context-title" aria-live="polite">
            未打开乐谱
          </h1>
          <p className="context-subtitle">
            Studio-style practice workspace for score reading, playback, and loop training.
          </p>
        </div>
        <div className="context-actions">
          {application.hasLibrary() && (
            <Link className="icon-navigation" to="/" aria-label="返回曲谱库">
              <LibraryBig aria-hidden="true" size={19} strokeWidth={1.8} />
              <span className="icon-navigation-tooltip" role="tooltip">
                返回曲谱库
              </span>
            </Link>
          )}
          <div className="theme-toggle" role="group" aria-label="主题切换">
            <button
              id="theme-light"
              className="theme-toggle-button"
              type="button"
              aria-pressed={theme === "light"}
              onClick={() => flushSync(() => setTheme("light"))}
            >
              Light
            </button>
            <button
              id="theme-dark"
              className="theme-toggle-button"
              type="button"
              aria-pressed={theme === "dark"}
              onClick={() => flushSync(() => setTheme("dark"))}
            >
              Dark
            </button>
          </div>
          <p id="status" className="status-chip" role="status">
            {notFound ? "页面不存在" : invalidSession ? "会话已结束，请重新打开乐谱" : "等待选择文件"}
          </p>
          <button
            id="open-score"
            className="primary-button"
            type="button"
            onClick={() => application.requestOpenScore()}
          >
            {application.hasLibrary() ? "导入曲谱" : "打开乐谱"}
          </button>
        </div>
      </header>
      <PlaybackWorkspace session={application.getCurrentSession()}>
        <section className="score-stage" aria-label="乐谱工作区">
          <div className="score-stage-frame">
            <section id="alpha-tab" className="score-viewer" aria-label="乐谱预览">
              <div className="score-empty-state">
                <p className="empty-title">打开一份乐谱开始练习</p>
                <p className="empty-copy">支持 Guitar Pro、.musicxml 与 .mxl，本地读取，不上传文件。</p>
              </div>
            </section>
          </div>
        </section>
      </PlaybackWorkspace>
    </main>
  );
}

function LibraryShell() {
  const application = useApplication();
  const snapshot = useSyncExternalStore(application.subscribe, application.getSnapshot);
  const navigate = useNavigate();
  useEffect(() => {
    const refresh = () => void application.refreshLibrary();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [application]);
  if (!application.hasLibrary()) return <ViewerShell />;
  const library = snapshot.library ?? { scores: [], loading: true };
  return (
    <SheetLibrary
      application={application}
      {...library}
      onImport={async (multiple) => {
        const previousId = application.getSnapshot().currentLibraryScoreId;
        await application.importScores(multiple);
        const importedId = application.getSnapshot().currentLibraryScoreId;
        if (importedId && importedId !== previousId) void navigate(`/viewer/${importedId}`);
      }}
      onOpen={(id) => void navigate(`/viewer/${id}`)}
    />
  );
}

function useApplication(): ViewerApplication {
  const application = useContext(ApplicationContext);
  if (!application) throw new Error("ViewerApplication is unavailable");
  return application;
}
