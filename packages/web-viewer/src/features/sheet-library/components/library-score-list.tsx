import { memo, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryScoreSummary } from "@zupulse/web-core";
import styles from "../../SheetLibrary.module.css";
import type { LibraryStats } from "../model/library-view-model";
import { formatRelativeDate } from "../model/library-view-model";
import { LibraryScoreRow } from "./library-score-row";

export const LibraryScoreList = memo(function LibraryScoreList({
  scores,
  stats,
  isFiltering,
  normalizedQuery,
  locale,
  actionsReturnFocusRef,
  onOpen,
  onToggleFavorite,
  onExport,
  onEdit,
  onDelete,
}: {
  scores: readonly LibraryScoreSummary[];
  stats: LibraryStats;
  isFiltering: boolean;
  normalizedQuery: string;
  locale: string;
  actionsReturnFocusRef: RefObject<HTMLButtonElement | null>;
  onOpen(id: string): void;
  onToggleFavorite(score: LibraryScoreSummary): void;
  onExport(score: LibraryScoreSummary): void;
  onEdit(score: LibraryScoreSummary): void;
  onDelete(score: LibraryScoreSummary): void;
}) {
  const { t } = useTranslation("library");

  return (
    <>
      <div className={styles.libraryStats}>
        <p className={styles.libraryStatsSummary}>
          {t(isFiltering ? "statsSummaryFiltered" : "statsSummary", {
            total: stats.total,
            loops: stats.withLoop,
            visible: scores.length,
          })}
          {stats.lastPracticedAt
            ? t("statsLastPracticed", {
                lastPracticed: formatRelativeDate(stats.lastPracticedAt, locale, {
                  today: t("relative.today"),
                  yesterday: t("relative.yesterday"),
                }),
              })
            : null}
        </p>
      </div>
      <ul className={`${styles.libraryList} scrollable`} aria-label={t("scoreListLabel")}>
        {scores.map((score) => (
          <LibraryScoreRow
            key={score.id}
            score={score}
            normalizedQuery={normalizedQuery}
            locale={locale}
            actionsReturnFocusRef={actionsReturnFocusRef}
            onOpen={onOpen}
            onToggleFavorite={onToggleFavorite}
            onExport={onExport}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </>
  );
});
