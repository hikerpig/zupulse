import { useTranslation } from "react-i18next";
import type { ViewerSessionHandle } from "../../../host";
import { usePlaybackSelector } from "../adapters/use-playback-selector";
import { pianoHandModeLabel, pianoUnavailableReason } from "../model/playback-presenter";
import styles from "../../PlaybackWorkspace.module.css";

type Playback = NonNullable<ViewerSessionHandle["playback"]>;

export function PianoHandsPracticePanel({ playback }: { playback: Playback }) {
  const { t } = useTranslation("viewer");
  const state = usePlaybackSelector(playback, (snapshot) => snapshot.pianoPractice);
  const dispatch = playback.dispatch;
  return (
    <section className={styles.panelSection}>
      <div className={styles.panelHeader}>
        <p className={styles.panelTitle}>{t("playback.handTaskTitle")}</p>
      </div>
      <div className={styles.panelContent}>
        <fieldset className={styles.handModes} disabled={state.availability !== "available"}>
          <legend>{t("playback.handMode")}</legend>
          {(["both-hands", "right-hand", "left-hand"] as const).map((mode) => (
            <label key={mode}>
              <input
                type="radio"
                name="piano-hand-mode"
                checked={state.mode === mode}
                onChange={() => void dispatch({ type: "set-piano-hand-mode", mode })}
              />
              <span className={styles.ledDot} data-active={state.mode === mode || undefined} aria-hidden="true" />
              <span>{pianoHandModeLabel(mode, t)}</span>
            </label>
          ))}
        </fieldset>
        {state.unavailableCode ? (
          <p className={styles.inlineStatus} role="status">
            {pianoUnavailableReason(state.unavailableCode, t)}
          </p>
        ) : null}
        {state.availability === "available" && state.mode !== "both-hands" ? (
          <button
            className={styles.handPreview}
            type="button"
            aria-pressed={state.previewActive}
            onClick={() =>
              void dispatch({
                type: "preview-piano-target-hand",
                active: !state.previewActive,
              })
            }
          >
            {t(state.previewActive ? "playback.stopHandPreview" : "playback.previewTargetHand")}
          </button>
        ) : null}
        {state.pausedForAudioProjection ? (
          <p className={styles.inlineStatus} role="status">
            {t("playback.handProjectionPaused")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
