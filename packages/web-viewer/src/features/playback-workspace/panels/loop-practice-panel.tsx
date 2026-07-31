import { useTranslation } from "react-i18next";
import type { ViewerSessionHandle } from "../../../host";
import { usePlaybackSelector } from "../adapters/use-playback-selector";
import { loopDisplayLabel, loopSpeedCommand, presentPlayback } from "../model/playback-presenter";
import { setPlaybackLoopMode } from "../runtime/loop-mode";
import styles from "../../PlaybackWorkspace.module.css";

type Playback = NonNullable<ViewerSessionHandle["playback"]>;

export function LoopPracticePanel({ playback }: { playback: Playback }) {
  const { t } = useTranslation("viewer");
  usePlaybackSelector(playback, (state) => state.loops);
  usePlaybackSelector(playback, (state) => state.activeLoopId);
  usePlaybackSelector(playback, (state) => state.looping);
  usePlaybackSelector(playback, (state) => state.loopDraft);
  const state = playback.getState();
  const view = presentPlayback(state);
  const dispatch = playback.dispatch;
  return (
    <section className={styles.panelSection}>
      <div className={styles.panelHeader}>
        <label className={styles.loopModeRow}>
          <span className={styles.panelTitle}>{t("playback.loopMode")}</span>
          <input
            type="checkbox"
            role="switch"
            checked={view.looping}
            onChange={(event) => setPlaybackLoopMode(playback, state, event.currentTarget.checked)}
          />
        </label>
      </div>
      <div className={styles.panelContent}>
        {view.looping ? (
          <>
            <button type="button" onClick={() => void dispatch({ type: "save-loop" })}>
              {t("playback.saveLoop")}
            </button>
            <label>
              <span>{t("playback.snap")}</span>
              <select
                value={view.loopSnapMode}
                onChange={(event) =>
                  void dispatch({
                    type: "set-loop-snap",
                    mode: event.currentTarget.value as typeof view.loopSnapMode,
                  })
                }
              >
                <option value="off">{t("playback.snapOff")}</option>
                <option value="beat">{t("playback.snapBeat")}</option>
                <option value="measure">{t("playback.snapMeasure")}</option>
              </select>
            </label>
          </>
        ) : (
          <p className={styles.loopModeHint}>{t("playback.loopModeHint")}</p>
        )}
        <div className={styles.itemList}>
          {view.loops.map((loop) => (
            <div className={styles.loopRow} key={loop.id}>
              <button type="button" onClick={() => void dispatch({ type: "select-loop", loopId: loop.id })}>
                {loop.selected ? t("playback.current") : t("playback.select")}
              </button>
              <input
                aria-label={t("playback.loopName")}
                value={loopDisplayLabel(loop, t)}
                onChange={(event) =>
                  void dispatch({
                    type: "rename-loop",
                    loopId: loop.id,
                    label: event.currentTarget.value,
                  })
                }
              />
              <span>
                {t("playback.measureRange", {
                  start: loop.startMeasureIndex + 1,
                  end: loop.endMeasureIndex + 1,
                })}
              </span>
              <input
                type="number"
                min="25"
                max="200"
                step="5"
                value={loop.speedPercent ?? ""}
                placeholder={t("playback.defaultSpeed")}
                aria-label={t("playback.loopSpeed")}
                onChange={(event) => void dispatch(loopSpeedCommand(loop.id, event.currentTarget.value))}
              />
              <button type="button" onClick={() => void dispatch({ type: "delete-loop", loopId: loop.id })}>
                {t("playback.delete")}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
