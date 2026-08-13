import { useTranslation } from "react-i18next";
import { Button, DialogTrigger } from "../../../components/ui";
import styles from "../../SheetLibrary.module.css";

export function LibrarySkeleton() {
  return (
    <div className={styles.librarySkeleton} role="status" aria-busy="true">
      <div className={styles.librarySkeletonHeader}>
        <div className={styles.skeletonLine} style={{ width: "40%" }} />
      </div>
      <ul className={styles.librarySkeletonList}>
        {Array.from({ length: 6 }).map((_, index) => (
          <li key={index} className={styles.librarySkeletonRow}>
            <div className={styles.skeletonTitle} />
            <div className={styles.skeletonMeta}>
              <div className={styles.skeletonChip} />
              <div className={styles.skeletonDate} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LibraryEmptyState() {
  const { t } = useTranslation("library");
  return (
    <section className="score-empty-state">
      <p className="empty-title">{t("emptyTitle")}</p>
      <p className="empty-copy">{t("emptyCopy")}</p>
      <DialogTrigger render={<Button tone="primary" />}>{t("importOwn")}</DialogTrigger>
    </section>
  );
}

export function LibraryNoResults({
  normalizedQuery,
  favoritesOnly,
  total,
  onClearSearch,
  onClearFilters,
}: {
  normalizedQuery: string;
  favoritesOnly: boolean;
  total: number;
  onClearSearch(): void;
  onClearFilters(): void;
}) {
  const { t } = useTranslation("library");
  return (
    <section className="score-empty-state" aria-live="polite">
      <p className="empty-title">
        {normalizedQuery ? t("noSearchResults", { query: normalizedQuery }) : t("noFavoriteResults")}
      </p>
      <p className="empty-copy">{t("visibleCount", { visible: 0, total })}</p>
      <div className={styles.libraryEmptyActions}>
        {normalizedQuery ? (
          <Button tone="primary" onClick={onClearSearch}>
            {t("clearSearch")}
          </Button>
        ) : null}
        {favoritesOnly ? (
          <Button tone={normalizedQuery ? "secondary" : "primary"} onClick={onClearFilters}>
            {t("clearFilters")}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
