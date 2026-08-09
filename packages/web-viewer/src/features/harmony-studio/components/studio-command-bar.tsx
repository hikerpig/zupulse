import { useRef, useState } from "react";
import { Download, Redo2, Settings, Undo2, Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { StudioApplication } from "../StudioApplication";
import type { StudioPreferences } from "../../../app/studio-preferences";
import styles from "../../../app/pages/StudioPage.module.css";
import type { StudioRange, StudioSnapshot } from "../model/studio-page-model";
import { documentStatusLabel } from "../model/studio-page-presenter";
import { StudioPreviewPopup } from "./studio-preview-popup";
import { StudioSettingsPopup } from "./studio-settings-popup";

export function StudioCommandBar({
  application,
  libraryScoreId,
  studio,
  selectedRange,
  preferences,
  onPreferencesChange,
}: {
  application: StudioApplication;
  libraryScoreId: string;
  studio: StudioSnapshot;
  selectedRange: StudioRange | undefined;
  preferences: StudioPreferences;
  onPreferencesChange(next: Partial<StudioPreferences>): void;
}) {
  const { t } = useTranslation("studio");
  const [exportStatus, setExportStatus] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const document = studio.document;
  if (!document) return null;
  const canSave =
    studio.status === "unsaved" || (studio.status === "error" && studio.error?.code === "studio-save-failed");

  return (
    <>
      <div className={styles.commandBar}>
        <div className={styles.documentStatus}>
          <p role="status" aria-label={t("documentStatus")}>
            {documentStatusLabel(
              studio.status,
              document.activeRevision.segments.length,
              document.corrections.length,
              t,
            )}
          </p>
        </div>
        <div className={styles.commandGroups}>
          <div className={styles.buttonGroup} role="group" aria-label={t("history")}>
            <button
              type="button"
              onClick={() => application.undo(libraryScoreId)}
              aria-label={t("undo")}
              title={t("undo")}
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              onClick={() => application.redo(libraryScoreId)}
              aria-label={t("redo")}
              title={t("redo")}
            >
              <Redo2 size={16} />
            </button>
          </div>
          <div className={styles.buttonGroup} role="group" aria-label={t("analysisControls")}>
            {studio.status === "analyzing" ? (
              <button type="button" onClick={() => application.cancelReanalysis(libraryScoreId)}>
                {t("cancelAnalysis")}
              </button>
            ) : (
              <button type="button" onClick={() => void application.reanalyze(libraryScoreId)}>
                {t("reanalyze")}
              </button>
            )}
            <button
              className={canSave ? "primary-button" : undefined}
              type="button"
              disabled={!canSave}
              onClick={() => void application.flush(libraryScoreId)}
            >
              {t("save")}
            </button>
            <button
              type="button"
              onClick={() =>
                void application
                  .export(libraryScoreId)
                  .then((result) => setExportStatus(result === "saved" ? t("exportSaved") : t("exportCancelled")))
                  .catch(() => setExportStatus(t("exportFailed")))
              }
              aria-label={t("export")}
              title={t("export")}
            >
              <Download size={16} />
            </button>
          </div>
          <div className={styles.buttonGroup} role="group" aria-label={t("settingsAndPreview")}>
            <button
              ref={settingsButtonRef}
              type="button"
              onClick={() => {
                setSettingsOpen(!settingsOpen);
                setPreviewOpen(false);
              }}
              aria-label={t("settings")}
              title={t("settings")}
            >
              <Settings size={16} />
            </button>
            <button
              ref={previewButtonRef}
              type="button"
              onClick={() => {
                setPreviewOpen(!previewOpen);
                setSettingsOpen(false);
              }}
              aria-label={t("preview")}
              title={t("preview")}
            >
              <Volume2 size={16} />
            </button>
          </div>
        </div>
      </div>
      {exportStatus ? (
        <p className={styles.exportStatus} role="status">
          {exportStatus}
        </p>
      ) : null}
      <StudioSettingsPopup
        application={application}
        libraryScoreId={libraryScoreId}
        studio={studio}
        anchor={settingsButtonRef}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
      <StudioPreviewPopup
        application={application}
        libraryScoreId={libraryScoreId}
        studio={studio}
        selectedRange={selectedRange}
        preferences={preferences}
        anchor={previewButtonRef}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onPreferencesChange={onPreferencesChange}
      />
    </>
  );
}
