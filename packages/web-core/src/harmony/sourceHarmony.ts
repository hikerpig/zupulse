import { chordSymbolSchema, type ScoreWrittenRange } from "./schemas";
import type { ScoreWrittenMoment } from "./writtenTime";
import type { SourceHarmonyEntry } from "./effectiveProjection";

export type SourceHarmonyPoint =
  | { type: "chord"; moment: ScoreWrittenMoment; chord: unknown }
  | { type: "no-chord"; moment: ScoreWrittenMoment }
  | { type: "unresolved"; moment: ScoreWrittenMoment; reason: "unsupported-source-harmony"; alternatives: [] };

export function parseSourceHarmonyEvents(xml: string): SourceHarmonyPoint[] {
  const points: SourceHarmonyPoint[] = [];
  const measures = [...xml.matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/gi)];
  measures.forEach((measureMatch, measureIndex) => {
    const measure = measureMatch[1] ?? "";
    for (const harmony of measure.matchAll(/<harmony\b[^>]*>([\s\S]*?)<\/harmony>/gi)) {
      const body = harmony[1] ?? "";
      const kind = /<kind\b[^>]*>\s*([^<]+?)\s*<\/kind>/i.exec(body)?.[1]?.toLowerCase();
      const rootStep = /<root-step\b[^>]*>\s*([A-G])\s*<\/root-step>/i.exec(body)?.[1]?.toUpperCase();
      const rootAlter = Number(/<root-alter\b[^>]*>\s*(-?\d+)\s*<\/root-alter>/i.exec(body)?.[1] ?? 0);
      if (kind === "none" || kind === "no chord")
        points.push({ type: "no-chord", moment: { measureIndex, offsetTicks: 0 } });
      else if (!rootStep || !kind || !supportedKind(kind))
        points.push({
          type: "unresolved",
          moment: { measureIndex, offsetTicks: 0 },
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
        if (parsed.success)
          points.push({ type: "chord", moment: { measureIndex, offsetTicks: 0 }, chord: parsed.data });
        else
          points.push({
            type: "unresolved",
            moment: { measureIndex, offsetTicks: 0 },
            reason: "unsupported-source-harmony",
            alternatives: [],
          });
      }
    }
  });
  return points;
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
