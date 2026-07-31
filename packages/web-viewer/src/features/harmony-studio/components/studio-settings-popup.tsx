import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { ViewerApplication } from "../../../app/ViewerApplication";
import { ContextPopup } from "../../../components/ContextPopup";
import styles from "../../../app/pages/StudioPage.module.css";
import type { StudioSnapshot } from "../model/studio-page-model";

export function StudioSettingsPopup({
  application,
  libraryScoreId,
  studio,
  anchor,
  open,
  onOpenChange,
}: {
  application: ViewerApplication;
  libraryScoreId: string;
  studio: StudioSnapshot;
  anchor: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const { t } = useTranslation("studio");
  const document = studio.document;
  if (!document) return null;
  const includedTrackIds = document.activeRevision.parameters.scope.includedTrackIds;
  const availableTrackIds = studio.availableTrackIds ?? includedTrackIds;

  return (
    <ContextPopup anchor={anchor.current} open={open} onOpenChange={onOpenChange}>
      <div>
        <p className={styles.sectionKicker}>{t("settingsKicker")}</p>
        <h3>{t("settings")}</h3>
        <details className={styles.popupSection} open={false}>
          <summary>{t("analysisScope")}</summary>
          <label className={styles.field}>
            <select
              multiple
              aria-label={t("analysisScope")}
              value={includedTrackIds}
              onChange={(event) =>
                void application.setStudioScope(
                  libraryScoreId,
                  Array.from(event.currentTarget.selectedOptions, (option) => option.value),
                )
              }
            >
              {availableTrackIds.map((trackId) => (
                <option key={trackId} value={trackId}>
                  {trackId}
                </option>
              ))}
            </select>
          </label>
        </details>
        <details className={styles.popupSection} open>
          <summary>{t("annotationTarget")}</summary>
          <label className={styles.field}>
            <select
              aria-label={t("annotationTarget")}
              value={document.annotationTarget.trackId}
              onChange={(event) =>
                void application.setStudioAnnotationTarget(libraryScoreId, {
                  trackId: event.currentTarget.value,
                  staffIndex: document.annotationTarget.staffIndex,
                })
              }
            >
              {includedTrackIds.map((trackId) => (
                <option key={trackId} value={trackId}>
                  {trackId}
                </option>
              ))}
            </select>
          </label>
        </details>
      </div>
    </ContextPopup>
  );
}
