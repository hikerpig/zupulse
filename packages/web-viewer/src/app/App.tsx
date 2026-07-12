import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { createHashRouter, RouterProvider, useNavigate, useParams } from 'react-router';
import type { ViewerApplication } from './ViewerApplication';
import { AppStoreProvider, useAppStore, useApplyTheme } from './appStore';
import { PlaybackWorkspace } from '../features/PlaybackWorkspace';

const ApplicationContext = createContext<ViewerApplication | null>(null);

export function App({ application }: { application: ViewerApplication }) {
  const router = useMemo(
    () =>
      createHashRouter([
        { path: '/', element: <ViewerShell /> },
        { path: '/viewer/:sessionId', element: <ViewerShell /> },
        { path: '*', element: <ViewerShell notFound /> },
      ]),
    [],
  );
  return (
    <ApplicationContext.Provider value={application}>
      <AppStoreProvider>
        <RouterProvider router={router} />
      </AppStoreProvider>
    </ApplicationContext.Provider>
  );
}

function ViewerShell({ notFound = false }: { notFound?: boolean }) {
  const application = useApplication();
  const snapshot = useSyncExternalStore(application.subscribe, application.getSnapshot);
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const theme = useApplyTheme();
  const setTheme = useAppStore((state) => state.setTheme);
  const invalidSession = Boolean(sessionId && !application.hasSession(sessionId));

  useEffect(() => {
    if (snapshot.currentSessionId && !navigator.userAgent.includes('jsdom')) {
      void navigate(`/viewer/${snapshot.currentSessionId}`);
    }
  }, [navigate, snapshot.currentSessionId]);

  return (
    <main className="app-shell">
      <header className="context-bar">
        <div className="context-main">
          <p className="app-kicker">Tab Viewer</p>
          <h1 id="summary" className="context-title" aria-live="polite">
            未打开乐谱
          </h1>
          <p className="context-subtitle">
            Studio-style practice workspace for score reading, playback, and loop training.
          </p>
        </div>
        <div className="context-actions">
          <div className="theme-toggle" role="group" aria-label="主题切换">
            <button
              id="theme-light"
              className="theme-toggle-button"
              type="button"
              aria-pressed={theme === 'light'}
              onClick={() => flushSync(() => setTheme('light'))}
            >
              Light
            </button>
            <button
              id="theme-dark"
              className="theme-toggle-button"
              type="button"
              aria-pressed={theme === 'dark'}
              onClick={() => flushSync(() => setTheme('dark'))}
            >
              Dark
            </button>
          </div>
          <p id="status" className="status-chip" role="status">
            {notFound
              ? '页面不存在'
              : invalidSession
                ? '会话已结束，请重新打开乐谱'
                : '等待选择文件'}
          </p>
          <button
            id="open-score"
            className="primary-button"
            type="button"
            onClick={() => application.requestOpenScore()}
          >
            打开乐谱
          </button>
        </div>
      </header>
      <PlaybackWorkspace session={application.getCurrentSession()}>
        <section className="score-stage" aria-label="乐谱工作区">
          <div className="score-stage-frame">
            <section id="alpha-tab" className="score-viewer" aria-label="乐谱预览">
              <div className="score-empty-state">
                <p className="empty-title">打开一份乐谱开始练习</p>
                <p className="empty-copy">
                  支持 Guitar Pro、.musicxml 与 .mxl，本地读取，不上传文件。
                </p>
              </div>
            </section>
          </div>
        </section>
      </PlaybackWorkspace>
    </main>
  );
}

function useApplication(): ViewerApplication {
  const application = useContext(ApplicationContext);
  if (!application) throw new Error('ViewerApplication is unavailable');
  return application;
}
