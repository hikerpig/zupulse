import { useEffect, useSyncExternalStore } from "react";
import { Music } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { ViewerApplication } from "../ViewerApplication";
import type { ViewerProductCapabilities } from "../App";
import { PlaybackWorkspace } from "../../features/PlaybackWorkspace";
import { ScoreViewer } from "../../components/ScoreViewer";
import styles from "./PageShell.module.css";

export function ViewerPage({
  application,
  capabilities = { harmonyAnalysis: true },
  notFound = false,
}: {
  application: ViewerApplication;
  capabilities?: ViewerProductCapabilities;
  notFound?: boolean;
}) {
  const { t } = useTranslation("viewer");
  const snapshot = useSyncExternalStore(application.subscribe, application.getSnapshot);
  const { libraryScoreId } = useParams();
  const navigate = useNavigate();
  const invalidSession = Boolean(libraryScoreId && !application.hasSession(libraryScoreId));
  const currentScore = snapshot.library?.scores.find((score) => score.id === libraryScoreId);
  const statusMessage = notFound ? t("page.notFound") : invalidSession ? t("page.sessionEnded") : undefined;

  useEffect(() => {
    if (application.hasLibrary() && libraryScoreId && !application.hasSession(libraryScoreId))
      void application.openLibraryScore(libraryScoreId).catch(() => navigate("/", { replace: true }));
  }, [application, libraryScoreId, navigate, snapshot.currentLibraryScoreId]);

  useEffect(() => {
    if (!libraryScoreId) return;
    return () => {
      void application.releaseLibraryScore(libraryScoreId).catch(() => undefined);
    };
  }, [application, libraryScoreId]);

  return (
    <main className={styles.appShell}>
      <div className={styles.contextBar}>
        <div className={styles.contextMain}>
          <h1 id="summary" className={styles.contextTitle} aria-live="polite">
            {currentScore?.title ?? t("page.title")}
          </h1>
        </div>
        <div className={styles.contextActions}>
          {capabilities.harmonyAnalysis &&
          application.hasLibrary() &&
          libraryScoreId &&
          application.hasSession(libraryScoreId) &&
          application.hasHarmonyAnalysisStorage() ? (
            <Link className={styles.harmonyAction} to={`/studio/${libraryScoreId}`}>
              <Music aria-hidden="true" size={16} strokeWidth={2} />
              <span>{t("page.harmony")}</span>
            </Link>
          ) : null}
          {statusMessage ? (
            <p id="status" className={styles.statusChip} role="status">
              {statusMessage}
            </p>
          ) : null}
          {!application.hasLibrary() ? (
            <button
              id="open-score"
              className="primary-button"
              type="button"
              onClick={() => application.requestOpenScore()}
            >
              {t("page.open")}
            </button>
          ) : null}
        </div>
      </div>
      <PlaybackWorkspace session={application.getCurrentSession()}>
        <ScoreViewer />
      </PlaybackWorkspace>
    </main>
  );
}
