import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { ViewerSessionHandle } from "../host";
import type { ScoreStaffBounds } from "../score-navigation/alpha-tab-navigation";
import styles from "./PianoHandEmphasisOverlay.module.css";

type Playback = NonNullable<ViewerSessionHandle["playback"]>;
type LoopEditor = NonNullable<ViewerSessionHandle["loopEditor"]>;

export function PianoHandEmphasisOverlay({
  playback,
  loopEditor,
}: {
  playback: Playback | undefined;
  loopEditor: LoopEditor | undefined;
}) {
  const [staffBounds, setStaffBounds] = useState<readonly ScoreStaffBounds[]>(
    () => loopEditor?.getStaffBounds?.() ?? [],
  );
  const state = useSyncExternalStore(
    (listener) => playback?.subscribe(() => listener()) ?? (() => undefined),
    () => playback?.getState() ?? null,
    () => playback?.getState() ?? null,
  );
  useEffect(() => {
    setStaffBounds(loopEditor?.getStaffBounds?.() ?? []);
    return loopEditor?.subscribe(() => setStaffBounds(loopEditor.getStaffBounds?.() ?? []));
  }, [loopEditor]);

  const practice = state?.pianoPractice;
  if (!practice?.mapping || practice.availability !== "available" || practice.mode === "both-hands") return null;
  const targetStaffId = practice.mode === "right-hand" ? practice.mapping.rightStaffId : practice.mapping.leftStaffId;
  return (
    <div className={styles.overlay} aria-hidden="true">
      {staffBounds
        .filter((bounds) => bounds.staffId === targetStaffId)
        .map((bounds) => (
          <span
            key={`${bounds.systemIndex}:${bounds.staffId}`}
            className={styles.emphasis}
            data-piano-hand-emphasis={bounds.staffId}
            style={geometryStyle(bounds)}
          />
        ))}
    </div>
  );
}

function geometryStyle(bounds: ScoreStaffBounds): CSSProperties {
  return {
    left: `${bounds.x}px`,
    top: `${bounds.y}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
  };
}
