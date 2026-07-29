import { useCallback, useEffect, useRef, useState, type Ref, type TouchEvent } from "react";
import { Popover } from "@base-ui/react/popover";
import { Maximize2, Minimize2, Minus, Plus, Shrink, StretchHorizontal, ZoomIn } from "lucide-react";
import {
  clampScoreZoom,
  commitScoreZoom,
  MAX_SCORE_ZOOM,
  MIN_SCORE_ZOOM,
  persistScoreWidthMode,
  useAppStore,
} from "../app/appStore";
import { SCORE_LAYOUT_COMMIT_EVENT, SCORE_ZOOM_COMMIT_EVENT } from "../scoreZoom";
import { useTranslation } from "react-i18next";
import type { ViewerSessionHandle } from "../host";
import { LoopRangeOverlay } from "../practice-loop/LoopRangeOverlay";
import { PianoHandEmphasisOverlay } from "../practice-hand/PianoHandEmphasisOverlay";
import styles from "./ScoreViewer.module.css";

const SCORE_ZOOM_STEP = 0.1;

export function ScoreViewer({
  compact = false,
  expandable = false,
  playback,
  loopEditor,
  domId,
  scoreHostRef,
  scoreScrollRef,
}: {
  compact?: boolean;
  expandable?: boolean;
  playback?: ViewerSessionHandle["playback"];
  loopEditor?: ViewerSessionHandle["loopEditor"];
  domId?: string;
  scoreHostRef?: Ref<HTMLElement>;
  scoreScrollRef?: Ref<HTMLElement>;
}) {
  const { t } = useTranslation("viewer");
  const [expanded, setExpanded] = useState(false);
  const scoreZoom = useAppStore((state) => state.scoreZoom);
  const setScoreZoom = useAppStore((state) => state.setScoreZoom);
  const scoreWidthMode = useAppStore((state) => state.scoreWidthMode);
  const setScoreWidthMode = useAppStore((state) => state.setScoreWidthMode);
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

  const commitZoom = useCallback(
    (zoom: number) => {
      const committed = commitScoreZoom(zoom);
      setScoreZoom(committed);
      viewerRef.current?.setAttribute("data-score-zoom", String(committed));
      document.dispatchEvent(new CustomEvent(SCORE_ZOOM_COMMIT_EVENT, { detail: { zoom: committed } }));
    },
    [setScoreZoom],
  );

  useEffect(() => {
    const applyShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      const nextZoom =
        key === "+" || key === "="
          ? scoreZoom + SCORE_ZOOM_STEP
          : key === "-" || key === "_"
            ? scoreZoom - SCORE_ZOOM_STEP
            : key === "0"
              ? 1
              : undefined;
      if (nextZoom === undefined) return;
      event.preventDefault();
      commitZoom(nextZoom);
    };
    window.addEventListener("keydown", applyShortcut);
    return () => window.removeEventListener("keydown", applyShortcut);
  }, [commitZoom, scoreZoom]);

  const toggleScoreWidth = () => {
    const nextMode = scoreWidthMode === "full" ? "comfortable" : "full";
    document.dispatchEvent(new CustomEvent(SCORE_LAYOUT_COMMIT_EVENT, { detail: { reason: "width" } }));
    setScoreWidthMode(nextMode);
    persistScoreWidthMode(nextMode);
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
      ref={scoreScrollRef}
      className={`scrollable ${styles.stage} ${compact ? styles.compact : ""} ${expanded ? styles.expanded : ""}`}
      aria-label={t("score.workspace")}
      data-score-width={scoreWidthMode}
      onTouchStart={startPinch}
      onTouchMove={previewPinch}
      onTouchEnd={finishPinch}
      onTouchCancel={finishPinch}
    >
      <output className="sr-only" role="status" aria-live="polite">
        {t("score.zoomLevel", { percent: Math.round(scoreZoom * 100) })}
      </output>
      {!compact ? (
        <>
          <div className={styles.viewControls}>
            <button
              className={styles.widthModeButton}
              type="button"
              aria-label={t(scoreWidthMode === "full" ? "score.useComfortableWidth" : "score.useFullWidth")}
              aria-pressed={scoreWidthMode === "full"}
              title={t(scoreWidthMode === "full" ? "score.useComfortableWidth" : "score.useFullWidth")}
              onClick={toggleScoreWidth}
            >
              {scoreWidthMode === "full" ? <Shrink aria-hidden="true" /> : <StretchHorizontal aria-hidden="true" />}
            </button>
            <div className={styles.zoomControls} aria-label={t("score.zoomControls")}>
              <button
                type="button"
                aria-label={t("score.zoomOut")}
                disabled={scoreZoom <= MIN_SCORE_ZOOM}
                onClick={() => commitZoom(scoreZoom - SCORE_ZOOM_STEP)}
              >
                <Minus aria-hidden="true" />
              </button>
              <button
                className={styles.zoomReset}
                type="button"
                aria-label={t("score.resetZoom")}
                title={t("score.resetZoom")}
                onClick={() => commitZoom(1)}
              >
                {Math.round(scoreZoom * 100)}%
              </button>
              <button
                type="button"
                aria-label={t("score.zoomIn")}
                disabled={scoreZoom >= MAX_SCORE_ZOOM}
                onClick={() => commitZoom(scoreZoom + SCORE_ZOOM_STEP)}
              >
                <Plus aria-hidden="true" />
              </button>
            </div>
          </div>
          <Popover.Root>
            <Popover.Trigger className={styles.compactZoomTrigger} aria-label={t("score.adjustZoom")}>
              <ZoomIn aria-hidden="true" />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner side="bottom" align="end" sideOffset={6} className={styles.compactZoomPositioner}>
                <Popover.Popup
                  className={styles.compactZoomPopup}
                  aria-label={t("score.adjustZoom")}
                  data-shortcuts-disabled
                >
                  <Popover.Title className="sr-only">{t("score.adjustZoom")}</Popover.Title>
                  <button
                    type="button"
                    aria-label={t("score.zoomOut")}
                    disabled={scoreZoom <= MIN_SCORE_ZOOM}
                    onClick={() => commitZoom(scoreZoom - SCORE_ZOOM_STEP)}
                  >
                    <Minus aria-hidden="true" />
                  </button>
                  <button
                    className={styles.zoomReset}
                    type="button"
                    aria-label={t("score.resetZoom")}
                    title={t("score.resetZoom")}
                    onClick={() => commitZoom(1)}
                  >
                    {Math.round(scoreZoom * 100)}%
                  </button>
                  <button
                    type="button"
                    aria-label={t("score.zoomIn")}
                    disabled={scoreZoom >= MAX_SCORE_ZOOM}
                    onClick={() => commitZoom(scoreZoom + SCORE_ZOOM_STEP)}
                  >
                    <Plus aria-hidden="true" />
                  </button>
                  <Popover.Arrow className={styles.compactZoomArrow} />
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        </>
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
        <div className={styles.scoreCanvas}>
          <section
            ref={(element) => {
              viewerRef.current = element;
              assignRef(scoreHostRef, element);
            }}
            id={domId}
            className={`${styles.viewer} score-viewer`}
            aria-label={t("score.preview")}
            tabIndex={-1}
            data-score-zoom={scoreZoom}
          >
            <div className="score-empty-state">
              <p className="empty-title">{t("score.emptyTitle")}</p>
              <p className="empty-copy">{t("score.emptyCopy")}</p>
            </div>
          </section>
          <LoopRangeOverlay playback={playback} loopEditor={loopEditor} />
          <PianoHandEmphasisOverlay playback={playback} loopEditor={loopEditor} />
        </div>
      </div>
    </section>
  );
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

function touchDistance(event: TouchEvent<HTMLElement>): number {
  const first = event.touches[0];
  const second = event.touches[1];
  if (!first || !second) return 0;
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches("input, textarea, select, [data-shortcuts-disabled] *"))
  );
}
