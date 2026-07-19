import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import styles from "./studio-split-workspace.module.css";

const MIN_SPLIT = 40;
const MAX_SPLIT = 75;
const DEFAULT_SPLIT = 60;

function clampSplit(value: number): number {
  return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, value));
}

export function StudioSplitWorkspace({
  split,
  onSplitChange,
  score,
  analysis,
  scoreClassName,
  analysisClassName,
}: {
  split: number;
  onSplitChange(value: number): void;
  score: ReactNode;
  analysis: ReactNode;
  scoreClassName?: string;
  analysisClassName?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const previousUserSelect = useRef("");
  const dragging = useRef(false);
  const endDragging = () => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.userSelect = previousUserSelect.current;
  };
  useEffect(() => endDragging, []);

  return (
    <div
      ref={rootRef}
      className={styles.workspace}
      style={{ "--studio-left": `${clampSplit(split)}%` } as CSSProperties}
    >
      <div className={[styles.pane, scoreClassName].filter(Boolean).join(" ")}>{score}</div>
      <div
        className={styles.splitter}
        role="separator"
        aria-label="调整乐谱与分析面板宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_SPLIT}
        aria-valuemax={MAX_SPLIT}
        aria-valuenow={clampSplit(split)}
        tabIndex={0}
        onDoubleClick={() => onSplitChange(DEFAULT_SPLIT)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") onSplitChange(clampSplit(split - 5));
          else if (event.key === "ArrowRight") onSplitChange(clampSplit(split + 5));
          else if (event.key === "Home") onSplitChange(MIN_SPLIT);
          else if (event.key === "End") onSplitChange(MAX_SPLIT);
          else return;
          event.preventDefault();
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          dragging.current = true;
          previousUserSelect.current = document.body.style.userSelect;
          document.body.style.userSelect = "none";
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragging.current || !rootRef.current) return;
          const bounds = rootRef.current.getBoundingClientRect();
          if (bounds.width <= 0 || !Number.isFinite(event.clientX)) return;
          onSplitChange(clampSplit(Math.round(((event.clientX - bounds.left) / bounds.width) * 100)));
        }}
        onPointerUp={endDragging}
        onPointerCancel={endDragging}
      />
      <div className={[styles.pane, analysisClassName].filter(Boolean).join(" ")}>{analysis}</div>
    </div>
  );
}
