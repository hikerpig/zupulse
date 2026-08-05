import { useTranslation } from "react-i18next";
import type { StudioApplication } from "../StudioApplication";
import type { StudioPreferences } from "../../../app/studio-preferences";
import styles from "../../../app/pages/StudioPage.module.css";
import { HarmonyRangeWorkspace } from "../harmony-range-workspace";
import type { StudioRange, StudioSnapshot } from "../model/studio-page-model";
import { studioIssueMessage } from "../model/studio-page-presenter";
import { StudioCommandBar } from "./studio-command-bar";
import { StudioSegmentInspector } from "./studio-segment-inspector";

export function StudioAnalysisPanel({
  application,
  libraryScoreId,
  storageAvailable,
  studio,
  ranges,
  selectedRange,
  preferences,
  onPreferencesChange,
  onSelectRange,
}: {
  application: StudioApplication;
  libraryScoreId: string | undefined;
  storageAvailable: boolean;
  studio: StudioSnapshot | undefined;
  ranges: readonly StudioRange[];
  selectedRange: StudioRange | undefined;
  preferences: StudioPreferences;
  onPreferencesChange(next: Partial<StudioPreferences>): void;
  onSelectRange(item: StudioRange): void;
}) {
  const { t } = useTranslation("studio");
  const { t: tErrors } = useTranslation("errors");
  const document = studio?.document;

  return (
    <section aria-label={t("analysisRegion")}>
      <div className={styles.analysisHeading}>
        <div>
          <p className={styles.sectionKicker}>{t("kicker")}</p>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
      </div>
      {!storageAvailable ? (
        <p className={styles.alert} role="alert">
          {t("storageUnavailable")}
        </p>
      ) : studio?.status === "loading" && !document ? (
        <p className={styles.emptyState} role="status">
          {t("initializing")}
        </p>
      ) : studio?.status === "error" && !document ? (
        <p className={styles.alert} role="alert">
          {studioIssueMessage(studio.error, tErrors)}
        </p>
      ) : document && libraryScoreId ? (
        <>
          <StudioCommandBar
            application={application}
            libraryScoreId={libraryScoreId}
            studio={studio}
            selectedRange={selectedRange}
            preferences={preferences}
            onPreferencesChange={onPreferencesChange}
          />
          {studio.status === "conflict" || studio.status === "error" ? (
            <p className={styles.alert} role="alert">
              {studioIssueMessage(studio.error, tErrors)}
            </p>
          ) : null}
          {studio.previewError ? (
            <p className={styles.alert} role="alert">
              {t("previewUnavailable", { message: studioIssueMessage(studio.previewError, tErrors) })}
              <button type="button" onClick={() => application.retryPreview(libraryScoreId)}>
                {t("retryPreview")}
              </button>
            </p>
          ) : null}
          {studio.audioError ? (
            <p className={styles.alert} role="alert">
              {t("audioUnavailable", { message: studioIssueMessage(studio.audioError, tErrors) })}
            </p>
          ) : null}
          {studio.selectionNotice ? (
            <p className={styles.emptyState} role="status" aria-label={t("selectionNoticeLabel")}>
              {t("selectionNotice")}
            </p>
          ) : null}
          <HarmonyRangeWorkspace
            ranges={ranges}
            {...(selectedRange ? { selectedKey: selectedRange.key } : {})}
            onSelect={onSelectRange}
            editor={
              <StudioSegmentInspector
                application={application}
                libraryScoreId={libraryScoreId}
                selectedRange={selectedRange}
              />
            }
          />
        </>
      ) : (
        <p className={styles.emptyState}>{t("empty")}</p>
      )}
    </section>
  );
}
