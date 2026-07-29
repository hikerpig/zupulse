import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Download, MoreHorizontal, PenLine, Star, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ImportItemResult, LibraryScoreSummary, ScoreImportSource } from "@zupulse/web-core";
import type { ViewerApplication } from "../app/ViewerApplication";
import type { BundledSampleScore } from "../sample-scores";
import pageStyles from "../app/pages/PageShell.module.css";
import {
  Button,
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogPopup,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
  DialogViewport,
  IconButton,
  MenuItem,
  MenuPopup,
  MenuPortal,
  MenuPositioner,
  MenuRoot,
  MenuTrigger,
  Select,
  TextField,
} from "../components/ui";
import { ImportScoreDialog } from "./ImportScoreDialog";
import styles from "./SheetLibrary.module.css";

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatRelativeDate(iso: string, locale: string, labels: { today: string; yesterday: string }): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return labels.today;
  if (diffDays === 1) return labels.yesterday;
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  if (diffDays < 7) return formatter.format(-diffDays, "day");
  if (diffDays < 30) return formatter.format(-Math.floor(diffDays / 7), "week");
  return formatter.format(-Math.floor(diffDays / 30), "month");
}

function HighlightText({ text, query }: { text: string; query: string }): ReactNode {
  if (!query.trim()) return text;
  const lowerQuery = query.toLocaleLowerCase();
  const lowerText = text.toLocaleLowerCase();
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let index = lowerText.indexOf(lowerQuery);
  while (index !== -1) {
    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }
    parts.push(
      <mark key={`${index}-${lastIndex}`} className={styles.highlightMark}>
        {text.slice(index, index + query.length)}
      </mark>,
    );
    lastIndex = index + query.length;
    index = lowerText.indexOf(lowerQuery, lastIndex);
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

function useDebouncedQuery(query: string, delay = 200) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), delay);
    return () => window.clearTimeout(timer);
  }, [query, delay]);
  return debounced;
}

