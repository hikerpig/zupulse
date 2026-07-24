import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import styles from "./ScoreViewer.module.css";

export function ScoreViewer({ compact = false, expandable = false }: { compact?: boolean; expandable?: boolean }) {
  const { t } = useTranslation("viewer");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const collapse = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", collapse);
    return () => window.removeEventListener("keydown", collapse);
  }, [expanded]);

  return (
    <section
      className={`scrollable ${styles.stage} ${compact ? styles.compact : ""} ${expanded ? styles.expanded : ""}`}
      aria-label={t("score.workspace")}
    >
      {expandable ? (
        <div className={styles.previewBar}>
          <div>
            <strong>{t("score.preview")}</strong>
            <span>{t("score.previewHint")}</span>
          </div>
          <button
            className={styles.expandButton}
            type="button"
            aria-label={expanded ? t("score.collapse") : t("score.expand")}
            aria-expanded={expanded}
            aria-keyshortcuts="Escape"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          </button>
        </div>
      ) : null}
      <div className={styles.frame}>
        <section id="alpha-tab" className={`${styles.viewer} score-viewer`} aria-label={t("score.preview")}>
          <div className="score-empty-state">
            <p className="empty-title">{t("score.emptyTitle")}</p>
            <p className="empty-copy">{t("score.emptyCopy")}</p>
          </div>
        </section>
      </div>
    </section>
  );
}
