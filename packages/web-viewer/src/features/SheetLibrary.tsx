import { useMemo, useState } from "react";
import { Download, PenLine, Star, Trash2 } from "lucide-react";
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

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "今天";
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays} 天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} 周前`;
  return `${Math.floor(diffDays / 30)} 月前`;
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
            ? a.title.localeCompare(b.title)
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
    [scores, query, favoritesOnly, sort],
  );
  if (error)
    return (
      <section className="score-empty-state" role="alert">
        <p className="empty-title">曲谱库暂时不可用</p>
        <p className="empty-copy">{error}</p>
        <button className="primary-button" onClick={() => void application.refreshLibrary()}>
          重试
        </button>
      </section>
    );
  return (
    <main className={`${pageStyles.appShell} ${styles.libraryShell}`}>
      <div className={`${pageStyles.contextBar} ${styles.libraryContextBar}`}>
        <div className={pageStyles.contextMain}>
          <p className={pageStyles.appKicker}>Library</p>
          <h1 className={`${pageStyles.contextTitle} ${styles.libraryTitle}`}>曲谱库</h1>
          <p className={pageStyles.contextSubtitle}>曲谱保存在这台设备上，可离线使用。</p>
        </div>
        <div className={pageStyles.contextActions}>
          <button className="primary-button" disabled={loading} onClick={() => void onImport(false)}>
            导入曲谱
          </button>
          <button className="secondary-button" disabled={loading} onClick={() => void onImport(true)}>
            批量导入
          </button>
        </div>
      </div>
      <section className={styles.libraryControls} aria-label="曲谱库筛选">
        <input
          type="text"
          aria-label="搜索曲名或艺术家"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索曲名或艺术家…"
        />
        <button
          type="button"
          className={styles.libraryFilterButton}
          aria-pressed={favoritesOnly}
          onClick={() => setFavoritesOnly(!favoritesOnly)}
        >
          <Star size={13} strokeWidth={1.8} aria-hidden="true" />
          收藏
        </button>
        <div className={styles.librarySort}>
          <span>排序</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="activity">最近活动</option>
            <option value="imported">最近导入</option>
            <option value="practiced">最近练习</option>
            <option value="title">标题</option>
          </select>
        </div>
      </section>
      {loading ? (
        <p role="status" style={{ padding: "24px 24px", color: "var(--text-secondary)" }}>
          正在读取曲谱库…
        </p>
      ) : visible.length ? (
        <>
          <div className={styles.libraryStats}>
            <p className={styles.libraryCount}>
              <strong>{visible.length}</strong> / {scores.length} 份曲谱
            </p>
          </div>
          <ul className={styles.libraryList}>
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
                      aria-label={score.isFavorite ? "取消收藏" : "收藏"}
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
                        {score.practice.lastPosition ? `第 ${score.practice.lastPosition.measureIndex} 小节` : "已练习"}
                        {score.practice.hasLoop ? " · Loop" : ""}
                      </span>
                    ) : (
                      <span>尚未练习</span>
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
                    {formatRelativeDate(score.importedAt)}
                  </span>
                  <div className={styles.libraryCardFooterActions}>
                    <button
                      aria-label={`导出 ${score.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void application.exportLibraryScore(score.id);
                      }}
                    >
                      <Download aria-hidden="true" />
                    </button>
                    <button
                      aria-label={`编辑 ${score.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditing(score);
                      }}
                    >
                      <PenLine aria-hidden="true" />
                    </button>
                    <button
                      aria-label={`删除 ${score.title}`}
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
          <p className="empty-title">你的曲谱会保存在这台设备上</p>
          <p className="empty-copy">支持 Guitar Pro、MusicXML 和 MXL，导入后可离线使用。</p>
          <button className="primary-button" onClick={() => void onImport(false)}>
            导入第一份曲谱
          </button>
        </section>
      )}
      {editing && (
        <form
          className={styles.libraryEditor}
          aria-label="编辑曲谱信息"
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
            标题 <input name="title" defaultValue={editing.title} autoFocus />
          </label>
          <label>
            艺术家 <input name="artist" defaultValue={editing.artist ?? ""} />
          </label>
          <button type="submit" className="primary-button">
            保存
          </button>
          <button type="button" onClick={() => setEditing(undefined)}>
            取消
          </button>
        </form>
      )}
      {deleting && (
        <section className={styles.libraryDialog} role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
          <h2 id="delete-title">删除"{deleting.title}"吗？</h2>
          <p>曲谱文件和全部练习数据将被永久删除，且无法恢复。</p>
          <button
            className="primary-button"
            autoFocus
            onClick={() => void application.deleteLibraryScore(deleting.id).then(() => setDeleting(undefined))}
          >
            永久删除
          </button>
          <button onClick={() => setDeleting(undefined)}>取消</button>
        </section>
      )}
    </main>
  );
}
