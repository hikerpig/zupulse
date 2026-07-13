import { useMemo, useState } from "react";
import type { LibraryScoreSummary } from "@zupulse/web-core";
import type { ViewerApplication } from "../app/ViewerApplication";
import pageStyles from "../app/pages/PageShell.module.css";
import styles from "./SheetLibrary.module.css";

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
      <header className={`${pageStyles.contextBar} ${styles.libraryContextBar}`}>
        <div className={pageStyles.contextMain}>
          <p className={pageStyles.appKicker}>Zupulse</p>
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
      </header>
      <section className={styles.libraryControls} aria-label="曲谱库筛选">
        <input
          aria-label="搜索曲名或艺术家"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索曲名或艺术家"
        />
        <button type="button" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(!favoritesOnly)}>
          收藏
        </button>
        <label>
          排序{" "}
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="activity">最近活动</option>
            <option value="imported">最近导入</option>
            <option value="practiced">最近练习</option>
            <option value="title">标题</option>
          </select>
        </label>
      </section>
      {loading ? (
        <p role="status">正在读取曲谱库…</p>
      ) : visible.length ? (
        <ul className={styles.libraryList}>
          {visible.map((score) => (
            <li key={score.id} className={styles.libraryRow}>
              <button className={styles.libraryOpen} onClick={() => onOpen(score.id)}>
                <span
                  className={`${styles.libraryFormat} ${score.format === "musicxml" ? styles.libraryFormatMusicxml : ""}`}
                >
                  {score.format.toUpperCase()}
                </span>
                <strong>{score.title}</strong>
                <span>
                  {score.artist ?? "未知艺术家"} · {score.format.toUpperCase()}
                </span>
                <span>
                  {score.practice.lastPracticedAt
                    ? `上次练习 · 第 ${score.practice.lastPosition?.measureIndex ?? 0} 小节${score.practice.hasLoop ? " · 有 Loop" : ""}`
                    : "尚未练习"}
                </span>
              </button>
              <button
                aria-label={`收藏 ${score.title}`}
                aria-pressed={score.isFavorite}
                onClick={() =>
                  void application.setFavorite(score.id, !score.isFavorite).then(() => application.refreshLibrary())
                }
              >
                {score.isFavorite ? "★" : "☆"}
              </button>
              <button aria-label={`导出 ${score.title}`} onClick={() => void application.exportLibraryScore(score.id)}>
                导出
              </button>
              <button aria-label={`编辑 ${score.title}`} onClick={() => setEditing(score)}>
                编辑
              </button>
              <button aria-label={`删除 ${score.title}`} onClick={() => setDeleting(score)}>
                删除
              </button>
            </li>
          ))}
        </ul>
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
          <h2 id="delete-title">删除“{deleting.title}”吗？</h2>
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
