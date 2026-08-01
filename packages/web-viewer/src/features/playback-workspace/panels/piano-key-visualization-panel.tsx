import { useTranslation } from "react-i18next";
import styles from "../../PlaybackWorkspace.module.css";

export function PianoKeyVisualizationPanel({
  enabled,
  onEnabledChange,
}: {
  enabled: boolean;
  onEnabledChange(enabled: boolean): void;
}) {
  const { t } = useTranslation("viewer");
  return (
    <section className={styles.panelSection}>
      <div className={styles.panelHeader}>
        <p className={styles.panelTitle}>{t("playback.keyboardTaskTitle")}</p>
      </div>
      <div className={styles.panelContent}>
        <label className={styles.loopModeRow}>
          <span className={styles.panelTitle}>{t("playback.showKeyboardHints")}</span>
          <input
            type="checkbox"
            role="switch"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.currentTarget.checked)}
          />
        </label>
        <p className={styles.loopModeHint}>{t("playback.keyboardHintDescription")}</p>
      </div>
    </section>
  );
}
