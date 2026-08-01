import { createMusicXmlAdapter } from "@zupulse/web-core";
import { sha256Bytes } from "../canonical-json";
import { PdfOmrError } from "../errors";
import { buildPerformanceEvidence } from "../midi/build-performance-evidence";
import { parseStandardMidi } from "../midi/parse-standard-midi";
import { compareOmrScoreDrafts } from "../musicxml-structural-compare";
import { normalizeAudiverisMusicXmlWithSourceIndex } from "../normalizers/audiveris";
import type { OmrScoreDraft } from "../schemas";
import { alignScorePerformance } from "./align-score-performance";
import { assessFusionCompatibility } from "./assess-compatibility";
import { buildScoreEvidence } from "./build-score-evidence";
import { writebackValidationSchema, type PatchPlan, type WritebackValidation } from "./writeback-schemas";

export async function validateWriteback(
  sourceBytes: Uint8Array,
  correctedBytes: Uint8Array,
  midiBytes: Uint8Array,
  patchPlan: PatchPlan,
): Promise<WritebackValidation> {
  const source = normalizeAudiverisMusicXmlWithSourceIndex(sourceBytes);
  let corrected: ReturnType<typeof normalizeAudiverisMusicXmlWithSourceIndex>;
  let runtime: WritebackValidation["runtime"];
  try {
    corrected = normalizeAudiverisMusicXmlWithSourceIndex(correctedBytes);
    const adapter = await createMusicXmlAdapter().parse({ fileName: "corrected.mxl", bytes: correctedBytes });
    runtime = { parse: true, view: adapter.capabilities.view, playback: adapter.capabilities.playback };
  } catch (error) {
    fail("corrected-score-preflight-failed", error);
  }
  if (!runtime.view || !runtime.playback) fail("corrected-score-preflight-failed");

  const expected = structuredClone(source.draft);
  const appliedSourceIds = applyExpectedPitches(expected, source.sourceNotesByEventId, patchPlan);
  const differences = compareOmrScoreDrafts(expected, corrected.draft);
  const sourceBlocking = blockingDiagnosticCounts(source.draft);
  const correctedBlocking = blockingDiagnosticCounts(corrected.draft);
  if (differences.length > 0 || hasNewBlockingDiagnostics(sourceBlocking, correctedBlocking)) {
    fail("corrected-score-structural-regression");
  }

  const before = analyzeFusion(sourceBytes, midiBytes);
  const after = analyzeFusion(correctedBytes, midiBytes);
  if (fusionRegressed(before, after, appliedSourceIds)) fail("corrected-score-fusion-regression");

  return writebackValidationSchema.parse({
    schemaVersion: "1.0.0",
    runtime,
    structural: { differences },
    diagnostics: { sourceBlocking, correctedBlocking },
    fusion: {
      before: { compatibilityStatus: before.alignment.compatibility.status, summary: before.alignment.summary },
      after: { compatibilityStatus: after.alignment.compatibility.status, summary: after.alignment.summary },
    },
  });
}

function applyExpectedPitches(
  expected: OmrScoreDraft,
  sourceNotes: ReturnType<typeof normalizeAudiverisMusicXmlWithSourceIndex>["sourceNotesByEventId"],
  patchPlan: PatchPlan,
): Set<string> {
  const sourceIdByLocator = new Map(
    [...sourceNotes.entries()].map(([sourceId, note]) => [locatorKey(note.locator), sourceId] as const),
  );
  const appliedSourceIds = new Set<string>();
  for (const entry of patchPlan.entries) {
    if (entry.decision !== "applied" || entry.target === undefined || entry.after === undefined) continue;
    const sourceId = sourceIdByLocator.get(locatorKey(entry.target));
    if (sourceId === undefined) fail("corrected-score-structural-regression");
    const event = findEvent(expected, sourceId);
    if (event === undefined || event.type !== "note") fail("corrected-score-structural-regression");
    event.writtenPitch = entry.after.writtenPitch;
    event.soundingMidi = writtenMidi(entry.after.writtenPitch);
    appliedSourceIds.add(sourceId);
  }
  return appliedSourceIds;
}

