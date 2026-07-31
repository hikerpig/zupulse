import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button, DialogTrigger, Select, TextField } from "../../../components/ui";
import pageStyles from "../../../app/pages/PageShell.module.css";
import styles from "../../SheetLibrary.module.css";
import type { LibrarySort } from "../model/library-view-model";

export function LibraryToolbar({
  query,
  favoritesOnly,
  sort,
  loading,
  importing,
  onQueryChange,
  onFavoritesOnlyChange,
  onSortChange,
}: {
  query: string;
  favoritesOnly: boolean;
  sort: LibrarySort;
  loading: boolean;
  importing: boolean;
  onQueryChange(value: string): void;
  onFavoritesOnlyChange(value: boolean): void;
  onSortChange(value: LibrarySort): void;
}) {
  const { t } = useTranslation("library");

  return (
    <div className={styles.libraryHeaderSticky}>
      <div className={`${pageStyles.contextBar} ${styles.libraryContextBar}`}>
        <div className={`${pageStyles.contextMain} ${styles.libraryContextMain}`}>
          <h1 className={`${pageStyles.contextTitle} ${styles.libraryTitle}`}>{t("title")}</h1>
          <p className={pageStyles.contextSubtitle}>{t("subtitle")}</p>
        </div>
        <div className={`${pageStyles.contextActions} ${styles.libraryContextActions}`}>
          <DialogTrigger render={<Button tone="primary" disabled={loading || importing} />}>
            {t("import")}
          </DialogTrigger>
        </div>
      </div>
      <section className={styles.libraryControls} aria-label={t("filtersLabel")}>
        <TextField
          className={`${styles.librarySearch} tw:min-w-0 tw:flex-1`}
          type="text"
          aria-label={t("searchLabel")}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("searchPlaceholder")}
        />
        <button
          type="button"
          className={styles.libraryFilterButton}
          aria-pressed={favoritesOnly}
          onClick={() => onFavoritesOnlyChange(!favoritesOnly)}
        >
          <Star size={13} strokeWidth={1.8} aria-hidden="true" />
          {t("favorites")}
        </button>
        <label className={`${styles.librarySort} tw:inline-flex tw:shrink-0 tw:items-center tw:gap-2`}>
          <span className="tw:whitespace-nowrap tw:text-muted">{t("sortLabel")}</span>
          <Select
            className="tw:min-w-0"
            value={sort}
            onChange={(event) => onSortChange(event.target.value as LibrarySort)}
          >
            <option value="activity">{t("sort.activity")}</option>
            <option value="imported">{t("sort.imported")}</option>
            <option value="practiced">{t("sort.practiced")}</option>
            <option value="title">{t("sort.title")}</option>
          </Select>
        </label>
      </section>
    </div>
  );
}
