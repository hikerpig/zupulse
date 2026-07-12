import { useMemo, useState } from "react";
import type { LibraryScoreSummary } from "@tab-viewer/web-core";
import type { ViewerApplication } from "../app/ViewerApplication";

export function SheetLibrary({
  application,
  scores,
  loading,
  error,
  onOpen,
}: {
  application: ViewerApplication;
  scores: readonly LibraryScoreSummary[];
  loading: boolean;
  error?: string;
  onOpen(id: string): void;
}) {
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<"activity" | "imported" | "title">("activity");
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
            : Date.parse(sort === "imported" ? a.importedAt : (a.lastOpenedAt ?? a.importedAt)) -
              Date.parse(sort === "imported" ? b.importedAt : (b.lastOpenedAt ?? b.importedAt)),
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
    <main className="app-shell library-shell">
      <header className="context-bar">
        <div className="context-main">
          <p className="app-kicker">Tab Viewer</p>
          <h1 className="context-title">曲谱库</h1>
          <p className="context-subtitle">曲谱保存在这台设备上，可离线使用。</p>
        </div>
        <div className="context-actions">
          <button className="primary-button" disabled={loading} onClick={() => void application.importScores(false)}>
            导入曲谱
          </button>
          <button className="secondary-button" disabled={loading} onClick={() => void application.importScores(true)}>
            批量导入
          </button>
        </div>
      </header>
      <section className="library-controls" aria-label="曲谱库筛选">
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
            <option value="title">标题</option>
          </select>
        </label>
      </section>
      {loading ? (
        <p role="status">正在读取曲谱库…</p>
      ) : visible.length ? (
        <ul className="library-list">
          {visible.map((score) => (
            <li key={score.id} className="library-row">
              <button className="library-open" onClick={() => onOpen(score.id)}>
                <strong>{score.title}</strong>
                <span>
                  {score.artist ?? "未知艺术家"} · {score.format.toUpperCase()}
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
              <button
                aria-label={`删除 ${score.title}`}
                onClick={() => {
                  if (confirm(`永久删除“${score.title}”及其全部练习数据？`))
                    void application.deleteLibraryScore(score.id);
                }}
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <section className="score-empty-state">
          <p className="empty-title">你的曲谱会保存在这台设备上</p>
          <p className="empty-copy">支持 Guitar Pro、MusicXML 和 MXL，导入后可离线使用。</p>
          <button className="primary-button" onClick={() => void application.importScores(false)}>
            导入第一份曲谱
          </button>
        </section>
      )}
    </main>
  );
}
