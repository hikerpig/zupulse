import {
  ALPHA_TAB_TICKS_PER_QUARTER,
  applyMusicXmlHarmonyPlan,
  listMusicXmlMeasureDivisions,
  planAnnotatedMusicXmlExport,
  type EffectiveHarmonyEntry,
  type ScoreFileGateway,
  type StoredScoreFile,
} from "@zupulse/web-core";
import type { HarmonyStudioSession } from "./harmonyStudioSession";

export async function exportHarmonyStudioDocument(input: {
  session: HarmonyStudioSession;
  projection: readonly EffectiveHarmonyEntry[];
  partId: string;
  readScore(): Promise<StoredScoreFile>;
  gateway: ScoreFileGateway;
}): Promise<"saved" | "cancelled"> {
  if (input.session.getState().status === "conflict" || input.session.getState().status === "error") {
    throw new Error("STUDIO_DOCUMENT_NOT_SAVED");
  }
  const flushed = await input.session.flush();
  if (flushed.status !== "ready" || flushed.document === null) throw new Error("STUDIO_DOCUMENT_NOT_SAVED");
  const source = await input.readScore();
  const needsOffsets = input.projection.some(
    (entry) => entry.origin !== "source" && entry.type !== "unresolved" && entry.range.start.offsetTicks !== 0,
  );
  const bytes = applyMusicXmlHarmonyPlan(
    source.bytes,
    planAnnotatedMusicXmlExport(input.projection, {
      partId: input.partId,
      ...(needsOffsets
        ? {
            ticksPerQuarter: ALPHA_TAB_TICKS_PER_QUARTER,
            divisionsByMeasure: listMusicXmlMeasureDivisions(source.bytes, input.partId),
          }
        : {}),
    }),
  );
  return input.gateway.saveExport({ fileName: withChordSuffix(source.fileName), bytes });
}

function withChordSuffix(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index <= 0 ? `${fileName}-chords` : `${fileName.slice(0, index)}-chords${fileName.slice(index)}`;
}
