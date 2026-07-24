import { useMemo, useState } from "react";
import { Download, PenLine, Star, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LibraryScoreSummary } from "@zupulse/web-core";
import type { ViewerApplication } from "../app/ViewerApplication";
import pageStyles from "../app/pages/PageShell.module.css";
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
  onImport,
  onOpen,
}: {
  application: ViewerApplication;
  scores: readonly LibraryScoreSummary[];
  loading: boolean;
  error?: string;
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
  const visible = useMemo(
    () =>
      scores
        .filter((score) => !favoritesOnly || score.isFavorite)
        .filter((score) =>
          `${score.title} ${score.artist ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
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
    [scores, query, favoritesOnly, sort, locale],
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
        <div className={pageStyles.contextMain}>
          <p className={pageStyles.appKicker}>{t("kicker")}</p>
          <h1 className={`${pageStyles.contextTitle} ${styles.libraryTitle}`}>{t("title")}</h1>
          <p className={pageStyles.contextSubtitle}>{t("subtitle")}</p>
        </div>
        <div className={pageStyles.contextActions}>
          <button className="primary-button" disabled={loading} onClick={() => void onImport(false)}>
            {t("import")}
          </button>
          <button className="secondary-button" disabled={loading} onClick={() => void onImport(true)}>
            {t("importMany")}
          </button>
        </div>
      </div>
      <section className={styles.libraryControls} aria-label={t("filtersLabel")}>
        <input
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
        <div className={styles.librarySort}>
          <span>{t("sortLabel")}</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="activity">{t("sort.activity")}</option>
            <option value="imported">{t("sort.imported")}</option>
            <option value="practiced">{t("sort.practiced")}</option>
            <option value="title">{t("sort.title")}</option>
          </select>
        </div>
      </section>
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
              <li
                key={score.id}
                className={styles.libraryRow}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(score.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onOpen(score.id);
                }}
              >
                {/* Banner: format badge + favorite */}
                <div className={styles.libraryCardBanner}>
                  <span
                    className={`${styles.libraryFormat} ${score.format === "musicxml" ? styles.libraryFormatMusicxml : ""}`}
                  >
                    {score.format.toUpperCase()}
                  </span>
                  <div className={styles.libraryCardBannerActions}>
                    <button
                      aria-label={score.isFavorite ? t("unfavorite") : t("favorite")}
                      aria-pressed={score.isFavorite}
                      onClick={(event) => {
                        event.stopPropagation();
                        void application
                          .setFavorite(score.id, !score.isFavorite)
                          .then(() => application.refreshLibrary());
                      }}
                    >
                      <Star
                        size={14}
                        strokeWidth={1.8}
                        fill={score.isFavorite ? "currentColor" : "none"}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </div>

                {/* Main content */}
                <div className={styles.libraryContent}>
                  <strong>{score.title}</strong>
                  {score.artist ? <span className={styles.libraryArtist}>{score.artist}</span> : null}
                  <div className={styles.libraryMeta}>
                    {score.durationMs ? <span>{formatDuration(score.durationMs)}</span> : null}
                    {score.durationMs ? <span className={styles.libraryMetaDot} aria-hidden="true" /> : null}
                    {score.practice.lastPracticedAt ? (
                      <span
                        className={`${styles.libraryPracticeStatus} ${score.practice.hasLoop ? styles.libraryPracticeStatusLoop : styles.libraryPracticeStatusActive}`}
                      >
                        <span className={styles.libraryPracticeStatusDot} aria-hidden="true" />
                        {score.practice.lastPosition
                          ? t("measure", { measure: score.practice.lastPosition.measureIndex })
                          : t("practiced")}
                        {score.practice.hasLoop ? t("loopSuffix") : ""}
                      </span>
                    ) : (
                      <span>{t("notPracticed")}</span>
                    )}
                  </div>
                </div>

                {/* Footer: actions */}
                <div className={styles.libraryCardFooter}>
                  <span
                    style={{
                      color: "var(--text-tertiary)",
                      fontSize: "11px",
                      fontFamily: '"IBM Plex Mono", monospace',
                    }}
                  >
                    {formatRelativeDate(score.importedAt, locale, {
                      today: t("relative.today"),
                      yesterday: t("relative.yesterday"),
                    })}
                  </span>
                  <div className={styles.libraryCardFooterActions}>
                    <button
                      aria-label={t("exportScore", { title: score.title })}
                      onClick={(event) => {
                        event.stopPropagation();
                        void application.exportLibraryScore(score.id);
                      }}
                    >
                      <Download aria-hidden="true" />
                    </button>
                    <button
                      aria-label={t("editScore", { title: score.title })}
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditing(score);
                      }}
                    >
                      <PenLine aria-hidden="true" />
                    </button>
                    <button
                      aria-label={t("deleteScore", { title: score.title })}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleting(score);
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
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
      {deleting && (
        <section className={styles.libraryDialog} role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
          <h2 id="delete-title">{t("deleteTitle", { title: deleting.title })}</h2>
          <p>{t("deleteWarning")}</p>
          <button
            className="primary-button"
            autoFocus
            onClick={() => void application.deleteLibraryScore(deleting.id).then(() => setDeleting(undefined))}
          >
            {t("deleteForever")}
          </button>
          <button onClick={() => setDeleting(undefined)}>{t("cancel")}</button>
        </section>
      )}
    </main>
  );
}
