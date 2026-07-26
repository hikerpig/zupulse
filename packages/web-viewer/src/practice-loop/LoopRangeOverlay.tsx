import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type { ViewerSessionHandle } from "../host";
import {
  moveLoopBoundaryByBeat,
  positionFromLoopPoint,
  projectLoopRange,
  type LoopBoundaryPoint,
  type LoopRangeSegment,
  type ScoreMeasureBounds,
} from "./loop-range-geometry";
import styles from "./LoopRangeOverlay.module.css";

type Playback = NonNullable<ViewerSessionHandle["playback"]>;
type LoopEditor = NonNullable<ViewerSessionHandle["loopEditor"]>;
type Boundary = "start" | "end";

export function LoopRangeOverlay({
  playback,
  loopEditor,
}: {
  playback: Playback | undefined;
  loopEditor: LoopEditor | undefined;
}) {
  const { t } = useTranslation("viewer");
  const overlayRef = useRef<HTMLDivElement>(null);
  const stopDraggingRef = useRef<() => void>(() => undefined);
  const [measures, setMeasures] = useState<readonly ScoreMeasureBounds[]>(() => loopEditor?.getMeasureBounds() ?? []);
  const state = useSyncExternalStore(
    (listener) => playback?.subscribe(() => listener()) ?? (() => undefined),
    () => playback?.getState() ?? null,
    () => playback?.getState() ?? null,
  );

  useEffect(() => {
    setMeasures(loopEditor?.getMeasureBounds() ?? []);
    return loopEditor?.subscribe(() => setMeasures(loopEditor.getMeasureBounds()));
  }, [loopEditor]);
  useEffect(() => () => stopDraggingRef.current(), []);

  if (
    !playback ||
    !state ||
    !state.looping ||
    (!state.loopDraft.start && !state.loopDraft.end) ||
    measures.length === 0
  )
    return null;
  const projection =
    state.loopDraft.start && state.loopDraft.end
      ? projectLoopRange(state.loopDraft.start, state.loopDraft.end, measures, playback.timeline)
      : undefined;

  const dispatchBoundary = (boundary: Boundary, position: NonNullable<typeof state.loopDraft.start>) =>
    void playback.dispatch({ type: "set-loop-boundary", boundary, position });
  const commitBoundary = (boundary: Boundary, position: NonNullable<typeof state.loopDraft.start>) => {
    dispatchBoundary(boundary, position);
    void playback.dispatch({ type: "commit-loop-draft" });
  };
  const updateBoundaryFromPoint = (boundary: Boundary, clientX: number, clientY: number) => {
    const bounds = overlayRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const position = positionFromLoopPoint(clientX - bounds.left, clientY - bounds.top, measures, playback.timeline);
    if (position) dispatchBoundary(boundary, position);
  };
  const startDragging = (boundary: Boundary, event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    stopDraggingRef.current();
    updateBoundaryFromPoint(boundary, event.clientX, event.clientY);
    const ownerWindow = event.currentTarget.ownerDocument.defaultView;
    if (!ownerWindow) return;
    const move = (moveEvent: globalThis.PointerEvent) => {
      moveEvent.preventDefault();
      updateBoundaryFromPoint(boundary, moveEvent.clientX, moveEvent.clientY);
    };
    const cleanup = () => {
      ownerWindow.removeEventListener("pointermove", move);
      ownerWindow.removeEventListener("pointerup", commit);
      ownerWindow.removeEventListener("pointercancel", cleanup);
      stopDraggingRef.current = () => undefined;
    };
    const commit = () => {
      cleanup();
      void playback.dispatch({ type: "commit-loop-draft" });
    };
    ownerWindow.addEventListener("pointermove", move, { passive: false });
    ownerWindow.addEventListener("pointerup", commit);
    ownerWindow.addEventListener("pointercancel", cleanup);
    stopDraggingRef.current = cleanup;
  };

  return (
    <div ref={overlayRef} className={styles.overlay} aria-label={t("playback.scoreLoopRange")}>
      {projection?.segments.map((segment) => (
        <LoopSegment key={segment.systemIndex} segment={segment} />
      ))}
      {state.loopDraft.start ? (
        <LoopHandle
          boundary="start"
          label="A"
          accessibleLabel={t("playback.loopPointA")}
          point={projection?.start ?? boundaryPoint(state.loopDraft.start.measureIndex, measures)}
          value={state.loopDraft.start.tick}
          max={playback.timeline.durationTicks}
          onDragStart={startDragging}
          onCommit={commitBoundary}
          playback={playback}
          position={state.loopDraft.start}
        />
      ) : null}
      {state.loopDraft.end ? (
        <LoopHandle
          boundary="end"
          label="B"
          accessibleLabel={t("playback.loopPointB")}
          point={projection?.end ?? boundaryPoint(state.loopDraft.end.measureIndex, measures, true)}
          value={state.loopDraft.end.tick}
          max={playback.timeline.durationTicks}
          onDragStart={startDragging}
          onCommit={commitBoundary}
          playback={playback}
          position={state.loopDraft.end}
        />
      ) : null}
    </div>
  );
}

function LoopSegment({ segment }: { segment: LoopRangeSegment }) {
  return <span className={styles.segment} data-loop-segment style={geometryStyle(segment)} aria-hidden="true" />;
}

function LoopHandle({
  boundary,
  label,
  accessibleLabel,
  point,
  value,
  max,
  onDragStart,
  onCommit,
  playback,
  position,
}: {
  boundary: Boundary;
  label: string;
  accessibleLabel: string;
  point: LoopBoundaryPoint | undefined;
  value: number;
  max: number;
  onDragStart(boundary: Boundary, event: PointerEvent<HTMLButtonElement>): void;
  onCommit(boundary: Boundary, position: Parameters<typeof moveLoopBoundaryByBeat>[0]): void;
  playback: Playback;
  position: Parameters<typeof moveLoopBoundaryByBeat>[0];
}) {
  if (!point) return null;
  const moveByKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      onCommit(
        boundary,
        moveLoopBoundaryByBeat(
          { ...position, tick: event.key === "Home" ? 1 : playback.timeline.durationTicks - 1 },
          event.key === "Home" ? -1 : 1,
          playback.timeline,
        ),
      );
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 1;
    onCommit(boundary, moveLoopBoundaryByBeat(position, direction, playback.timeline));
  };

  return (
    <button
      className={styles.handle}
      type="button"
      role="slider"
      aria-label={accessibleLabel}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      style={geometryStyle(point)}
      onKeyDown={moveByKeyboard}
      onPointerDown={(event) => onDragStart(boundary, event)}
    >
      <span className={styles.handleLabel} aria-hidden="true">
        {label}
      </span>
      <span className={styles.handleLine} aria-hidden="true" />
    </button>
  );
}

function boundaryPoint(
  measureIndex: number,
  measures: readonly ScoreMeasureBounds[],
  atEnd = false,
): LoopBoundaryPoint | undefined {
  const measure = measures.find((item) => item.measureIndex === measureIndex);
  if (!measure) return undefined;
  return {
    x: measure.x + (atEnd ? measure.width : 0),
    y: measure.systemY,
    height: measure.systemHeight,
    systemIndex: measure.systemIndex,
  };
}

function geometryStyle(geometry: { x: number; y: number; height: number; width?: number }): CSSProperties {
  return {
    "--loop-x": `${geometry.x}px`,
    "--loop-y": `${geometry.y}px`,
    "--loop-height": `${geometry.height}px`,
    ...(geometry.width === undefined ? {} : { "--loop-width": `${geometry.width}px` }),
  } as CSSProperties;
}