export function SheetLibrary({
  application,
  scores,
  loading,
  error,
  importing,
  importSummary,
  onSelectImportFiles,
  onDropImportFiles,
  sampleScores,
  onSelectSample,
  onImportSources,
  onOpen,
}: {
  application: ViewerApplication;
  scores: readonly LibraryScoreSummary[];
  loading: boolean;
  error?: string;
  importing?: boolean;
  importSummary?: {
    total: number;
    results: readonly ImportItemResult[];
    cancelled: number;
    running: boolean;
  };
  onSelectImportFiles(): Promise<readonly ScoreImportSource[]>;
  onDropImportFiles?(files: readonly File[]): readonly ScoreImportSource[];
  sampleScores?: readonly BundledSampleScore[];
  onSelectSample?(id: BundledSampleScore["id"]): ScoreImportSource | undefined;
  onImportSources(sources: readonly ScoreImportSource[]): Promise<void>;
  onOpen(id: string): void;
}) {
  const { t, i18n } = useTranslation("library");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [query, setQuery] = useState("");
  const deferredQuery = useDebouncedQuery(query);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<"activity" | "imported" | "practiced" | "title">("activity");
  const [editing, setEditing] = useState<LibraryScoreSummary | undefined>();
  const [deleting, setDeleting] = useState<LibraryScoreSummary | undefined>();
  const actionsReturnFocusRef = useRef<HTMLButtonElement>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const normalizedQuery = deferredQuery.trim();
  const isFiltering = normalizedQuery.length > 0 || favoritesOnly;

  const visible = useMemo(
    () =>
      scores
        .filter((score) => !favoritesOnly || score.isFavorite)
        .filter((score) =>
          `${score.title} ${score.artist ?? ""}`.toLocaleLowerCase().includes(normalizedQuery.toLocaleLowerCase()),
        )
        .sort((a, b) =>
          sort === "title"
            ? a.title.localeCompare(b.title, locale)
            : Date.parse(
                sort === "imported"
                  ? a.importedAt
                  : sort === "practiced"
                    ? (a.practice.lastPracticedAt ?? "1970-01-01T00:00:00.000Z")
                    : (a.lastOpenedAt ?? a.importedAt),
              ) -
              Date.parse(
                sort === "imported"
                  ? b.importedAt
                  : sort === "practiced"
                    ? (b.practice.lastPracticedAt ?? "1970-01-01T00:00:00.000Z")
                    : (b.lastOpenedAt ?? b.importedAt),
              ),
        )
        .reverse(),
    [scores, normalizedQuery, favoritesOnly, sort, locale],
  );

  const libraryStats = useMemo(() => {
    const total = scores.length;
    const withLoop = scores.filter((s) => s.practice.hasLoop).length;
    const lastPracticedAt = scores
      .map((s) => s.practice.lastPracticedAt)
      .filter(Boolean)
      .sort((a, b) => (a && b ? Date.parse(b) - Date.parse(a) : 0))[0];
    return { total, withLoop, lastPracticedAt };
  }, [scores]);

  if (error)
    return (
      <section className="score-empty-state" role="alert">
        <p className="empty-title">{t("unavailableTitle")}</p>
        <p className="empty-copy">{error}</p>
        <button className="primary-button" onClick={() => void application.refreshLibrary()}>
          {t("retry")}
        </button>
      </section>
    );

  return (
    <DialogRoot open={importDialogOpen} onOpenChange={setImportDialogOpen}>
      <main className={`${pageStyles.appShell} ${styles.libraryShell}`}>
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
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
            />
            <button
              type="button"
              className={styles.libraryFilterButton}
              aria-pressed={favoritesOnly}
              onClick={() => setFavoritesOnly(!favoritesOnly)}
            >
              <Star size={13} strokeWidth={1.8} aria-hidden="true" />
              {t("favorites")}
            </button>
            <label className={`${styles.librarySort} tw:inline-flex tw:shrink-0 tw:items-center tw:gap-2`}>
              <span className="tw:whitespace-nowrap tw:text-muted">{t("sortLabel")}</span>
              <Select
                className="tw:min-w-0"
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
              >
                <option value="activity">{t("sort.activity")}</option>
                <option value="imported">{t("sort.imported")}</option>
                <option value="practiced">{t("sort.practiced")}</option>
                <option value="title">{t("sort.title")}</option>
              </Select>
            </label>
          </section>
        </div>
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
          <>
            <div className={styles.libraryStats}>
              <p className={styles.libraryStatsSummary}>
                {t(isFiltering ? "statsSummaryFiltered" : "statsSummary", {
                  total: libraryStats.total,
                  loops: libraryStats.withLoop,
                  visible: visible.length,
                })}
                {libraryStats.lastPracticedAt
                  ? t("statsLastPracticed", {
                      lastPracticed: formatRelativeDate(libraryStats.lastPracticedAt, locale, {
                        today: t("relative.today"),
                        yesterday: t("relative.yesterday"),
                      }),
                    })
                  : null}
              </p>
            </div>
            <ul className={`${styles.libraryList} scrollable`} aria-label={t("scoreListLabel")}>
              {visible.map((score) => {
                const hasPractice = score.practice.lastPosition || score.practice.hasLoop;
                return (
                  <li
                    key={score.id}
                    className={`${styles.libraryRow} ${hasPractice ? "" : styles.libraryRowCompact}`}
                    data-score-id={score.id}
                  >
                    <button
                      type="button"
                      className={styles.libraryOpenAction}
                      aria-label={t(score.practice.lastPosition ? "continueScore" : "openScore", {
                        title: score.title,
                      })}
                      onClick={() => onOpen(score.id)}
                    >
                      <span className={styles.libraryIdentity}>
                        <div className={styles.libraryTitleRow}>
                          <strong>
                            <HighlightText text={score.title} query={normalizedQuery} />
                          </strong>
                          {score.artist ? (
                            <span className={styles.libraryArtist}>
                              <HighlightText text={score.artist} query={normalizedQuery} />
                            </span>
                          ) : null}
                        </div>
                        <span className={styles.libraryMeta}>
                          {hasPractice ? (
                            <span
                              className={`${styles.libraryPracticeChip} ${score.practice.hasLoop ? styles.libraryPracticeChipLoop : styles.libraryPracticeChipActive}`}
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
                        aria-label={t(score.isFavorite ? "unfavoriteScore" : "favoriteScore", {
                          title: score.title,
                        })}
                        pressed={score.isFavorite}
                        onClick={() => {
                          void application
                            .setFavorite(score.id, !score.isFavorite)
                            .then(() => application.refreshLibrary());
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
                              <MenuItem onClick={() => setEditing(score)}>
                                <PenLine className="tw:size-4 tw:shrink-0" aria-hidden="true" />
                                {t("editScore", { title: score.title })}
                              </MenuItem>
                              <MenuItem
                                className="tw:text-danger tw:data-highlighted:bg-danger-surface tw:data-highlighted:text-danger"
                                onClick={() => setDeleting(score)}
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
              })}
            </ul>
          </>
        ) : scores.length > 0 ? (
          <section className="score-empty-state" aria-live="polite">
            <p className="empty-title">
              {normalizedQuery ? t("noSearchResults", { query: normalizedQuery }) : t("noFavoriteResults")}
            </p>
            <p className="empty-copy">{t("visibleCount", { visible: 0, total: scores.length })}</p>
            <div className={styles.libraryEmptyActions}>
              {normalizedQuery ? (
                <button type="button" className="primary-button" onClick={() => setQuery("")}>
                  {t("clearSearch")}
                </button>
              ) : null}
              {favoritesOnly ? (
                <button
                  type="button"
                  className={normalizedQuery ? "secondary-button" : "primary-button"}
                  onClick={() => {
                    setQuery("");
                    setFavoritesOnly(false);
                  }}
                >
                  {t("clearFilters")}
                </button>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="score-empty-state">
            <p className="empty-title">{t("emptyTitle")}</p>
            <p className="empty-copy">{t("emptyCopy")}</p>
            <DialogTrigger render={<Button tone="primary" />}>{t("importOwn")}</DialogTrigger>
          </section>
        )}
        <DialogRoot
          open={Boolean(editing)}
          disablePointerDismissal
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setEditing(undefined);
          }}
        >
          <DialogPortal>
            <DialogBackdrop />
            <DialogViewport>
              <DialogPopup finalFocus={actionsReturnFocusRef} className="tw:grid tw:gap-3">
                <DialogTitle>{t("editDialogLabel")}</DialogTitle>
                <form
                  aria-label={t("editDialogLabel")}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!editing) return;
                    const form = new FormData(event.currentTarget);
                    void application
                      .updateLibraryMetadata(editing.id, {
                        titleOverride: String(form.get("title") ?? "").trim() || undefined,
                        artistOverride: String(form.get("artist") ?? "").trim() || undefined,
                      })
                      .then(() => application.refreshLibrary())
                      .then(() => setEditing(undefined));
                  }}
                >
                  <label className="tw:block">
                    {t("fieldTitle")} <TextField name="title" defaultValue={editing?.title ?? ""} autoFocus />
                  </label>
                  <label className="tw:block">
                    {t("fieldArtist")} <TextField name="artist" defaultValue={editing?.artist ?? ""} />
                  </label>
                  <div className="tw:flex tw:flex-wrap tw:justify-end tw:gap-2">
                    <DialogClose render={<Button tone="ghost" />}>{t("cancel")}</DialogClose>
                    <Button type="submit" tone="primary">
                      {t("save")}
                    </Button>
                  </div>
                </form>
              </DialogPopup>
            </DialogViewport>
          </DialogPortal>
        </DialogRoot>
        <DialogRoot
          open={Boolean(deleting)}
          disablePointerDismissal
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setDeleting(undefined);
          }}
        >
          <DialogPortal>
            <DialogBackdrop />
            <DialogViewport>
              <DialogPopup role="alertdialog" finalFocus={actionsReturnFocusRef} className="tw:grid tw:gap-3">
                <DialogTitle>{deleting ? t("deleteTitle", { title: deleting.title }) : ""}</DialogTitle>
                <DialogDescription>{t("deleteWarning")}</DialogDescription>
                <div className="tw:flex tw:flex-wrap tw:justify-end tw:gap-2">
                  <DialogClose render={<Button tone="ghost" />}>{t("cancel")}</DialogClose>
                  <Button
                    tone="danger"
                    onClick={() => {
                      if (!deleting) return;
                      void application.deleteLibraryScore(deleting.id).then(() => setDeleting(undefined));
                    }}
                  >
                    {t("deleteForever")}
                  </Button>
                </div>
              </DialogPopup>
            </DialogViewport>
          </DialogPortal>
        </DialogRoot>
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

