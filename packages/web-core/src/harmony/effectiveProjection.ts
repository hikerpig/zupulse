import type { HarmonyCorrection, HarmonySegment, ScoreWrittenRange } from "./schemas";
import { compareMoments } from "./schemas";

export type SourceHarmonyEntry =
  | {
      type: "chord";
      range: ScoreWrittenRange;
      chord: HarmonySegment extends never
        ? never
        : NonNullable<Extract<HarmonySegment, { status: "resolved" }>["chord"]>;
      origin: "source";
    }
  | { type: "no-chord"; range: ScoreWrittenRange; origin: "source" }
  | {
      type: "unresolved";
      range: ScoreWrittenRange;
      reason: "source-conflict" | "unsupported-source-harmony";
      alternatives: [];
    };
export type EffectiveHarmonyEntry =
  | {
      type: "chord";
      range: ScoreWrittenRange;
      chord: Extract<HarmonySegment, { status: "resolved" }>["chord"];
      origin: "correction" | "source" | "analysis";
    }
  | { type: "no-chord"; range: ScoreWrittenRange; origin: "correction" | "source" }
  | {
      type: "unresolved";
      range: ScoreWrittenRange;
      reason: Extract<HarmonySegment, { status: "unresolved" }>["reason"];
      alternatives: Extract<HarmonySegment, { status: "unresolved" }>["alternatives"];
      origin?: "source" | "analysis";
    };

export function effectiveHarmonyProjection(input: {
  revision: readonly HarmonySegment[];
  source: readonly SourceHarmonyEntry[];
  corrections: readonly HarmonyCorrection[];
}): EffectiveHarmonyEntry[] {
  const authoritativeSource = input.source.filter(
    (entry) => entry.type !== "unresolved" || entry.reason !== "unsupported-source-harmony",
  );
  const boundaries = [
    ...input.revision.flatMap((item) => [item.range.start, item.range.end]),
    ...authoritativeSource.flatMap((item) => [item.range.start, item.range.end]),
    ...input.corrections.flatMap((item) => [item.range.start, item.range.end]),
  ].sort(compareMoments);
  const unique = boundaries.filter(
    (moment, index) => index === 0 || compareMoments(moment, boundaries[index - 1]!) !== 0,
  );
  const entries: EffectiveHarmonyEntry[] = [];
  for (let index = 0; index < unique.length - 1; index += 1) {
    const range = { start: unique[index]!, end: unique[index + 1]! };
    const correction = input.corrections.find((item) => covers(item.range, range));
    const source = authoritativeSource.filter((item) => covers(item.range, range));
    const revision = input.revision.find((item) => covers(item.range, range));
    const entry = correction
      ? correctionEntry(correction, range)
      : source.length > 1
        ? { type: "unresolved" as const, range, reason: "source-conflict" as const, alternatives: [] }
        : source[0]
          ? sourceEntry(source[0], range)
          : revision
            ? revisionEntry(revision, range)
            : undefined;
    if (entry) entries.push(entry);
  }
  return entries;
}

function covers(a: ScoreWrittenRange, b: ScoreWrittenRange): boolean {
  return compareMoments(a.start, b.start) <= 0 && compareMoments(b.end, a.end) <= 0;
}
function correctionEntry(correction: HarmonyCorrection, range: ScoreWrittenRange): EffectiveHarmonyEntry {
  return correction.value.type === "chord"
    ? { type: "chord", range, chord: correction.value.chord, origin: "correction" }
    : { type: "no-chord", range, origin: "correction" };
}
function sourceEntry(source: SourceHarmonyEntry, range: ScoreWrittenRange): EffectiveHarmonyEntry {
  return source.type === "chord"
    ? { type: "chord", range, chord: source.chord, origin: "source" }
    : source.type === "no-chord"
      ? { type: "no-chord", range, origin: "source" }
      : { type: "unresolved", range, reason: source.reason, alternatives: [], origin: "source" };
}
function revisionEntry(revision: HarmonySegment, range: ScoreWrittenRange): EffectiveHarmonyEntry {
  return revision.status === "resolved"
    ? { type: "chord", range, chord: revision.chord, origin: "analysis" }
    : { type: "unresolved", range, reason: revision.reason, alternatives: revision.alternatives, origin: "analysis" };
}
