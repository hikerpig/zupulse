import { chordSymbolSchema, compareMoments, type ScoreWrittenRange } from "./schemas";
import type { ScoreWrittenMoment } from "./writtenTime";
import type { SourceHarmonyEntry } from "./effectiveProjection";

const ALPHA_TAB_TICKS_PER_QUARTER = 960;

export type SourceHarmonyPoint =
  | { type: "chord"; moment: ScoreWrittenMoment; chord: unknown }
  | { type: "no-chord"; moment: ScoreWrittenMoment }
  | { type: "unresolved"; moment: ScoreWrittenMoment; reason: "unsupported-source-harmony"; alternatives: [] };

export function parseSourceHarmonyEvents(xml: string, partId?: string): SourceHarmonyPoint[] {
  const points: SourceHarmonyPoint[] = [];
  const scopedXml = partId === undefined ? xml : selectPartXml(xml, partId);
  const measures = [...scopedXml.matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/gi)];
  let effectiveDivisions = 1;
  measures.forEach((measureMatch, measureIndex) => {
    const measure = measureMatch[1] ?? "";
    const divisions = /<divisions\b[^>]*>\s*(\d+)\s*<\/divisions>/i.exec(measure)?.[1];
    if (divisions !== undefined) effectiveDivisions = Number(divisions);
    for (const harmony of measure.matchAll(/<harmony\b[^>]*>([\s\S]*?)<\/harmony>/gi)) {
      const body = harmony[1] ?? "";
      const moment = sourceHarmonyMoment(body, measureIndex, effectiveDivisions);
      const kind = /<kind\b[^>]*>\s*([^<]+?)\s*<\/kind>/i.exec(body)?.[1]?.toLowerCase();
      const rootStep = /<root-step\b[^>]*>\s*([A-G])\s*<\/root-step>/i.exec(body)?.[1]?.toUpperCase();
      const rootAlter = Number(/<root-alter\b[^>]*>\s*(-?\d+)\s*<\/root-alter>/i.exec(body)?.[1] ?? 0);
      if (kind === "none" || kind === "no chord") points.push({ type: "no-chord", moment });
      else if (!rootStep || !kind || !supportedKind(kind))
        points.push({
          type: "unresolved",
          moment,
          reason: "unsupported-source-harmony",
          alternatives: [],
        });
      else {
        const extension = kind === "dominant" ? 7 : undefined;
        const parsed = chordSymbolSchema.safeParse({
          root: { step: rootStep, alter: rootAlter },
          kind,
          ...(extension ? { extension } : {}),
          degrees: [],
        });
        if (parsed.success) points.push({ type: "chord", moment, chord: parsed.data });
        else
          points.push({
            type: "unresolved",
            moment,
            reason: "unsupported-source-harmony",
            alternatives: [],
          });
      }
    }
  });
  return points.sort((left, right) => compareMoments(left.moment, right.moment));
}

function sourceHarmonyMoment(body: string, measureIndex: number, divisions: number): ScoreWrittenMoment {
  const sourceOffset = /<offset\b[^>]*>\s*([^<]+?)\s*<\/offset>/i.exec(body)?.[1];
  if (sourceOffset === undefined) return { measureIndex, offsetTicks: 0 };
  const offsetDivisions = Number(sourceOffset);
  const offsetTicks = Math.round((offsetDivisions * ALPHA_TAB_TICKS_PER_QUARTER) / divisions);
  if (!Number.isFinite(offsetDivisions) || offsetDivisions < 0 || !Number.isSafeInteger(offsetTicks)) {
    throw new Error("unrepresentable-source-harmony-offset");
  }
  return { measureIndex, offsetTicks };
}

function selectPartXml(xml: string, partId: string): string {
  if (/<score-timewise\b/i.test(xml)) {
    return [...xml.matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/gi)]
      .map((measure) => {
        const part = new RegExp(
          `<part\\b[^>]*\\bid=["']${escapeRegExp(partId)}["'][^>]*>([\\s\\S]*?)<\\/part>`,
          "i",
        ).exec(measure[1] ?? "");
        return part ? `<measure>${part[1] ?? ""}</measure>` : "";
      })
      .join("");
  }
  const part = new RegExp(`<part\\b[^>]*\\bid=["']${escapeRegExp(partId)}["'][^>]*>([\\s\\S]*?)<\\/part>`, "i").exec(
    xml,
  );
  return part?.[1] ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function projectSourceHarmonyEvents(
  points: readonly SourceHarmonyPoint[],
  scoreEnd: ScoreWrittenMoment,
): SourceHarmonyEntry[] {
  return points.map((point, index) => {
    const next = points[index + 1]?.moment ?? scoreEnd;
    const range: ScoreWrittenRange = { start: point.moment, end: next };
    if (point.type === "chord") {
      const chord = chordSymbolSchema.parse(point.chord);
      return { type: "chord", range, chord, origin: "source" };
    }
    if (point.type === "no-chord") return { type: "no-chord", range, origin: "source" };
    return { type: "unresolved", range, reason: point.reason, alternatives: [] };
  });
}

function supportedKind(kind: string): boolean {
  return [
    "major",
    "minor",
    "dominant",
    "diminished",
    "half-diminished",
    "augmented",
    "suspended-second",
    "suspended-fourth",
    "power",
  ].includes(kind);
}