function findEvent(draft: OmrScoreDraft, sourceId: string) {
  for (const part of draft.parts) {
    for (const staff of part.staves) {
      for (const measure of staff.measures) {
        for (const voice of measure.voices) {
          const event = voice.events.find((candidate) => candidate.id === sourceId);
          if (event !== undefined) return event;
        }
      }
    }
  }
  return undefined;
}

function blockingDiagnosticCounts(draft: OmrScoreDraft): Record<string, number> {
  const counts = new Map<string, number>();
  for (const diagnostic of draft.diagnostics) {
    if (diagnostic.severity === "blocking") counts.set(diagnostic.code, (counts.get(diagnostic.code) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function hasNewBlockingDiagnostics(
  source: Readonly<Record<string, number>>,
  corrected: Readonly<Record<string, number>>,
) {
  return Object.entries(corrected).some(([code, count]) => count > (source[code] ?? 0));
}

function analyzeFusion(scoreBytes: Uint8Array, midiBytes: Uint8Array) {
  const draft = normalizeAudiverisMusicXmlWithSourceIndex(scoreBytes).draft;
  const scoreEvidence = buildScoreEvidence(draft, {
    fileName: "score.mxl",
    sha256: sha256Bytes(scoreBytes),
    sizeBytes: scoreBytes.length,
  });
  const performanceEvidence = buildPerformanceEvidence(parseStandardMidi(midiBytes), {
    fileName: "score.mid",
    sha256: sha256Bytes(midiBytes),
    sizeBytes: midiBytes.length,
  });
  const compatibility = assessFusionCompatibility(scoreEvidence, performanceEvidence);
  const result = alignScorePerformance(scoreEvidence, performanceEvidence, compatibility);
  return { scoreEvidence, alignment: result.alignment, proposals: result.repairProposals };
}

function fusionRegressed(
  before: ReturnType<typeof analyzeFusion>,
  after: ReturnType<typeof analyzeFusion>,
  appliedSourceIds: ReadonlySet<string>,
): boolean {
  const epsilon = 1e-12;
  if (before.alignment.compatibility.status !== "compatible" || after.alignment.compatibility.status !== "compatible") {
    return true;
  }
  if (
    after.alignment.summary.scoreCoverage + epsilon < before.alignment.summary.scoreCoverage ||
    after.alignment.summary.midiCoverage + epsilon < before.alignment.summary.midiCoverage ||
    after.alignment.summary.pitchAgreement + epsilon < before.alignment.summary.pitchAgreement
  ) {
    return true;
  }
  const afterScoreById = new Map(after.scoreEvidence.notes.map((note) => [note.id, note] as const));
  return after.proposals.some(
    (proposal) =>
      proposal.type === "pitch-disagreement" &&
      proposal.scoreNoteId !== undefined &&
      appliedSourceIds.has(afterScoreById.get(proposal.scoreNoteId)?.sourceNoteId ?? ""),
  );
}

function locatorKey(locator: { rootFilePath: string | null; partId: string; measureIndex: number; noteIndex: number }) {
  return `${locator.rootFilePath ?? "plain"}:${locator.partId}:${locator.measureIndex}:${locator.noteIndex}`;
}

function writtenMidi(pitch: { step: "A" | "B" | "C" | "D" | "E" | "F" | "G"; alter: number; octave: number }) {
  const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[pitch.step];
  return (pitch.octave + 1) * 12 + semitone + pitch.alter;
}

function fail(reason: string, cause?: unknown): never {
  throw new PdfOmrError("INVALID_INPUT", "corrected MusicXML validation failed", {
    context: { reason },
    ...(cause === undefined ? {} : { cause }),
  });
}