function LibrarySkeleton() {
  return (
    <div className={styles.librarySkeleton} role="status" aria-busy="true">
      <div className={styles.librarySkeletonHeader}>
        <div className={styles.skeletonLine} style={{ width: "40%" }} />
      </div>
      <ul className={styles.librarySkeletonList}>
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className={styles.librarySkeletonRow}>
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

function ImportSummary({
  summary,
  onCancel,
  onDismiss,
}: {
  summary: {
    total: number;
    results: readonly ImportItemResult[];
    cancelled: number;
    running: boolean;
  };
  onCancel(): void;
  onDismiss(): void;
}) {
  const { t } = useTranslation("library");
  const created = summary.results.filter((item) => item.status === "created");
  const existing = summary.results.filter((item) => item.status === "existing");
  const failed = summary.results.filter((item) => item.status === "failed");
  const compactResult =
    !summary.running && summary.total === 1 && summary.cancelled === 0 && summary.results.length === 1
      ? summary.results[0]
      : undefined;
  const compact = compactResult?.status === "created";
  useEffect(() => {
    if (!compact) return;
    const timer = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(timer);
  }, [compact, onDismiss]);
  if (compact && compactResult.status === "created")
    return (
      <section className={styles.importSummaryCompact} role="status" aria-live="polite">
        <span>{t("importSummary.compactCreated", { title: compactResult.score.title })}</span>
        <button type="button" aria-label={t("importSummary.close")} onClick={onDismiss}>
          {t("importSummary.close")}
        </button>
      </section>
    );
  return (
    <section
      className={styles.importSummary}
      aria-label={t("importSummary.label", {
        created: created.length,
        existing: existing.length,
        failed: failed.length,
        cancelled: summary.cancelled,
      })}
      aria-live="polite"
    >
      <div className={styles.importSummaryHeader}>
        <div>
          <strong>{summary.running ? t("importSummary.running") : t("importSummary.complete")}</strong>
          <span>{t("importSummary.progress", { processed: summary.results.length, total: summary.total })}</span>
        </div>
        <button type="button" onClick={summary.running ? onCancel : onDismiss}>
          {summary.running ? t("importSummary.cancelPending") : t("importSummary.close")}
        </button>
      </div>
      <div className={styles.importSummaryCounts}>
        <span>{t("importSummary.created", { count: created.length })}</span>
        <span>{t("importSummary.existing", { count: existing.length })}</span>
        <span>{t("importSummary.failed", { count: failed.length })}</span>
        {summary.cancelled > 0 ? <span>{t("importSummary.cancelled", { count: summary.cancelled })}</span> : null}
      </div>
      {summary.results.length ? (
        <details className={styles.importSummaryDetails} open={failed.length > 0}>
          <summary>{t("importSummary.details")}</summary>
          <ul>
            {summary.results.map((item, index) => (
              <li key={`${importResultFileName(item)}-${index}`}>
                <span>{importResultFileName(item)}</span>
                <code>
                  {item.status === "failed"
                    ? t("importSummary.statusFailed", { code: item.error.code })
                    : t(`importSummary.status${item.status === "created" ? "Created" : "Existing"}`)}
                </code>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function importResultFileName(result: ImportItemResult): string {
  return result.status === "failed" ? result.fileName : result.score.fileName;
}
