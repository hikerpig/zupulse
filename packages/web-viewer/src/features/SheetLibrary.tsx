import { useEffect, useMemo, useRef, useState } from "react";
import { Download, MoreHorizontal, PenLine, Star, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ImportItemResult, LibraryScoreSummary } from "@zupulse/web-core";
import type { ViewerApplication } from "../app/ViewerApplication";
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

export function SheetLibrary({
  application,
  scores,
  loading,
  error,
  importing,
  importSummary,
  onImport,
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
  onImport(multiple: boolean): Promise<void>;
  onOpen(id: string): void;
}) {
  const { t, i18n } = useTranslation("library");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<"activity" | "imported" | "practiced" | "title">("activity");
  const [editing, setEditing] = useState<LibraryScoreSummary | undefined>();
  const [deleting, setDeleting] = useState<LibraryScoreSummary | undefined>();
  const deleteReturnFocusRef = useRef<HTMLButtonElement>(null);
  const normalizedQuery = query.trim();
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
    <main className={`${pageStyles.appShell} ${styles.libraryShell} scrollable`}>
      <div className={`${pageStyles.contextBar} ${styles.libraryContextBar}`}>
        <div className={`${pageStyles.contextMain} ${styles.libraryContextMain}`}>
          <h1 className={`${pageStyles.contextTitle} ${styles.libraryTitle}`}>{t("title")}</h1>
          <p className={pageStyles.contextSubtitle}>{t("subtitle")}</p>
        </div>
        <div className={`${pageStyles.contextActions} ${styles.libraryContextActions}`}>
          <button className="primary-button" disabled={loading || importing} onClick={() => void onImport(false)}>
            {t("import")}
          </button>
          <button className="secondary-button" disabled={loading || importing} onClick={() => void onImport(true)}>
            {t("importMany")}
          </button>
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
          <span className="tw:text-caption tw:whitespace-nowrap tw:text-muted">{t("sortLabel")}</span>
          <Select
            className="tw:min-w-0 tw:w-auto tw:text-caption"
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
      {importSummary ? (
        <ImportSummary
          summary={importSummary}
          onCancel={() => application.cancelImport()}
          onDismiss={() => application.dismissImportSummary()}
        />
      ) : null}
      {loading ? (
        <p role="status" style={{ padding: "24px 24px", color: "var(--text-secondary)" }}>
          {t("loading")}
        </p>
      ) : visible.length ? (
        <>
          <div className={styles.libraryStats}>
            <p className={styles.libraryCount}>
              {t("visibleCount", { visible: visible.length, total: scores.length })}
            </p>
          </div>
          <ul className={`${styles.libraryList} scrollable`}>
            {visible.map((score) => (
              <li key={score.id} className={styles.libraryRow}>
                <button
                  type="button"
                  className={styles.libraryOpenAction}
                  aria-label={t(score.practice.lastPosition ? "continueScore" : "openScore", {
                    title: score.title,
                  })}
                  onClick={() => onOpen(score.id)}
                >
                  <span className={styles.libraryIdentity}>
                    <strong>{score.title}</strong>
                    {score.artist ? <span className={styles.libraryArtist}>{score.artist}</span> : null}
                    <span className={styles.libraryMeta}>
                      <span
                        className={`${styles.libraryFormat} ${score.format === "musicxml" ? styles.libraryFormatMusicxml : ""}`}
                      >
                        {score.format.toUpperCase()}
                      </span>
                      <span>
                        {formatRelativeDate(score.importedAt, locale, {
                          today: t("relative.today"),
                          yesterday: t("relative.yesterday"),
                        })}
                      </span>
                      {score.durationMs ? <span>{formatDuration(score.durationMs)}</span> : null}
                    </span>
                  </span>
                  <span className={styles.libraryPrimaryAction}>
                    {t(score.practice.lastPosition ? "continue" : "open")}
                  </span>
                </button>

                <div className={styles.libraryPractice}>
                  {score.practice.lastPosition ? (
                    <span
                      className={`${styles.libraryPracticeStatus} ${score.practice.hasLoop ? styles.libraryPracticeStatusLoop : styles.libraryPracticeStatusActive}`}
                    >
                      <span className={styles.libraryPracticeStatusDot} aria-hidden="true" />
                      <span>
                        {t("practicePosition", {
                          measure: score.practice.lastPosition.measureIndex + 1,
                        })}
                        {score.practice.hasLoop ? t("loopSuffix") : ""}
                      </span>
                    </span>
                  ) : score.practice.lastPracticedAt || score.practice.hasLoop ? (
                    <span
                      className={`${styles.libraryPracticeStatus} ${score.practice.hasLoop ? styles.libraryPracticeStatusLoop : styles.libraryPracticeStatusActive}`}
                    >
                      <span className={styles.libraryPracticeStatusDot} aria-hidden="true" />
                      <span>
                        {score.practice.lastPracticedAt ? t("practiced") : t("savedLoop")}
                        {score.practice.hasLoop && score.practice.lastPracticedAt ? t("loopSuffix") : ""}
                      </span>
                    </span>
                  ) : null}
                  {score.practice.lastPracticedAt ? (
                    <span className={styles.libraryPracticeDate}>
                      {formatRelativeDate(score.practice.lastPracticedAt, locale, {
                        today: t("relative.today"),
                        yesterday: t("relative.yesterday"),
                      })}
                    </span>
                  ) : null}
                </div>

                <div className={styles.libraryRowActions}>
                  <IconButton
                    size="sm"
                    tone="ghost"
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
                      className="tw:shrink-0"
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
                            deleteReturnFocusRef.current = event.currentTarget;
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
            ))}
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
          <button className="primary-button" onClick={() => void onImport(false)}>
            {t("importFirst")}
          </button>
        </section>
      )}
      {editing && (
        <form
          className={styles.libraryEditor}
          aria-label={t("editDialogLabel")}
          onSubmit={(event) => {
            event.preventDefault();
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
          <label>
            {t("fieldTitle")} <input name="title" defaultValue={editing.title} autoFocus />
          </label>
          <label>
            {t("fieldArtist")} <input name="artist" defaultValue={editing.artist ?? ""} />
          </label>
          <button type="submit" className="primary-button">
            {t("save")}
          </button>
          <button type="button" onClick={() => setEditing(undefined)}>
            {t("cancel")}
          </button>
        </form>
      )}
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
            <DialogPopup role="alertdialog" finalFocus={deleteReturnFocusRef} className="tw:grid tw:gap-3">
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
