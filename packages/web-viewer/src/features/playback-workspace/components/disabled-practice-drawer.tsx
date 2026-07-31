import { ChevronRight } from "lucide-react";
import { type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { BpmControl } from "./bpm-control";
import styles from "../../PlaybackWorkspace.module.css";

export function DisabledPracticeDrawer({
  closeButtonRef,
  onClose,
}: {
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onClose(): void;
}) {
  const { t } = useTranslation("viewer");
  return (
    <aside id="practice-drawer" className={styles.practicePanel} aria-label={t("playback.practice")}>
      <div className={styles.drawerHeader}>
        <div>
          <h2 className={styles.drawerTitle}>{t("playback.practice")}</h2>
        </div>
        <button
          ref={closeButtonRef}
          className={styles.drawerClose}
          type="button"
          aria-label={t("playback.closePractice")}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className={styles.panelShell}>
        <section className={styles.panelSection}>
          <div className={styles.panelHeader}>
            <p className={styles.panelTitle}>{t("playback.speedTitle")}</p>
          </div>
          <div className={styles.panelContent}>
            <BpmControl baseTempo={120} currentTempo={120} speedPercent={100} disabled />
          </div>
        </section>
        <div className={styles.taskList}>
          {[
            t("playback.rhythmTaskTitle"),
            t("playback.handTaskTitle"),
            t("playback.loopTaskTitle"),
            t("playback.trackTaskTitle"),
          ].map((title) => (
            <button className={styles.taskEntry} type="button" key={title} disabled>
              <span>
                <strong>{title}</strong>
              </span>
              <ChevronRight aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      <p className={styles.persistenceStatus}>{t("playback.disabledHint")}</p>
    </aside>
  );
}
