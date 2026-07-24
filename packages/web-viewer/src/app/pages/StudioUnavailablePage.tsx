import { useEffect, useState } from "react";
import { CircleSlash2, LibraryBig, Music2 } from "lucide-react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { ViewerApplication } from "../ViewerApplication";
import styles from "./PageShell.module.css";

export function StudioUnavailablePage({ application }: { application: ViewerApplication }) {
  const { t } = useTranslation("studio");
  const { libraryScoreId } = useParams();
  const [scoreName, setScoreName] = useState<string>(() => t("unavailable.scoreFallback"));

  useEffect(() => {
    if (!libraryScoreId) return;
    let active = true;
    void application
      .getLibraryScore(libraryScoreId)
      .then((score) => {
        if (active && score) setScoreName(score.metadata.titleOverride ?? score.title);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [application, libraryScoreId]);

  return (
    <main className={styles.unavailableShell} aria-labelledby="studio-unavailable-title">
      <section className={styles.unavailableWorkspace}>
        <CircleSlash2 className={styles.unavailableIcon} aria-hidden="true" size={28} strokeWidth={1.8} />
        <div className={styles.unavailableContent}>
          <p className={styles.appKicker}>{t("unavailable.kicker")}</p>
          <h1 id="studio-unavailable-title" className={styles.unavailableTitle}>
            {t("unavailable.title")}
          </h1>
          <p className={styles.unavailableScore}>{scoreName}</p>
          <p className={styles.unavailableCopy}>{t("unavailable.copy")}</p>
        </div>
        <nav className={styles.unavailableActions} aria-label={t("unavailable.actions")}>
          {libraryScoreId ? (
            <Link className={styles.unavailablePrimaryAction} to={`/viewer/${libraryScoreId}`}>
              <Music2 aria-hidden="true" size={16} />
              {t("unavailable.viewer")}
            </Link>
          ) : null}
          <Link className={styles.unavailableSecondaryAction} to="/">
            <LibraryBig aria-hidden="true" size={16} />
            {t("unavailable.library")}
          </Link>
        </nav>
      </section>
    </main>
  );
}
