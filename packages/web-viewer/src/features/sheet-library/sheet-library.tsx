import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LibraryScoreSummary } from "@zupulse/web-core";
import pageStyles from "../../app/pages/PageShell.module.css";
import { DialogRoot } from "../../components/ui";
import { ImportScoreDialog } from "../ImportScoreDialog";
import styles from "../SheetLibrary.module.css";
import { useDebouncedQuery } from "./adapters/use-debounced-query";
import { ImportSummary } from "./components/import-summary";
import { LibraryDialogs } from "./components/library-dialogs";
import { LibraryScoreList } from "./components/library-score-list";
import { LibraryEmptyState, LibraryNoResults, LibrarySkeleton } from "./components/library-states";
import { LibraryToolbar } from "./components/library-toolbar";
import { filterAndSortLibraryScores, getLibraryStats, type LibrarySort } from "./model/library-view-model";
import type { SheetLibraryProps } from "./sheet-library-types";

export function SheetLibrary({
  application,
  scores,
  loading,
  error,
  importing = false,
  importSummary,
  onSelectImportFiles,
  onDropImportFiles,
  sampleScores,
  onSelectSample,
  onImportSources,
  onOpen,
}: SheetLibraryProps) {
  const { t, i18n } = useTranslation("library");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [query, setQuery] = useState("");
  const normalizedQuery = useDebouncedQuery(query).trim();
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<LibrarySort>("activity");
  const [editing, setEditing] = useState<LibraryScoreSummary>();
  const [deleting, setDeleting] = useState<LibraryScoreSummary>();
  const actionsReturnFocusRef = useRef<HTMLButtonElement>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const isFiltering = normalizedQuery.length > 0 || favoritesOnly;

  const visible = useMemo(
    () => filterAndSortLibraryScores({ scores, favoritesOnly, normalizedQuery, sort, locale }),
    [favoritesOnly, locale, normalizedQuery, scores, sort],
  );
  const libraryStats = useMemo(() => getLibraryStats(scores), [scores]);
  const clearFilters = useCallback(() => {
    setQuery("");
    setFavoritesOnly(false);
  }, []);
  const editScore = useCallback((score: LibraryScoreSummary) => setEditing(score), []);
  const deleteScore = useCallback((score: LibraryScoreSummary) => setDeleting(score), []);

  if (error) {
    return (
      <section className="score-empty-state" role="alert">
        <p className="empty-title">{t("unavailableTitle")}</p>
        <p className="empty-copy">{error}</p>
        <button className="primary-button" onClick={() => void application.refreshLibrary()}>
          {t("retry")}
        </button>
      </section>
    );
  }

  return (
    <DialogRoot open={importDialogOpen} onOpenChange={setImportDialogOpen}>
      <main className={`${pageStyles.appShell} ${styles.libraryShell}`}>
        <LibraryToolbar
          query={query}
          favoritesOnly={favoritesOnly}
          sort={sort}
          loading={loading}
          importing={importing}
          onQueryChange={setQuery}
          onFavoritesOnlyChange={setFavoritesOnly}
          onSortChange={setSort}
        />
        {importSummary ? (
          <ImportSummary
            summary={importSummary}
            onCancel={() => application.cancelImport()}
            onDismiss={() => application.dismissImportSummary()}
          />
        ) : null}
        {loading ? (
          <LibrarySkeleton />
        ) : visible.length ? (
          <LibraryScoreList
            application={application}
            scores={visible}
            stats={libraryStats}
            isFiltering={isFiltering}
            normalizedQuery={normalizedQuery}
            locale={locale}
            actionsReturnFocusRef={actionsReturnFocusRef}
            onOpen={onOpen}
            onEdit={editScore}
            onDelete={deleteScore}
          />
        ) : scores.length > 0 ? (
          <LibraryNoResults
            normalizedQuery={normalizedQuery}
            favoritesOnly={favoritesOnly}
            total={scores.length}
            onClearSearch={() => setQuery("")}
            onClearFilters={clearFilters}
          />
        ) : (
          <LibraryEmptyState />
        )}
        <LibraryDialogs
          application={application}
          editing={editing}
          deleting={deleting}
          actionsReturnFocusRef={actionsReturnFocusRef}
          onEditingChange={setEditing}
          onDeletingChange={setDeleting}
        />
      </main>
      <ImportScoreDialog
        open={importDialogOpen}
        onSelectFiles={onSelectImportFiles}
        {...(onDropImportFiles === undefined ? {} : { onDropFiles: onDropImportFiles })}
        sampleScores={sampleScores ?? []}
        {...(onSelectSample === undefined ? {} : { onSelectSample })}
        onImport={onImportSources}
      />
    </DialogRoot>
  );
}
