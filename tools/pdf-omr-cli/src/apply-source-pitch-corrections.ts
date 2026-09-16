import { generateMusicXml } from "./generate-musicxml";
import { compareDraftMusicXml } from "./musicxml-structural-compare";
import { buildPitchShadowReport, type PitchSource } from "./pitch-shadow";
import { omrScoreDraftSchema, type OmrScoreDraft } from "./schemas";
import { validateDraft } from "./validate-draft";

export async function applySourcePitchCorrections(
  original: OmrScoreDraft,
  source: PitchSource,
  extractorSha256: string,
) {
  // Recompute from validated source evidence; a persisted suggestion report is not executable authority.
  const report = buildPitchShadowReport(original, source, extractorSha256);
  const unchanged = (reason: string) => ({ draft: original, report, reason, applied: [] as typeof report.suggestions });
  if (!report.suggestions.length) return unchanged("unchanged");
  const draft = structuredClone(original);
  for (const suggestion of report.suggestions) {
    const matches = draft.parts
      .filter((p) => p.id === suggestion.partId)
      .flatMap((p) => p.staves.filter((s) => s.index === suggestion.staffIndex))
      .flatMap((s) => s.measures.filter((m) => m.index === suggestion.measureIndex))
      .flatMap((m) => m.voices.filter((v) => v.index === suggestion.voiceIndex))
      .flatMap((v) => v.events.filter((n) => n.id === suggestion.eventId));
    const note = matches[0];
    if (matches.length !== 1 || note?.type !== "note") return unchanged("target-mismatch");
    note.writtenPitch = { ...suggestion.suggestedPitch };
    note.soundingMidi = suggestion.suggestedSoundingMidi;
  }
  if (!omrScoreDraftSchema.safeParse(draft).success || validateDraft(draft).readiness.musicXml === "blocked") {
    return unchanged("validation-failed");
  }
  try {
    const roundTrip = await compareDraftMusicXml(draft, generateMusicXml(draft, { container: "mxl" }));
    if (!roundTrip.parse || !roundTrip.view || !roundTrip.playback || !roundTrip.structural) {
      return unchanged("round-trip-failed");
    }
  } catch {
    return unchanged("round-trip-failed");
  }
  return { draft, report, reason: "applied", applied: report.suggestions };
}
