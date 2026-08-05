import { PdfOmrError } from "../errors";
import type { PerformanceEvidence } from "../midi/schemas";
import { compareRational } from "../rational";
import {
  fusionAlignmentSchema,
  alignmentRepairProposalsSchema,
  type AlignmentRepairProposal,
  type AlignmentRepairProposals,
  type FusionAlignment,
  type FusionCompatibility,
  type FusionDiagnostic,
  type ScoreEvidence,
  type ScoreNoteEvidence,
} from "./schemas";

const parameters = {
  gapCost: 1,
  onsetWeight: 0.5,
  maxReconciliationOnsetDistance: 0.01,
  maxTracebackCells: 10_000_000,
} as const;

type ScoreFrame = { onset: number; notes: ScoreNoteEvidence[] };
type MidiNote = PerformanceEvidence["notes"][number];
type MidiFrame = { onset: number; notes: MidiNote[] };
type FrameStep = { score?: ScoreFrame; midi?: MidiFrame };

export function alignScorePerformance(
  score: ScoreEvidence,
  performance: PerformanceEvidence,
  compatibility: FusionCompatibility,
): {
  alignment: FusionAlignment;
  repairProposals: AlignmentRepairProposals["proposals"];
  diagnostics: FusionDiagnostic[];
} {
  if (compatibility.status === "incompatible") {
    const diagnostics: FusionDiagnostic[] = [
      {
        code: "FUSION_INPUTS_INCOMPATIBLE",
        severity: "blocking",
        message: "Score and MIDI compatibility checks failed.",
        context: { reasons: compatibility.reasons },
      },
    ];
    return {
      alignment: fusionAlignmentSchema.parse({
        schemaVersion: "1.0.0",
        algorithm: { id: "zupulse-score-midi-frame-alignment", version: "1.0.0", parameters },
        compatibility,
        entries: [],
        summary: emptySummary(),
      }),
      repairProposals: [],
      diagnostics,
    };
  }

  const scoreFrames = buildScoreFrames(score.notes);
  const alignableMidiNotes = performance.notes.filter((note) => !note.flags.includes("percussion-channel"));
  const midiFrames = buildMidiFrames(alignableMidiNotes);
  const frameAlignment = alignFrames(scoreFrames, midiFrames, compatibility.detectedTransposition);
  const entries: FusionAlignment["entries"] = [];
  const proposals: AlignmentRepairProposal[] = [];

  for (const step of frameAlignment.steps) {
    appendStepEntries(entries, proposals, step, compatibility.detectedTransposition);
  }
  reconcileNearbyFrameBoundaries(entries, proposals, scoreFrames, midiFrames, compatibility.detectedTransposition);
  entries.forEach((entry, index) => {
    entry.id = `alignment-${String(index).padStart(6, "0")}`;
  });
  proposals.forEach((proposal, index) => {
    proposal.id = `proposal-${String(index).padStart(6, "0")}`;
  });

  const matched = entries.filter((entry) => entry.status === "matched").length;
  const ambiguous = entries.filter((entry) => entry.status === "ambiguous").length;
  const scoreOnly = entries.filter((entry) => entry.status === "score-only").length;
  const midiOnly = entries.filter((entry) => entry.status === "midi-only").length;
  const alignedScore = matched + ambiguous;
  const alignedMidi = matched + ambiguous;
  const alignment = fusionAlignmentSchema.parse({
    schemaVersion: "1.0.0",
    algorithm: { id: "zupulse-score-midi-frame-alignment", version: "1.0.0", parameters },
    compatibility,
    entries,
    summary: {
      matched,
      ambiguous,
      scoreOnly,
      midiOnly,
      scoreCoverage: score.notes.length === 0 ? 0 : alignedScore / score.notes.length,
      midiCoverage: alignableMidiNotes.length === 0 ? 0 : alignedMidi / alignableMidiNotes.length,
      pitchAgreement: alignedScore === 0 ? 0 : matched / alignedScore,
      frameAlignmentCost: frameAlignment.cost,
    },
  });
  return {
    alignment,
    repairProposals: alignmentRepairProposalsSchema.parse({
      schemaVersion: "1.0.0",
      mode: "report-only",
      proposals,
    }).proposals,
    diagnostics: [],
  };
}

