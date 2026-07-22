import { useRef, useState, type ReactNode } from "react";
import { formatChordSymbol } from "@zupulse/web-core";
import {
  filterHarmonyRangeViewItems,
  type HarmonyRangeFilter,
  type HarmonyRangeViewItem,
} from "./harmony-range-view-model";
import styles from "./harmony-range-workspace.module.css";

export function HarmonyRangeWorkspace({
  ranges,
  selectedKey,
  onSelect,
  editor,
}: {
  ranges: readonly HarmonyRangeViewItem[];
  selectedKey?: string;
  onSelect(item: HarmonyRangeViewItem): void;
  editor: ReactNode;
}) {
  const [filter, setFilter] = useState<HarmonyRangeFilter>("all");
  const displayedRanges = filterHarmonyRangeViewItems(ranges, filter, selectedKey);
  const selectedRange = ranges.find((item) => item.key === selectedKey);
  const selectedIsTemporarilyVisible =
    selectedRange !== undefined &&
    filter !== "all" &&
    ((filter === "unresolved" && selectedRange.effective.type !== "unresolved") ||
      (filter === "corrected" && selectedRange.origin !== "correction"));
  const listRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const unresolvedCount = ranges.filter((item) => item.effective.type === "unresolved").length;
  const correctedCount = ranges.filter((item) => item.origin === "correction").length;
  const analysisCount = ranges.filter((item) => item.origin === "analysis").length;

  return (
    <section className={styles.workspace} aria-labelledby="segments-title">
      <aside className={styles.rail}>
        <div className={styles.heading}>
          <span>SEGMENTS</span>
          <h3 id="segments-title">分析片段</h3>
          <p>选择片段进行和弦校对。</p>
        </div>
        <div className={styles.filters} role="group" aria-label="和弦区间筛选">
          {(["all", "unresolved", "corrected"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {{ all: "全部", unresolved: "待确认", corrected: "已修正" }[value]}
            </button>
          ))}
        </div>
        <div className={styles.stats} role="status" aria-label="分析进度统计">
          <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            全部 {ranges.length}
          </button>
          <span className={styles.statsDivider}>|</span>
          <button
            type="button"
            aria-pressed={filter === "unresolved"}
            onClick={() => setFilter("unresolved")}
            className={styles.statItem}
          >
            <span className={styles.statDot} data-origin="analysis"></span>
            未解决 {unresolvedCount}
          </button>
          <span className={styles.statsDivider}>|</span>
          <button
            type="button"
            aria-pressed={filter === "corrected"}
            onClick={() => setFilter("corrected")}
            className={styles.statItem}
          >
            <span className={styles.statDot} data-origin="correction"></span>
            用户修正 {correctedCount}
          </button>
          <span className={styles.statsDivider}>|</span>
          <button type="button" className={styles.statItem}>
            <span className={styles.statDot} data-origin="analysis"></span>
            算法 {analysisCount}
          </button>
        </div>
        {selectedIsTemporarilyVisible ? (
          <p className={styles.filterNotice} role="status" aria-label="筛选选择说明">
            当前选择不符合筛选条件，已临时显示。
          </p>
        ) : null}
        <div ref={listRef} className={`${styles.list} scrollable`} role="list" aria-label="分析片段">
          {displayedRanges.map((item, index) => (
            <button
              key={item.key}
              type="button"
              aria-label={`片段 ${index + 1}`}
              aria-pressed={selectedKey === item.key}
              data-range-key={item.key}
              data-origin={item.origin}
              data-confidence={item.confidence}
              data-type={item.effective.type}
              onClick={() => onSelect(item)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSelect(item);
                  editorRef.current?.focus();
                  return;
                }
                const currentIndex = displayedRanges.findIndex((candidate) => candidate.key === item.key);
                const pageSize = 5;
                const nextIndex =
                  event.key === "ArrowUp"
                    ? currentIndex - 1
                    : event.key === "ArrowDown"
                      ? currentIndex + 1
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? displayedRanges.length - 1
                          : event.key === "PageUp"
                            ? currentIndex - pageSize
                            : event.key === "PageDown"
                              ? currentIndex + pageSize
                              : undefined;
                if (nextIndex === undefined) return;
                event.preventDefault();
                const boundedIndex = Math.max(0, Math.min(displayedRanges.length - 1, nextIndex));
                const destination = displayedRanges[boundedIndex];
                if (!destination) return;
                onSelect(destination);
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[boundedIndex]?.focus();
              }}
            >
              <span className={styles.chordName}>
                {item.effective.type === "chord"
                  ? formatChordSymbol(item.effective.chord)
                  : item.effective.type === "no-chord"
                    ? "N.C."
                    : "未解决"}
              </span>
              <span className={styles.metadata}>
                <span className={styles.measure}>第 {item.effective.range.start.measureIndex + 1} 小节</span>
                {item.confidence ? (
                  <span
                    className={styles.confidence}
                    aria-label={`${item.confidence === "high" ? "高" : item.confidence === "medium" ? "中" : "低"}置信度`}
                  >
                    <span className={styles.confidenceDot}></span>
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </aside>
      <div
        ref={editorRef}
        className={styles.editor}
        role="region"
        aria-label="和弦编辑器"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !selectedKey) return;
          event.preventDefault();
          Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-range-key]") ?? [])
            .find((button) => button.dataset.rangeKey === selectedKey)
            ?.focus();
        }}
      >
        {editor}
      </div>
    </section>
  );
}
