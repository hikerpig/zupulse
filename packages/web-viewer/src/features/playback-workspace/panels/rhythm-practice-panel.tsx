import { useTranslation } from "react-i18next";
import type { ViewerPlaybackSlice } from "../../../viewer-session/viewer-session-types";
import { usePlaybackSelector } from "../adapters/use-playback-selector";
import { audioStatusLabel } from "../model/playback-presenter";
import styles from "../../PlaybackWorkspace.module.css";

type Playback = ViewerPlaybackSlice;

export function RhythmPracticePanel({ playback }: { playback: Playback }) {
  const { t } = useTranslation("viewer");
  const rhythm = usePlaybackSelector(playback, (state) => state.rhythm);
  const soundFont = usePlaybackSelector(playback, (state) => state.soundFont);
  const transport = usePlaybackSelector(playback, (state) => state.transport);
  const dispatch = playback.dispatch;
  return (
    <section className={styles.panelSection}>
      <div className={styles.panelHeader}>
        <p className={styles.panelTitle}>{t("playback.rhythmTaskTitle")}</p>
      </div>
      <div className={styles.panelContent}>
        <RhythmSetting
          label={t("playback.metronome")}
          volumeLabel={t("playback.metronomeVolume")}
          setting={rhythm.metronome}
          disabled={soundFont !== "ready"}
          disabledReason={audioStatusLabel(soundFont, t)}
          onEnabledChange={(enabled) => void dispatch({ type: "set-metronome", enabled })}
          onVolumeChange={(volume) => void dispatch({ type: "set-metronome-volume", volume })}
        />
        <RhythmSetting
          label={t("playback.countIn")}
          volumeLabel={t("playback.countInVolume")}
          setting={rhythm.countIn}
          disabled={soundFont !== "ready"}
          disabledReason={audioStatusLabel(soundFont, t)}
          onEnabledChange={(enabled) => void dispatch({ type: "set-count-in", enabled })}
          onVolumeChange={(volume) => void dispatch({ type: "set-count-in-volume", volume })}
        />
        {transport === "counting-in" ? (
          <p className={styles.inlineStatus} role="status">
            {t("playback.countInStatus")}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function RhythmSetting({
  label,
  volumeLabel,
  setting,
  disabled,
  disabledReason,
  onEnabledChange,
  onVolumeChange,
}: {
  label: string;
  volumeLabel: string;
  setting: { enabled: boolean; volume: number };
  disabled: boolean;
  disabledReason: string;
  onEnabledChange(enabled: boolean): void;
  onVolumeChange(volume: number): void;
}) {
  return (
    <div className={styles.rhythmSetting}>
      <label className={styles.loopModeRow}>
        <span className={styles.panelTitle}>{label}</span>
        <input
          type="checkbox"
          role="switch"
          checked={setting.enabled}
          disabled={disabled}
          onChange={(event) => onEnabledChange(event.currentTarget.checked)}
        />
      </label>
      <label className={styles.rhythmVolume}>
        <span>{volumeLabel}</span>
        <output>{setting.volume}%</output>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={setting.volume}
          disabled={disabled}
          aria-label={volumeLabel}
          onChange={(event) => onVolumeChange(Number(event.currentTarget.value))}
        />
      </label>
      {disabled ? <small className={styles.disabledReason}>{disabledReason}</small> : null}
    </div>
  );
}