function buildScoreFrames(notes: readonly ScoreNoteEvidence[]): ScoreFrame[] {
  const sorted = [...notes].sort(
    (left, right) => compareRational(left.playbackOnset, right.playbackOnset) || left.id.localeCompare(right.id),
  );
  const maximum = rationalNumber(sorted.at(-1)?.playbackOnset ?? { numerator: 0, denominator: 1 });
  return groupFrames(
    sorted,
    (note) => `${note.playbackOnset.numerator}/${note.playbackOnset.denominator}`,
    (note) => (maximum === 0 ? 0 : rationalNumber(note.playbackOnset) / maximum),
  );
}

function buildMidiFrames(notes: readonly MidiNote[]): MidiFrame[] {
  const sorted = [...notes].sort((left, right) => left.onsetTick - right.onsetTick || left.id.localeCompare(right.id));
  const maximum = sorted.at(-1)?.onsetTick ?? 0;
  return groupFrames(
    sorted,
    (note) => String(note.onsetTick),
    (note) => (maximum === 0 ? 0 : note.onsetTick / maximum),
  );
}

function groupFrames<T>(
  items: readonly T[],
  key: (item: T) => string,
  onset: (item: T) => number,
): Array<{ onset: number; notes: T[] }> {
  const result: Array<{ onset: number; notes: T[] }> = [];
  let previousKey: string | undefined;
  for (const item of items) {
    const itemKey = key(item);
    if (itemKey !== previousKey) {
      result.push({ onset: onset(item), notes: [item] });
      previousKey = itemKey;
    } else {
      result.at(-1)!.notes.push(item);
    }
  }
  return result;
}

function alignFrames(score: readonly ScoreFrame[], midi: readonly MidiFrame[], transposition: number) {
  const width = midi.length + 1;
  const cellCount = (score.length + 1) * width;
  if (cellCount > parameters.maxTracebackCells) {
    throw new PdfOmrError("INVALID_INPUT", "score and MIDI alignment exceeds the resource limit", {
      context: { reason: "fusion-alignment-limit", cellCount, maxTracebackCells: parameters.maxTracebackCells },
    });
  }
  const directions = new Uint8Array(cellCount);
  let previous = new Float64Array(width);
  for (let midiIndex = 1; midiIndex < width; midiIndex += 1) {
    previous[midiIndex] = midiIndex * parameters.gapCost;
    directions[midiIndex] = 2;
  }
  for (let scoreIndex = 1; scoreIndex <= score.length; scoreIndex += 1) {
    const current = new Float64Array(width);
    current[0] = scoreIndex * parameters.gapCost;
    directions[scoreIndex * width] = 1;
    for (let midiIndex = 1; midiIndex <= midi.length; midiIndex += 1) {
      const diagonal =
        previous[midiIndex - 1]! + frameCost(score[scoreIndex - 1]!, midi[midiIndex - 1]!, transposition);
      const scoreGap = previous[midiIndex]! + parameters.gapCost;
      const midiGap = current[midiIndex - 1]! + parameters.gapCost;
      const best = Math.min(diagonal, scoreGap, midiGap);
      current[midiIndex] = best;
      directions[scoreIndex * width + midiIndex] = best === diagonal ? 0 : best === scoreGap ? 1 : 2;
    }
    previous = current;
  }
  const totalCost = previous[midi.length]!;
  const steps: FrameStep[] = [];
  let scoreIndex = score.length;
  let midiIndex = midi.length;
  while (scoreIndex > 0 || midiIndex > 0) {
    const direction = directions[scoreIndex * width + midiIndex];
    if (scoreIndex > 0 && midiIndex > 0 && direction === 0) {
      steps.push({ score: score[scoreIndex - 1]!, midi: midi[midiIndex - 1]! });
      scoreIndex -= 1;
      midiIndex -= 1;
    } else if (scoreIndex > 0 && (midiIndex === 0 || direction === 1)) {
      steps.push({ score: score[scoreIndex - 1]! });
      scoreIndex -= 1;
    } else {
      steps.push({ midi: midi[midiIndex - 1]! });
      midiIndex -= 1;
    }
  }
  return { steps: steps.reverse(), cost: totalCost };
}

