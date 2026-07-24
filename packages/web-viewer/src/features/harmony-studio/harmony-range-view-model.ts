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

export type HarmonyRangeFormatter = {
  moment(measure: number, beat: string): string;
  withinMeasure(measure: number, startBeat: string, endBeat: string): string;
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

export function formatHarmonyRange(
  range: ScoreWrittenRange,
  measures: readonly HarmonyRangeMeasure[],
  formatter: HarmonyRangeFormatter,
): string {
  const start = formatMoment(range.start, measures, formatter);
  const end = formatMoment(range.end, measures, formatter);
  if (range.start.measureIndex !== range.end.measureIndex) return `${start} → ${end}`;
  return formatter.withinMeasure(
    range.start.measureIndex + 1,
    formatBeat(range.start, measures),
    formatBeat(range.end, measures),
  );
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

function formatMoment(
  moment: ScoreWrittenMoment,
  measures: readonly HarmonyRangeMeasure[],
  formatter: HarmonyRangeFormatter,
): string {
  return formatter.moment(moment.measureIndex + 1, formatBeat(moment, measures));
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
