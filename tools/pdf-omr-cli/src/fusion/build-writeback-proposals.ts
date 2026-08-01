import type { MusicXmlSourceNote } from "../normalizers/audiveris";
import {
  repairProposalsSchema,
  type AlignmentRepairProposal,
  type FusionAlignment,
  type RepairProposal,
  type RepairProposals,
  type ScoreEvidence,
  type ScoreNoteEvidence,
} from "./schemas";

type PitchGroup = {
  sourceNoteId?: string;
  proposals: AlignmentRepairProposal[];
};

type OrderedProposal = { kind: "pitch"; group: PitchGroup } | { kind: "other"; proposal: AlignmentRepairProposal };

export function buildWritebackProposals(
  score: ScoreEvidence,
  alignment: FusionAlignment,
  alignmentProposals: readonly AlignmentRepairProposal[],
  sourceNotesByEventId: ReadonlyMap<string, MusicXmlSourceNote>,
): RepairProposals {
  const scoreById = new Map(score.notes.map((note) => [note.id, note] as const));
  const pitchGroups = new Map<string, PitchGroup>();
  const ordered: OrderedProposal[] = [];

  for (const proposal of alignmentProposals) {
    if (proposal.type !== "pitch-disagreement") {
      ordered.push({ kind: "other", proposal });
      continue;
    }
    const scoreNote = proposal.scoreNoteId === undefined ? undefined : scoreById.get(proposal.scoreNoteId);
    const key = scoreNote?.sourceNoteId ?? `missing:${proposal.id}`;
    let group = pitchGroups.get(key);
    if (group === undefined) {
      group = { ...(scoreNote === undefined ? {} : { sourceNoteId: scoreNote.sourceNoteId }), proposals: [] };
      pitchGroups.set(key, group);
      ordered.push({ kind: "pitch", group });
    }
    group.proposals.push(proposal);
  }

  return repairProposalsSchema.parse({
    schemaVersion: "2.0.0",
    mode: "report-only",
    proposals: ordered.map((item) =>
      item.kind === "pitch"
        ? buildPitchProposal(item.group, score, alignment, scoreById, sourceNotesByEventId)
        : buildReviewOnlyProposal(item.proposal, scoreById, sourceNotesByEventId),
    ),
  });
}

function buildPitchProposal(
  group: PitchGroup,
  score: ScoreEvidence,
  alignment: FusionAlignment,
  scoreById: ReadonlyMap<string, ScoreNoteEvidence>,
  sourceNotesByEventId: ReadonlyMap<string, MusicXmlSourceNote>,
): RepairProposal {
  const reasons: string[] = [];
  const scoreNotes = group.proposals
    .map((proposal) => (proposal.scoreNoteId === undefined ? undefined : scoreById.get(proposal.scoreNoteId)))
    .filter((note): note is ScoreNoteEvidence => note !== undefined);
  if (scoreNotes.length !== group.proposals.length || group.sourceNoteId === undefined) {
    reasons.push("score-evidence-note-not-found");
  }

  const sourceOccurrences =
    group.sourceNoteId === undefined ? [] : score.notes.filter((note) => note.sourceNoteId === group.sourceNoteId);
  const proposedScoreIds = new Set(group.proposals.flatMap((proposal) => proposal.scoreNoteId ?? []));
  if (
    sourceOccurrences.length !== group.proposals.length ||
    sourceOccurrences.some((note) => !proposedScoreIds.has(note.id))
  ) {
    reasons.push("incomplete-playback-evidence");
  }

  const suggestions = group.proposals
    .map((proposal) => proposal.suggestedSoundingMidi)
    .filter((pitch): pitch is number => pitch !== undefined);
  const uniqueSuggestions = [...new Set(suggestions)];
  if (suggestions.length !== group.proposals.length) reasons.push("suggested-pitch-missing");
  if (uniqueSuggestions.length > 1) reasons.push("conflicting-playback-suggestions");
  if (alignment.compatibility.status !== "compatible") reasons.push("fusion-compatibility-not-compatible");
  if (alignment.compatibility.detectedTransposition !== 0) reasons.push("nonzero-detected-transposition");

  const sourceNote = group.sourceNoteId === undefined ? undefined : sourceNotesByEventId.get(group.sourceNoteId);
  if (sourceNote === undefined) reasons.push("source-note-locator-missing");

  const first = group.proposals[0]!;
  return {
    id: first.id,
    type: "pitch-disagreement",
    ...(group.proposals.some((proposal) => proposal.scoreNoteId !== undefined)
      ? { scoreNoteIds: group.proposals.flatMap((proposal) => proposal.scoreNoteId ?? []) }
      : {}),
    ...(group.proposals.some((proposal) => proposal.midiNoteId !== undefined)
      ? { midiNoteIds: group.proposals.flatMap((proposal) => proposal.midiNoteId ?? []) }
      : {}),
    ...(uniqueSuggestions.length === 1 ? { suggestedSoundingMidi: uniqueSuggestions[0]! } : {}),
    confidence: Math.min(...group.proposals.map((proposal) => proposal.confidence)),
    autoApplicable: false,
    reviewability: { status: reasons.length === 0 ? "writeback-ready" : "review-only", reasons },
    ...(sourceNote === undefined ? {} : { target: sourceNote.locator, before: sourceNote.facts }),
  };
}

function buildReviewOnlyProposal(
  proposal: AlignmentRepairProposal,
  scoreById: ReadonlyMap<string, ScoreNoteEvidence>,
  sourceNotesByEventId: ReadonlyMap<string, MusicXmlSourceNote>,
): RepairProposal {
  const scoreNote = proposal.scoreNoteId === undefined ? undefined : scoreById.get(proposal.scoreNoteId);
  const sourceNote = scoreNote === undefined ? undefined : sourceNotesByEventId.get(scoreNote.sourceNoteId);
  return {
    id: proposal.id,
    type: proposal.type,
    ...(proposal.scoreNoteId === undefined ? {} : { scoreNoteIds: [proposal.scoreNoteId] }),
    ...(proposal.midiNoteId === undefined ? {} : { midiNoteIds: [proposal.midiNoteId] }),
    ...(proposal.suggestedSoundingMidi === undefined ? {} : { suggestedSoundingMidi: proposal.suggestedSoundingMidi }),
    confidence: proposal.confidence,
    autoApplicable: false,
    reviewability: {
      status: "review-only",
      reasons: [
        proposal.type === "midi-supported-missing-note"
          ? "missing-note-notation-underdetermined"
          : "note-removal-structure-risk",
      ],
    },
    ...(sourceNote === undefined ? {} : { target: sourceNote.locator, before: sourceNote.facts }),
  };
}