function frameCost(score: ScoreFrame, midi: MidiFrame, transposition: number): number {
  const scorePitches = score.notes.map((note) => note.soundingMidi + transposition);
  const midiPitches = midi.notes.map((note) => note.pitch);
  const remaining = [...midiPitches];
  let matches = 0;
  for (const pitch of scorePitches) {
    const index = remaining.indexOf(pitch);
    if (index >= 0) {
      matches += 1;
      remaining.splice(index, 1);
    }
  }
  const pitchDisagreement = 1 - (2 * matches) / (scorePitches.length + midiPitches.length);
  return pitchDisagreement + Math.abs(score.onset - midi.onset) * parameters.onsetWeight;
}

function appendStepEntries(
  entries: FusionAlignment["entries"],
  proposals: AlignmentRepairProposal[],
  step: FrameStep,
  transposition: number,
): void {
  if (step.score === undefined) {
    for (const midi of step.midi!.notes) appendMidiOnly(entries, proposals, midi, transposition);
    return;
  }
  if (step.midi === undefined) {
    for (const score of step.score.notes) appendScoreOnly(entries, proposals, score);
    return;
  }
  const remainingMidi = [...step.midi.notes];
  const remainingScore: ScoreNoteEvidence[] = [];
  const onsetDistance = Math.abs(step.score.onset - step.midi.onset);
  for (const score of step.score.notes) {
    const index = remainingMidi.findIndex((midi) => midi.pitch === score.soundingMidi + transposition);
    if (index < 0) {
      remainingScore.push(score);
      continue;
    }
    const midi = remainingMidi.splice(index, 1)[0]!;
    entries.push({
      id: "pending",
      status: "matched",
      scoreNoteId: score.id,
      midiNoteId: midi.id,
      scorePitch: score.soundingMidi,
      midiPitch: midi.pitch,
      onsetDistance,
      confidence: Math.max(0.5, 1 - onsetDistance),
    });
  }
  while (remainingScore.length > 0 && remainingMidi.length > 0) {
    const score = remainingScore.shift()!;
    const midiIndex = closestMidiIndex(score.soundingMidi + transposition, remainingMidi);
    const midi = remainingMidi.splice(midiIndex, 1)[0]!;
    entries.push({
      id: "pending",
      status: "ambiguous",
      scoreNoteId: score.id,
      midiNoteId: midi.id,
      scorePitch: score.soundingMidi,
      midiPitch: midi.pitch,
      onsetDistance,
      confidence: 0.5,
      reason: "pitch-disagreement",
    });
    proposals.push({
      id: "pending",
      type: "pitch-disagreement",
      scoreNoteId: score.id,
      midiNoteId: midi.id,
      suggestedSoundingMidi: clampMidi(midi.pitch - transposition),
      confidence: 0.5,
      autoApplicable: false,
      reason: "Aligned score and MIDI notes disagree on sounding pitch.",
    });
  }
  for (const score of remainingScore) appendScoreOnly(entries, proposals, score);
  for (const midi of remainingMidi) appendMidiOnly(entries, proposals, midi, transposition);
}

