import { useTranslation } from "react-i18next";
import type { ViewerApplication } from "../../../app/ViewerApplication";
import styles from "../../../app/pages/StudioPage.module.css";
import { HarmonyStudioEditor } from "../HarmonyStudioEditor";
import type { StudioRange } from "../model/studio-page-model";

export function StudioSegmentInspector({
  application,
  libraryScoreId,
  selectedRange,
}: {
  application: ViewerApplication;
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
          void application.setStudioCorrection(libraryScoreId, selectedRange.effective.range, {
            type: "chord",
            chord: candidate.chord,
          })
        }
        onApply={(chord) =>
          void application.setStudioCorrection(libraryScoreId, selectedRange.effective.range, {
            type: "chord",
            chord,
          })
        }
        onNoChord={() =>
          void application.setStudioCorrection(libraryScoreId, selectedRange.effective.range, {
            type: "no-chord",
          })
        }
      />
      <div className={styles.segmentActions} aria-label={t("segmentActions")}>
        <button
          type="button"
          onClick={() => void application.resetStudioCorrection(libraryScoreId, selectedRange.effective.range)}
        >
          {t("resetSegment")}
        </button>
        <button
          type="button"
          onClick={() => void application.splitStudioCorrection(libraryScoreId, selectedRange.effective.range)}
        >
          {t("splitCorrection")}
        </button>
        <button
          type="button"
          onClick={() => void application.mergeStudioCorrections(libraryScoreId, selectedRange.effective.range)}
        >
          {t("mergeCorrections")}
        </button>
        <button
          type="button"
          onClick={() => void application.moveStudioCorrection(libraryScoreId, selectedRange.effective.range, -1)}
        >
          {t("moveLeft")}
        </button>
        <button
          type="button"
          onClick={() => void application.moveStudioCorrection(libraryScoreId, selectedRange.effective.range, 1)}
        >
          {t("moveRight")}
        </button>
      </div>
    </>
  );
}
