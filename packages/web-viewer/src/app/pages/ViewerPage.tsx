import { useEffect, useSyncExternalStore } from "react";
import { Music } from "lucide-react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { ViewerApplication } from "../ViewerApplication";
import { PlaybackWorkspace } from "../../features/PlaybackWorkspace";
import { ScoreViewer } from "../../components/ScoreViewer";
import styles from "./PageShell.module.css";

export function ViewerPage({ application, notFound = false }: { application: ViewerApplication; notFound?: boolean }) {
  const { t } = useTranslation("viewer");
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
          <p className={styles.appKicker}>{t("page.kicker")}</p>
          <h1 id="summary" className={styles.contextTitle} aria-live="polite">
            {t("page.title")}
          </h1>
          <p className={styles.contextSubtitle}>{t("page.subtitle")}</p>
        </div>
        <div className={styles.contextActions}>
          {application.hasLibrary() && libraryScoreId && application.hasHarmonyAnalysisStorage() ? (
            <Link className={styles.harmonyAction} to={`/studio/${libraryScoreId}`}>
              <Music aria-hidden="true" size={16} strokeWidth={2} />
              <span>{t("page.harmony")}</span>
              <span className={styles.harmonyActionArrow} aria-hidden="true">
                →
              </span>
            </Link>
          ) : null}
          <p id="status" className={styles.statusChip} role="status">
            {notFound ? t("page.notFound") : invalidSession ? t("page.sessionEnded") : t("page.waiting")}
          </p>
          <button
            id="open-score"
            className="primary-button"
            type="button"
            onClick={() => application.requestOpenScore()}
          >
            {application.hasLibrary() ? t("page.import") : t("page.open")}
          </button>
        </div>
      </div>
      <PlaybackWorkspace session={application.getCurrentSession()}>
        <ScoreViewer />
      </PlaybackWorkspace>
    </main>
  );
}