function reconcileNearbyFrameBoundaries(
  entries: FusionAlignment["entries"],
  proposals: AlignmentRepairProposal[],
  scoreFrames: readonly ScoreFrame[],
  midiFrames: readonly MidiFrame[],
  transposition: number,
): void {
  const scoreOnsets = new Map(
    scoreFrames.flatMap((frame) => frame.notes.map((note) => [note.id, frame.onset] as const)),
  );
  const midiOnsets = new Map(midiFrames.flatMap((frame) => frame.notes.map((note) => [note.id, frame.onset] as const)));
  for (const scoreEntry of entries.filter((entry) => entry.status === "score-only")) {
    const scoreNoteId = scoreEntry.scoreNoteId;
    const scorePitch = scoreEntry.scorePitch;
    if (scoreNoteId === undefined || scorePitch === undefined) continue;
    const candidates = entries
      .map((entry, index) => ({ entry, index }))
      .filter(
        (candidate) =>
          candidate.entry.status === "midi-only" &&
          candidate.entry.midiNoteId !== undefined &&
          candidate.entry.midiPitch === scorePitch + transposition,
      )
      .map((candidate) => ({
        ...candidate,
        distance: Math.abs(scoreOnsets.get(scoreNoteId)! - midiOnsets.get(candidate.entry.midiNoteId!)!),
      }))
      .filter((candidate) => candidate.distance <= parameters.maxReconciliationOnsetDistance)
      .sort(
        (left, right) =>
          left.distance - right.distance || left.entry.midiNoteId!.localeCompare(right.entry.midiNoteId!),
      );
    const match = candidates[0];
    if (match === undefined) continue;
    scoreEntry.status = "matched";
    scoreEntry.midiNoteId = match.entry.midiNoteId;
    scoreEntry.midiPitch = match.entry.midiPitch;
    scoreEntry.onsetDistance = match.distance;
    scoreEntry.confidence = Math.max(0.5, 1 - match.distance);
    delete scoreEntry.reason;
    entries.splice(match.index, 1);
    removeProposal(proposals, "unsupported-score-note", scoreNoteId);
    removeProposal(proposals, "midi-supported-missing-note", match.entry.midiNoteId!);
  }
}

function removeProposal(
  proposals: AlignmentRepairProposal[],
  type: AlignmentRepairProposal["type"],
  sourceId: string,
): void {
  const index = proposals.findIndex(
    (proposal) => proposal.type === type && (proposal.scoreNoteId === sourceId || proposal.midiNoteId === sourceId),
  );
  if (index >= 0) proposals.splice(index, 1);
}

function appendScoreOnly(
  entries: FusionAlignment["entries"],
  proposals: AlignmentRepairProposal[],
  score: ScoreNoteEvidence,
): void {
  entries.push({
    id: "pending",
    status: "score-only",
    scoreNoteId: score.id,
    scorePitch: score.soundingMidi,
    confidence: 0.6,
    reason: "no-midi-note-aligned",
  });
  proposals.push({
    id: "pending",
    type: "unsupported-score-note",
    scoreNoteId: score.id,
    confidence: 0.6,
    autoApplicable: false,
    reason: "The score note has no aligned MIDI note.",
  });
}

function appendMidiOnly(
  entries: FusionAlignment["entries"],
  proposals: AlignmentRepairProposal[],
  midi: MidiNote,
  transposition: number,
): void {
  entries.push({
    id: "pending",
    status: "midi-only",
    midiNoteId: midi.id,
    midiPitch: midi.pitch,
    confidence: 0.6,
    reason: "no-score-note-aligned",
  });
  proposals.push({
    id: "pending",
    type: "midi-supported-missing-note",
    midiNoteId: midi.id,
    suggestedSoundingMidi: clampMidi(midi.pitch - transposition),
    confidence: 0.6,
    autoApplicable: false,
    reason: "The MIDI note has no aligned score note.",
  });
}

function closestMidiIndex(pitch: number, notes: readonly MidiNote[]): number {
  let bestIndex = 0;
  for (let index = 1; index < notes.length; index += 1) {
    const distance = Math.abs(notes[index]!.pitch - pitch);
    const bestDistance = Math.abs(notes[bestIndex]!.pitch - pitch);
    if (distance < bestDistance || (distance === bestDistance && notes[index]!.id < notes[bestIndex]!.id)) {
      bestIndex = index;
    }
  }
  return bestIndex;
}

function rationalNumber(value: { numerator: number; denominator: number }): number {
  return value.numerator / value.denominator;
}

function clampMidi(value: number): number {
  return Math.max(0, Math.min(127, value));
}

function emptySummary() {
  return {
    matched: 0,
    ambiguous: 0,
    scoreOnly: 0,
    midiOnly: 0,
    scoreCoverage: 0,
    midiCoverage: 0,
    pitchAgreement: 0,
    frameAlignmentCost: 0,
  };
}
