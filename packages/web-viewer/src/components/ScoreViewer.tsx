import { useEffect, useRef, useState, type TouchEvent } from "react";
import { Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import { clampScoreZoom, MAX_SCORE_ZOOM, MIN_SCORE_ZOOM, persistScoreZoom, useAppStore } from "../app/appStore";
import { SCORE_ZOOM_COMMIT_EVENT } from "../scoreZoom";
import { useTranslation } from "react-i18next";
import styles from "./ScoreViewer.module.css";

const SCORE_ZOOM_STEP = 0.1;

export function ScoreViewer({ compact = false, expandable = false }: { compact?: boolean; expandable?: boolean }) {
  const { t } = useTranslation("viewer");
  const [expanded, setExpanded] = useState(false);
  const scoreZoom = useAppStore((state) => state.scoreZoom);
  const setScoreZoom = useAppStore((state) => state.setScoreZoom);
  const viewerRef = useRef<HTMLElement>(null);
  const pinchRef = useRef<{ distance: number; zoom: number; preview: number } | undefined>(undefined);

  useEffect(() => {
    if (!expanded) return;
    const collapse = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", collapse);
    return () => window.removeEventListener("keydown", collapse);
  }, [expanded]);

  const commitZoom = (zoom: number) => {
    const committed = clampScoreZoom(zoom);
    setScoreZoom(committed);
    persistScoreZoom(committed);
    viewerRef.current?.setAttribute("data-score-zoom", String(committed));
    document.dispatchEvent(new CustomEvent(SCORE_ZOOM_COMMIT_EVENT, { detail: { zoom: committed } }));
  };
  const startPinch = (event: TouchEvent<HTMLElement>) => {
    if (event.touches.length !== 2) return;
    pinchRef.current = {
      distance: touchDistance(event),
      zoom: scoreZoom,
      preview: scoreZoom,
    };
  };
  const previewPinch = (event: TouchEvent<HTMLElement>) => {
    const pinch = pinchRef.current;
    if (!pinch || event.touches.length !== 2 || pinch.distance === 0) return;
    event.preventDefault();
    pinch.preview = clampScoreZoom(pinch.zoom * (touchDistance(event) / pinch.distance));
    if (viewerRef.current) viewerRef.current.style.transform = `scale(${pinch.preview / pinch.zoom})`;
  };
  const finishPinch = () => {
    const pinch = pinchRef.current;
    if (!pinch) return;
    pinchRef.current = undefined;
    if (viewerRef.current) viewerRef.current.style.transform = "";
    commitZoom(pinch.preview);
  };

  return (
    <section
      className={`scrollable ${styles.stage} ${compact ? styles.compact : ""} ${expanded ? styles.expanded : ""}`}
      aria-label={t("score.workspace")}
      onTouchStart={startPinch}
      onTouchMove={previewPinch}
      onTouchEnd={finishPinch}
      onTouchCancel={finishPinch}
    >
      {!compact ? (
        <div className={styles.zoomControls} aria-label={t("score.zoomControls")}>
          <button
            type="button"
            aria-label={t("score.zoomOut")}
            disabled={scoreZoom <= MIN_SCORE_ZOOM}
            onClick={() => commitZoom(scoreZoom - SCORE_ZOOM_STEP)}
          >
            <Minus aria-hidden="true" />
          </button>
          <output aria-label={t("score.zoomLevel", { percent: Math.round(scoreZoom * 100) })} aria-live="polite">
            {Math.round(scoreZoom * 100)}%
          </output>
          <button
            type="button"
            aria-label={t("score.zoomIn")}
            disabled={scoreZoom >= MAX_SCORE_ZOOM}
            onClick={() => commitZoom(scoreZoom + SCORE_ZOOM_STEP)}
          >
            <Plus aria-hidden="true" />
          </button>
        </div>
      ) : null}
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
        <section
          ref={viewerRef}
          id="alpha-tab"
          className={`${styles.viewer} score-viewer`}
          aria-label={t("score.preview")}
          data-score-zoom={scoreZoom}
        >
          <div className="score-empty-state">
            <p className="empty-title">{t("score.emptyTitle")}</p>
            <p className="empty-copy">{t("score.emptyCopy")}</p>
          </div>
        </section>
      </div>
    </section>
  );
}

function touchDistance(event: TouchEvent<HTMLElement>): number {
  const first = event.touches[0];
  const second = event.touches[1];
  if (!first || !second) return 0;
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}
