import {
  compareMoments,
  type EffectiveHarmonyEntry,
  type HarmonySegment,
  type ScoreWrittenMoment,
  type ScoreWrittenRange,
} from "@zupulse/web-core";

export type HarmonyRangeConfidence = "high" | "medium" | "low";

export type HarmonyRangeViewItem = {
  key: string;
  effective: EffectiveHarmonyEntry;
  origin: "correction" | "source" | "analysis";
  analysis?: HarmonySegment;
  confidence?: HarmonyRangeConfidence;
};

export type HarmonyRangeFilter = "all" | "unresolved" | "corrected";

export type HarmonySelection = { focus: ScoreWrittenMoment; range: ScoreWrittenRange };

export type HarmonyRangeMeasure = {
  durationTicks: number;
  timeSignature: { numerator: number; denominator: number };
};

export function createHarmonyRangeViewItems(
  effective: readonly EffectiveHarmonyEntry[],
  revision: readonly HarmonySegment[],
): HarmonyRangeViewItem[] {
  return effective.map((entry) => {
    const analysis = revision.find((segment) => covers(segment.range, entry.range));
    return {
      key: rangeKey(entry.range),
      effective: entry,
      origin: entry.origin ?? "analysis",
      ...(analysis === undefined ? {} : { analysis }),
      ...(analysis?.status === "resolved" ? { confidence: confidenceLevel(analysis.confidence) } : {}),
    };
  });
}

export function filterHarmonyRangeViewItems(
  items: readonly HarmonyRangeViewItem[],
  filter: HarmonyRangeFilter,
  selectedKey?: string,
): HarmonyRangeViewItem[] {
  if (filter === "all") return [...items];
  return items.filter(
    (item) =>
      item.key === selectedKey ||
      (filter === "corrected" ? item.origin === "correction" : item.effective.type === "unresolved"),
  );
}

export function formatHarmonyRange(range: ScoreWrittenRange, measures: readonly HarmonyRangeMeasure[]): string {
  const start = formatMoment(range.start, measures);
  const end = formatMoment(range.end, measures);
  if (range.start.measureIndex !== range.end.measureIndex) return `${start} → ${end}`;
  return `第 ${range.start.measureIndex + 1} 小节 · 第 ${formatBeat(range.start, measures)}–${formatBeat(range.end, measures)} 拍`;
}

export function selectContainingHarmonyRange(
  items: readonly HarmonyRangeViewItem[],
  focus: ScoreWrittenMoment,
): HarmonySelection | undefined {
  const item = items.find(({ effective }) => contains(effective.range, focus));
  return item === undefined ? undefined : { focus, range: item.effective.range };
}

export function restoreHarmonySelection(
  items: readonly HarmonyRangeViewItem[],
  focus: ScoreWrittenMoment,
): HarmonySelection | undefined {
  const selected = selectContainingHarmonyRange(items, focus);
  const item = selected
    ? undefined
    : (items.find(({ effective }) => compareMoments(effective.range.start, focus) > 0) ?? items.at(-1));
  return selected ?? (item === undefined ? undefined : { focus, range: item.effective.range });
}

function covers(outer: EffectiveHarmonyEntry["range"], inner: EffectiveHarmonyEntry["range"]): boolean {
  return compareMoments(outer.start, inner.start) <= 0 && compareMoments(inner.end, outer.end) <= 0;
}

function contains(range: ScoreWrittenRange, moment: ScoreWrittenMoment): boolean {
  return compareMoments(range.start, moment) <= 0 && compareMoments(moment, range.end) < 0;
}

function formatMoment(moment: ScoreWrittenMoment, measures: readonly HarmonyRangeMeasure[]): string {
  return `第 ${moment.measureIndex + 1} 小节 · 第 ${formatBeat(moment, measures)} 拍`;
}

function formatBeat(moment: ScoreWrittenMoment, measures: readonly HarmonyRangeMeasure[]): string {
  const measure = measures[moment.measureIndex];
  if (!measure || measure.timeSignature.numerator < 1 || measure.durationTicks < 1) return "?";
  return formatNumber(moment.offsetTicks / (measure.durationTicks / measure.timeSignature.numerator) + 1);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function rangeKey(range: EffectiveHarmonyEntry["range"]): string {
  return `${range.start.measureIndex}:${range.start.offsetTicks}-${range.end.measureIndex}:${range.end.offsetTicks}`;
}

function confidenceLevel(confidence: number): HarmonyRangeConfidence {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.6) return "medium";
  return "low";
}
