import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { ViewerApplication } from "../../../app/ViewerApplication";
import type { StudioPreferences } from "../../../app/studio-preferences";
import { ContextPopup } from "../../../components/ContextPopup";
import styles from "../../../app/pages/StudioPage.module.css";
import type { StudioRange, StudioSnapshot } from "../model/studio-page-model";
import { audioStatusLabel, previewStatusLabel } from "../model/studio-page-presenter";

export function StudioPreviewPopup({
  application,
  libraryScoreId,
  studio,
  selectedRange,
  preferences,
  anchor,
  open,
  onOpenChange,
  onPreferencesChange,
}: {
  application: ViewerApplication;
  libraryScoreId: string;
  studio: StudioSnapshot;
  selectedRange: StudioRange | undefined;
  preferences: StudioPreferences;
  anchor: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onOpenChange(open: boolean): void;
  onPreferencesChange(next: Partial<StudioPreferences>): void;
}) {
  const { t } = useTranslation("studio");
  const preview = studio.transport ?? { status: "paused" as const, positionTicks: 0, speed: 1 };
  const audioLabel = audioStatusLabel(studio.audioStatus, t);

  return (
    <ContextPopup anchor={anchor.current} open={open} onOpenChange={onOpenChange}>
      <div>
        <p className={styles.sectionKicker}>{t("previewKicker")}</p>
        <h3>{t("preview")}</h3>
        <p role="status">{previewStatusLabel(preview.status, t)}</p>
        {audioLabel ? <p role="status">{audioLabel}</p> : null}
        <button type="button" onClick={() => onPreferencesChange({ previewEnabled: !preferences.previewEnabled })}>
          {preferences.previewEnabled ? t("hideChordPreview") : t("showChordPreview")}
        </button>
        <div className={styles.previewControls}>
          <button
            className="primary-button"
            type="button"
            onClick={() => application.toggleStudioPreview(libraryScoreId)}
          >
            {preview.status === "playing" ? t("pausePreview") : t("playPreview")}
          </button>
          <label className={`${styles.field} ${styles.positionField}`}>
            <span>{t("previewPosition")}</span>
            <input
              type="range"
              aria-label={t("previewPosition")}
              min="0"
              max="10000"
              value={preview.positionTicks}
              onChange={(event) =>
                application.setStudioPreviewPosition(libraryScoreId, Number(event.currentTarget.value))
              }
            />
          </label>
          <label className={styles.field}>
            <span>{t("speed")}</span>
            <select
              aria-label={t("previewSpeed")}
              value={preview.speed}
              onChange={(event) => application.setStudioPreviewSpeed(libraryScoreId, Number(event.currentTarget.value))}
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                <option key={speed} value={speed}>
                  {speed}x
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!selectedRange}
            onClick={() =>
              application.setStudioPreviewLoop(
                libraryScoreId,
                preview.loop ? undefined : selectedRange?.effective.range,
              )
            }
          >
            {preview.loop ? t("disableSelectedLoop") : t("loopSelected")}
          </button>
        </div>
      </div>
    </ContextPopup>
  );
}
