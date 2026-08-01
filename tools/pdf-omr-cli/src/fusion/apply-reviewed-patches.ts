import { rewriteMusicXmlNotePitches, type MusicXmlNotePitchReplacement } from "@zupulse/web-core";
import { canonicalJson, sha256Bytes } from "../canonical-json";
import { PdfOmrError } from "../errors";
import { normalizeAudiverisMusicXmlWithSourceIndex, type MusicXmlSourceNote } from "../normalizers/audiveris";
import type { RepairProposal, RepairProposals } from "./schemas";
import {
  fusionDecisionSetSchema,
  patchPlanSchema,
  type FusionDecisionSet,
  type PatchPlan,
  type ReviewedWrittenPitch,
} from "./writeback-schemas";

export type AppliedReviewedPatches = {
  correctedBytes: Uint8Array;
  patchPlan: PatchPlan;
};

export function applyReviewedPatches(
  sourceBytes: Uint8Array,
  proposals: RepairProposals,
  decisionInput: unknown,
): AppliedReviewedPatches {
  const decisions = fusionDecisionSetSchema.parse(decisionInput);
  verifyDecisionProposalIds(proposals, decisions);
  const decisionByProposal = new Map(decisions.decisions.map((decision) => [decision.proposalId, decision] as const));
  const currentNotes = normalizeAudiverisMusicXmlWithSourceIndex(sourceBytes).sourceNotesByEventId;
  const currentByLocator = new Map([...currentNotes.values()].map((note) => [locatorKey(note), note] as const));
  const replacements: MusicXmlNotePitchReplacement[] = [];
  const patchedTargets = new Set<string>();

  const entries: PatchPlan["entries"] = proposals.proposals.map((proposal) => {
    const decision = decisionByProposal.get(proposal.id);
    if (decision === undefined) {
      return { proposalId: proposal.id, decision: "unreviewed", reasons: ["decision-not-provided"] };
    }
    if (decision.action === "reject") {
      return { proposalId: proposal.id, decision: "rejected", reasons: ["reviewer-rejected"] };
    }
    const writtenPitch = decision.writtenPitch!;
    const sourceNote = verifyApplicableProposal(proposal, writtenPitch, currentByLocator);
    const key = locatorKey(sourceNote);
    if (patchedTargets.has(key)) fail("conflicting-source-note-patches", proposal.id);
    patchedTargets.add(key);
    const after = { ...sourceNote.facts, writtenPitch };
    replacements.push({
      partId: sourceNote.locator.partId,
      measureIndex: sourceNote.locator.measureIndex,
      noteIndex: sourceNote.locator.noteIndex,
      writtenPitch,
    });
    return {
      proposalId: proposal.id,
      decision: "applied",
      target: sourceNote.locator,
      before: sourceNote.facts,
      after,
      reasons: [],
    };
  });

  let correctedBytes: Uint8Array;
  try {
    correctedBytes = rewriteMusicXmlNotePitches(sourceBytes, replacements);
  } catch (error) {
    throw new PdfOmrError("INVALID_INPUT", "reviewed MusicXML pitch patch failed", {
      context: { reason: "source-note-precondition-failed" },
      cause: error,
    });
  }
  return { correctedBytes, patchPlan: patchPlanSchema.parse({ schemaVersion: "1.0.0", entries }) };
}

function verifyDecisionProposalIds(proposals: RepairProposals, decisions: FusionDecisionSet): void {
  const proposalIds = new Set(proposals.proposals.map((proposal) => proposal.id));
  const unknown = decisions.decisions.find((decision) => !proposalIds.has(decision.proposalId));
  if (unknown !== undefined) fail("decision-proposal-mismatch", unknown.proposalId);
}

function verifyApplicableProposal(
  proposal: RepairProposal,
  writtenPitch: ReviewedWrittenPitch,
  currentByLocator: ReadonlyMap<string, MusicXmlSourceNote>,
): MusicXmlSourceNote {
  if (
    proposal.type !== "pitch-disagreement" ||
    proposal.reviewability.status !== "writeback-ready" ||
    proposal.target === undefined ||
    proposal.before === undefined ||
    proposal.suggestedSoundingMidi === undefined
  ) {
    fail("proposal-not-writeback-ready", proposal.id);
  }
  if (writtenMidi(writtenPitch) !== proposal.suggestedSoundingMidi) fail("reviewed-pitch-mismatch", proposal.id);
  const current = currentByLocator.get(locatorKey(proposal.target));
  if (
    current === undefined ||
    current.locator.preconditionSha256 !== proposal.target.preconditionSha256 ||
    hashNoteFacts(proposal.before) !== proposal.target.preconditionSha256
  ) {
    fail("source-note-precondition-failed", proposal.id);
  }
  if (current.facts.tieTypes.length > 0) fail("proposal-not-writeback-ready", proposal.id);
  return current;
}

function locatorKey(note: MusicXmlSourceNote | RepairProposal["target"]): string {
  if (note === undefined) return "missing";
  const locator = "locator" in note ? note.locator : note;
  return `${locator.rootFilePath ?? "plain"}:${locator.partId}:${locator.measureIndex}:${locator.noteIndex}`;
}

function hashNoteFacts(facts: RepairProposal["before"]): string {
  return sha256Bytes(new TextEncoder().encode(canonicalJson(facts)));
}

function writtenMidi(pitch: ReviewedWrittenPitch): number {
  const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[pitch.step];
  return (pitch.octave + 1) * 12 + semitone + pitch.alter;
}

function fail(reason: string, proposalId: string): never {
  throw new PdfOmrError("INVALID_INPUT", "reviewed fusion patch cannot be applied", {
    context: { reason, proposalId },
  });
}
