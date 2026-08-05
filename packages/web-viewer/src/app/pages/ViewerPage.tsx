import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Music } from "lucide-react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { ViewerApplication } from "../ViewerApplication";
import type { ViewerProductCapabilities } from "../App";
import { PlaybackWorkspace } from "../../features/PlaybackWorkspace";
import { ScoreViewer } from "../../components/ScoreViewer";
import { createViewerSessionSlices } from "../../viewer-session/viewer-session-slices";
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
  const session = application.getCurrentSession();
  const sessionSlices = useMemo(() => (session ? createViewerSessionSlices(session) : undefined), [session]);
  const currentScore = snapshot.library?.scores.find((score) => score.id === libraryScoreId);
  const summaryRef = useRef<HTMLHeadingElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const scoreHostRef = useRef<HTMLElement>(null);
  const scoreScrollRef = useRef<HTMLElement>(null);
  const viewerState = snapshot.viewer?.libraryScoreId === libraryScoreId ? snapshot.viewer : undefined;
  const openingSession = Boolean(libraryScoreId && !notFound && viewerState?.status !== "ready" && !viewerState?.error);
  const viewerError = viewerState?.error;
  const statusMessage = notFound ? t("page.notFound") : undefined;
  const scoreViewerProps = {
    ...(sessionSlices?.playback ? { playback: sessionSlices.playback } : {}),
    ...(sessionSlices?.loopEditor ? { loopEditor: sessionSlices.loopEditor } : {}),
    scoreHostRef,
    scoreScrollRef,
  };

  useLayoutEffect(() => {
    const alphaTabHost = scoreHostRef.current;
    const scoreScrollElement = scoreScrollRef.current;
    const status = statusRef.current;
    const summary = summaryRef.current;
    if (!alphaTabHost || !scoreScrollElement || !status || !summary) return;
    application.bindViewerDom({ alphaTabHost, scoreScrollElement, status, summary });
    return () => application.bindViewerDom(undefined);
  }, [application, libraryScoreId]);

  useEffect(() => {
    if (libraryScoreId && !application.hasSession(libraryScoreId))
      void application.openLibraryScore(libraryScoreId).catch(() => undefined);
  }, [application, libraryScoreId, snapshot.currentLibraryScoreId]);

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
          <h1 ref={summaryRef} className={styles.contextTitle} aria-live="polite">
            {currentScore?.title ?? t("page.title")}
          </h1>
        </div>
        <div className={styles.contextActions}>
          {capabilities.harmonyAnalysis &&
          libraryScoreId &&
          application.hasSession(libraryScoreId) &&
          application.getStudioApplication().hasHarmonyAnalysisStorage() ? (
            <Link className={styles.harmonyAction} to={`/studio/${libraryScoreId}`}>
              <Music aria-hidden="true" size={16} strokeWidth={2} />
              <span>{t("page.harmony")}</span>
            </Link>
          ) : null}
          <p ref={statusRef} className={statusMessage ? styles.statusChip : "sr-only"} role="status">
            {statusMessage}
          </p>
        </div>
      </div>
      <PlaybackWorkspace session={session}>
        <ScoreViewer {...scoreViewerProps} />
      </PlaybackWorkspace>
      {openingSession ? (
        <div className={styles.viewerLoading} role="status" aria-label={t("page.loading")}>
          {t("page.loading")}
        </div>
      ) : null}
      {viewerError ? (
        <div className={styles.viewerLoading} role="alert">
          <p>
            {viewerError.code === "viewer-library-failed"
              ? t("page.libraryFailed")
              : viewerError.code === "viewer-render-failed"
                ? t("page.renderFailed")
                : t("page.sessionFailed")}
          </p>
          <button type="button" onClick={() => libraryScoreId && void application.openLibraryScore(libraryScoreId)}>
            {t("page.retry")}
          </button>
        </div>
      ) : null}
    </main>
  );
}
