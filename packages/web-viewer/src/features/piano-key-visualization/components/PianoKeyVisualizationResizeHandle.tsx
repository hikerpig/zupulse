import { useEffect, useRef, type RefObject } from "react";
import {
  DEFAULT_PIANO_KEY_HEIGHT,
  MAX_PIANO_KEY_HEIGHT,
  MIN_PIANO_KEY_HEIGHT,
  PIANO_KEY_HEIGHT_STEP,
  clampPianoKeyHeight,
} from "../model/piano-key-height";
import styles from "./PianoKeyVisualization.module.css";

export function PianoKeyVisualizationResizeHandle({
  containerRef,
  height,
  label,
  onHeightChange,
}: {
  containerRef: RefObject<HTMLElement | null>;
  height: number;
  label: string;
  onHeightChange(height: number): void;
}) {
  const drag = useRef<{ startY: number; startHeight: number } | undefined>(undefined);
  const previousUserSelect = useRef("");
  const workspaceHeight = () => containerRef.current?.getBoundingClientRect().height;
  const clamp = (value: number) => clampPianoKeyHeight(value, workspaceHeight());
  const endDragging = () => {
    if (!drag.current) return;
    drag.current = undefined;
    document.body.style.userSelect = previousUserSelect.current;
  };
  useEffect(() => endDragging, []);

  return (
    <div
      className={styles.resizeHandle}
      role="separator"
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={MIN_PIANO_KEY_HEIGHT}
      aria-valuemax={clamp(MAX_PIANO_KEY_HEIGHT)}
      aria-valuenow={clamp(height)}
      tabIndex={0}
      onDoubleClick={() => onHeightChange(clamp(DEFAULT_PIANO_KEY_HEIGHT))}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") onHeightChange(clamp(height + PIANO_KEY_HEIGHT_STEP));
        else if (event.key === "ArrowDown") onHeightChange(clamp(height - PIANO_KEY_HEIGHT_STEP));
        else if (event.key === "Home") onHeightChange(MIN_PIANO_KEY_HEIGHT);
        else if (event.key === "End") onHeightChange(clamp(MAX_PIANO_KEY_HEIGHT));
        else return;
        event.preventDefault();
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        drag.current = { startY: event.clientY, startHeight: height };
        previousUserSelect.current = document.body.style.userSelect;
        document.body.style.userSelect = "none";
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current || !Number.isFinite(event.clientY)) return;
        onHeightChange(clamp(drag.current.startHeight + drag.current.startY - event.clientY));
      }}
      onPointerUp={endDragging}
      onPointerCancel={endDragging}
    />
  );
}
