import { useEffect, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { LibraryBig } from "lucide-react";
import { Link, useParams } from "react-router";
import type { ViewerApplication } from "../ViewerApplication";
import { useAppStore } from "../appStore";
import { PlaybackWorkspace } from "../../features/PlaybackWorkspace";
import styles from "./PageShell.module.css";

export function ViewerPage({ application, notFound = false }: { application: ViewerApplication; notFound?: boolean }) {
  const snapshot = useSyncExternalStore(application.subscribe, application.getSnapshot);
  const { libraryScoreId } = useParams();
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const invalidSession = Boolean(libraryScoreId && !application.hasSession(libraryScoreId));

  useEffect(() => {
    if (application.hasLibrary() && libraryScoreId && !application.hasSession(libraryScoreId))
      void application.openLibraryScore(libraryScoreId).catch(() => undefined);
  }, [application, libraryScoreId, snapshot.currentLibraryScoreId]);

  return (
    <main className={styles.appShell}>
      <header className={styles.contextBar}>
        <div className={styles.contextMain}>
          <p className={styles.appKicker}>Zupulse</p>
          <h1 id="summary" className={styles.contextTitle} aria-live="polite">
            未打开乐谱
          </h1>
          <p className={styles.contextSubtitle}>
            Studio-style practice workspace for score reading, playback, and loop training.
          </p>
        </div>
        <div className={styles.contextActions}>
          {application.hasLibrary() && (
            <Link className={styles.iconNavigation} to="/" aria-label="返回曲谱库">
              <LibraryBig aria-hidden="true" size={19} strokeWidth={1.8} />
              <span className={styles.iconNavigationTooltip} role="tooltip">
                返回曲谱库
              </span>
            </Link>
          )}
          <div className={styles.themeToggle} role="group" aria-label="主题切换">
            <button
              id="theme-light"
              className={styles.themeToggleButton}
              type="button"
              aria-pressed={theme === "light"}
              onClick={() => flushSync(() => setTheme("light"))}
            >
              Light
            </button>
            <button
              id="theme-dark"
              className={styles.themeToggleButton}
              type="button"
              aria-pressed={theme === "dark"}
              onClick={() => flushSync(() => setTheme("dark"))}
            >
              Dark
            </button>
          </div>
          <p id="status" className={styles.statusChip} role="status">
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
        <section className={styles.scoreStage} aria-label="乐谱工作区">
          <div className={styles.scoreStageFrame}>
            <section id="alpha-tab" className={`${styles.scoreViewer} score-viewer`} aria-label="乐谱预览">
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
