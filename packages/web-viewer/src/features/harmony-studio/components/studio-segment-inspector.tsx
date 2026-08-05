import { useTranslation } from "react-i18next";
import type { StudioApplication } from "../StudioApplication";
import styles from "../../../app/pages/StudioPage.module.css";
import { HarmonyStudioEditor } from "../HarmonyStudioEditor";
import type { StudioRange } from "../model/studio-page-model";

export function StudioSegmentInspector({
  application,
  libraryScoreId,
  selectedRange,
}: {
  application: StudioApplication;
  libraryScoreId: string;
  selectedRange: StudioRange | undefined;
}) {
  const { t } = useTranslation("studio");
  if (!selectedRange) return <p className={styles.emptyState}>{t("noEditableSegment")}</p>;
  const selectedSegment = selectedRange.analysis;

  return (
    <>
      <HarmonyStudioEditor
        candidates={selectedSegment?.alternatives ?? []}
        {...(selectedSegment?.status === "unresolved" ? { unresolvedReason: selectedSegment.reason } : {})}
        onSelect={(candidate) =>
          void application.setCorrection(libraryScoreId, selectedRange.effective.range, {
            type: "chord",
            chord: candidate.chord,
          })
        }
        onApply={(chord) =>
          void application.setCorrection(libraryScoreId, selectedRange.effective.range, {
            type: "chord",
            chord,
          })
        }
        onNoChord={() =>
          void application.setCorrection(libraryScoreId, selectedRange.effective.range, {
            type: "no-chord",
          })
        }
      />
      <div className={styles.segmentActions} aria-label={t("segmentActions")}>
        <button
          type="button"
          onClick={() => void application.resetCorrection(libraryScoreId, selectedRange.effective.range)}
        >
          {t("resetSegment")}
        </button>
        <button
          type="button"
          onClick={() => void application.splitCorrection(libraryScoreId, selectedRange.effective.range)}
        >
          {t("splitCorrection")}
        </button>
        <button
          type="button"
          onClick={() => void application.mergeCorrections(libraryScoreId, selectedRange.effective.range)}
        >
          {t("mergeCorrections")}
        </button>
        <button
          type="button"
          onClick={() => void application.moveCorrection(libraryScoreId, selectedRange.effective.range, -1)}
        >
          {t("moveLeft")}
        </button>
        <button
          type="button"
          onClick={() => void application.moveCorrection(libraryScoreId, selectedRange.effective.range, 1)}
        >
          {t("moveRight")}
        </button>
      </div>
    </>
  );
}
