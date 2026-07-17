import { useEffect, useSyncExternalStore } from "react";
import { Music } from "lucide-react";
import { Link, useParams } from "react-router";
import type { ViewerApplication } from "../ViewerApplication";
import { PlaybackWorkspace } from "../../features/PlaybackWorkspace";
import { ScoreViewer } from "../../components/ScoreViewer";
import styles from "./PageShell.module.css";

export function ViewerPage({ application, notFound = false }: { application: ViewerApplication; notFound?: boolean }) {
  const snapshot = useSyncExternalStore(application.subscribe, application.getSnapshot);
  const { libraryScoreId } = useParams();
  const invalidSession = Boolean(libraryScoreId && !application.hasSession(libraryScoreId));

  useEffect(() => {
    if (application.hasLibrary() && libraryScoreId && !application.hasSession(libraryScoreId))
      void application.openLibraryScore(libraryScoreId).catch(() => undefined);
  }, [application, libraryScoreId, snapshot.currentLibraryScoreId]);

  return (
    <main className={styles.appShell}>
      <div className={styles.contextBar}>
        <div className={styles.contextMain}>
          <p className={styles.appKicker}>Score Viewer</p>
          <h1 id="summary" className={styles.contextTitle} aria-live="polite">
            未打开乐谱
          </h1>
          <p className={styles.contextSubtitle}>
            Studio-style practice workspace for score reading, playback, and loop training.
          </p>
        </div>
        <div className={styles.contextActions}>
          {application.hasLibrary() && libraryScoreId && application.hasHarmonyAnalysisStorage() ? (
            <Link className={styles.harmonyAction} to={`/studio/${libraryScoreId}`}>
              <Music aria-hidden="true" size={16} strokeWidth={2} />
              <span>和弦分析</span>
              <span className={styles.harmonyActionArrow} aria-hidden="true">
                →
              </span>
            </Link>
          ) : null}
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
      </div>
      <PlaybackWorkspace session={application.getCurrentSession()}>
        <ScoreViewer />
      </PlaybackWorkspace>
    </main>
  );
}
