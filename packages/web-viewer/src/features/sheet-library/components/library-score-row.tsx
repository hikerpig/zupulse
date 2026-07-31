import { memo, type RefObject } from "react";
import { ArrowRight, Download, MoreHorizontal, PenLine, Star, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LibraryScoreSummary } from "@zupulse/web-core";
import type { ViewerApplication } from "../../../app/ViewerApplication";
import {
  IconButton,
  MenuItem,
  MenuPopup,
  MenuPortal,
  MenuPositioner,
  MenuRoot,
  MenuTrigger,
} from "../../../components/ui";
import styles from "../../SheetLibrary.module.css";
import { formatDuration, formatRelativeDate } from "../model/library-view-model";
import { HighlightText } from "./highlight-text";

export const LibraryScoreRow = memo(function LibraryScoreRow({
  application,
  score,
  normalizedQuery,
  locale,
  actionsReturnFocusRef,
  onOpen,
  onEdit,
  onDelete,
}: {
  application: ViewerApplication;
  score: LibraryScoreSummary;
  normalizedQuery: string;
  locale: string;
  actionsReturnFocusRef: RefObject<HTMLButtonElement | null>;
  onOpen(id: string): void;
  onEdit(score: LibraryScoreSummary): void;
  onDelete(score: LibraryScoreSummary): void;
}) {
  const { t } = useTranslation("library");
  const hasPractice = Boolean(score.practice.lastPosition || score.practice.hasLoop);

  return (
    <li className={`${styles.libraryRow} ${hasPractice ? "" : styles.libraryRowCompact}`} data-score-id={score.id}>
      <button
        type="button"
        className={styles.libraryOpenAction}
        aria-label={t(score.practice.lastPosition ? "continueScore" : "openScore", { title: score.title })}
        onClick={() => onOpen(score.id)}
      >
        <span className={styles.libraryIdentity}>
          <span className={styles.libraryTitleRow}>
            <strong>
              <HighlightText text={score.title} query={normalizedQuery} />
            </strong>
            {score.artist ? (
              <span className={styles.libraryArtist}>
                <HighlightText text={score.artist} query={normalizedQuery} />
              </span>
            ) : null}
          </span>
          <span className={styles.libraryMeta}>
            {hasPractice ? (
              <span
                className={`${styles.libraryPracticeChip} ${
                  score.practice.hasLoop ? styles.libraryPracticeChipLoop : styles.libraryPracticeChipActive
                }`}
              >
                <span className={styles.libraryPracticeDot} aria-hidden="true" />
                {score.practice.lastPosition
                  ? t("practicePosition", { measure: score.practice.lastPosition.measureIndex + 1 })
                  : null}
                {score.practice.hasLoop && !score.practice.lastPosition ? (
                  <span className={styles.libraryLoopOnlyBadge} aria-label={t("savedLoop")} />
                ) : null}
              </span>
            ) : null}
            <span className={styles.libraryMetaDivider} aria-hidden="true" />
            <span className={styles.libraryFormat}>{score.format.toUpperCase()}</span>
            <span className={styles.libraryMetaDivider} aria-hidden="true" />
            <span>
              {formatRelativeDate(score.importedAt, locale, {
                today: t("relative.today"),
                yesterday: t("relative.yesterday"),
              })}
            </span>
            {score.durationMs ? (
              <>
                <span className={styles.libraryMetaDivider} aria-hidden="true" />
                <span>{formatDuration(score.durationMs)}</span>
              </>
            ) : null}
          </span>
        </span>
        <ArrowRight className={styles.libraryActionIndicator} aria-hidden="true" size={16} />
      </button>

      <div className={styles.libraryRowActions}>
        <IconButton
          size="sm"
          tone="ghost"
          className={styles.libraryFavoriteButton}
          aria-label={t(score.isFavorite ? "unfavoriteScore" : "favoriteScore", { title: score.title })}
          pressed={score.isFavorite}
          onClick={() => {
            void application.setFavorite(score.id, !score.isFavorite).then(() => application.refreshLibrary());
          }}
        >
          <Star
            className={`tw:shrink-0 ${score.isFavorite ? "" : styles.favoriteIconInactive}`}
            size={16}
            strokeWidth={1.8}
            fill={score.isFavorite ? "currentColor" : "none"}
            aria-hidden="true"
          />
        </IconButton>
        <MenuRoot>
          <MenuTrigger
            render={
              <IconButton
                size="sm"
                tone="ghost"
                aria-label={t("scoreActions", { title: score.title })}
                onClick={(event) => {
                  actionsReturnFocusRef.current = event.currentTarget;
                }}
              />
            }
          >
            <MoreHorizontal className="tw:size-4 tw:shrink-0" aria-hidden="true" />
          </MenuTrigger>
          <MenuPortal>
            <MenuPositioner sideOffset={6} align="end">
              <MenuPopup>
                <MenuItem onClick={() => void application.exportLibraryScore(score.id)}>
                  <Download className="tw:size-4 tw:shrink-0" aria-hidden="true" />
                  {t("exportScore", { title: score.title })}
                </MenuItem>
                <MenuItem onClick={() => onEdit(score)}>
                  <PenLine className="tw:size-4 tw:shrink-0" aria-hidden="true" />
                  {t("editScore", { title: score.title })}
                </MenuItem>
                <MenuItem
                  className="tw:text-danger tw:data-highlighted:bg-danger-surface tw:data-highlighted:text-danger"
                  onClick={() => onDelete(score)}
                >
                  <Trash2 className="tw:size-4 tw:shrink-0" aria-hidden="true" />
                  {t("deleteScore", { title: score.title })}
                </MenuItem>
              </MenuPopup>
            </MenuPositioner>
          </MenuPortal>
        </MenuRoot>
      </div>
    </li>
  );
});
