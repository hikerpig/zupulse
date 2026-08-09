import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("studio");
  const [filter, setFilter] = useState<HarmonyRangeFilter>(() =>
    ranges.some((item) => item.effective.type === "unresolved") ? "unresolved" : "all",
  );
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
  const filterCount = (value: HarmonyRangeFilter) =>
    value === "all" ? ranges.length : value === "unresolved" ? unresolvedCount : correctedCount;

  return (
    <section className={styles.workspace} aria-labelledby="segments-title">
      <aside className={styles.rail}>
        <div className={styles.heading}>
          <h3 id="segments-title">{t("range.title")}</h3>
        </div>
        <div className={styles.filters} role="group" aria-label={t("range.filters")}>
          {(["unresolved", "all", "corrected"] as const).map((value) => {
            const label = t(
              value === "all"
                ? "range.all"
                : value === "unresolved"
                  ? "range.unresolvedFilter"
                  : "range.correctedFilter",
            );
            return (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                <span>{label}</span>
                <span className={styles.filterCount}>{filterCount(value)}</span>
              </button>
            );
          })}
        </div>
        {selectedIsTemporarilyVisible ? (
          <p className={styles.filterNotice} role="status" aria-label={t("range.temporarySelectionLabel")}>
            <strong>{t("range.currentSelection")}</strong>
            <span className="sr-only">{t("range.temporarySelection")}</span>
          </p>
        ) : null}
        <div ref={listRef} className={`${styles.list} scrollable`} role="list" aria-label={t("range.list")}>
          {displayedRanges.map((item, index) => {
            const originLabel = t(
              item.origin === "source"
                ? "range.originSource"
                : item.origin === "correction"
                  ? "range.originCorrection"
                  : "range.originAnalysis",
            );
            return (
              <button
                key={item.key}
                type="button"
                aria-label={t("range.segment", { number: index + 1, origin: originLabel })}
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
                  event.currentTarget.parentElement
                    ?.querySelectorAll<HTMLButtonElement>("button")
                    [boundedIndex]?.focus();
                }}
              >
                <span className={styles.identity}>
                  <span
                    className={styles.originMarker}
                    data-origin={item.origin}
                    title={originLabel}
                    aria-hidden="true"
                  />
                  <span className={styles.chordName}>
                    {item.effective.type === "chord"
                      ? formatChordSymbol(item.effective.chord)
                      : item.effective.type === "no-chord"
                        ? "N.C."
                        : t("range.unresolved")}
                  </span>
                </span>
                <span className={styles.metadata}>
                  <span className={styles.measure}>
                    {t("range.measure", { number: item.effective.range.start.measureIndex + 1 })}
                  </span>
                  {item.confidence ? (
                    <span
                      className={styles.confidence}
                      aria-label={t(
                        item.confidence === "high"
                          ? "range.confidenceHigh"
                          : item.confidence === "medium"
                            ? "range.confidenceMedium"
                            : "range.confidenceLow",
                      )}
                    >
                      <span className={styles.confidenceDot}></span>
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </aside>
      <div
        ref={editorRef}
        className={styles.editor}
        role="region"
        aria-label={t("range.editor")}
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
