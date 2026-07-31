import type { PerformanceEvidence } from "../midi/schemas";
import { fusionCompatibilitySchema, type FusionCompatibility, type ScoreEvidence } from "./schemas";

const minimumChromaSimilarity = 0.75;
const minimumNoteCountRatio = 0.5;
const maximumNoteCountRatio = 2;
const ambiguityMargin = 0.01;

export function assessFusionCompatibility(score: ScoreEvidence, performance: PerformanceEvidence): FusionCompatibility {
  const scorePitches = score.notes.map((note) => note.soundingMidi);
  const midiPitches = performance.notes
    .filter((note) => !note.flags.includes("percussion-channel"))
    .map((note) => note.pitch);
  const noteCountRatio = scorePitches.length === 0 ? 0 : midiPitches.length / scorePitches.length;
  const candidates = Array.from({ length: 25 }, (_, index) => index - 12)
    .map((transposition) => candidate(scorePitches, midiPitches, transposition))
    .sort(
      (left, right) =>
        right.combinedScore - left.combinedScore ||
        Math.abs(left.transposition) - Math.abs(right.transposition) ||
        left.transposition - right.transposition,
    );
  const best = candidates[0]!;
  const second = candidates[1]!;
  const transpositionMargin = Math.max(0, best.combinedScore - second.combinedScore);
  const reasons: string[] = [];
  if (scorePitches.length === 0 || midiPitches.length === 0) reasons.push("no-alignable-notes");
  if (best.chromaSimilarity < minimumChromaSimilarity) reasons.push("chroma-similarity-too-low");
  if (noteCountRatio < minimumNoteCountRatio || noteCountRatio > maximumNoteCountRatio) {
    reasons.push("note-count-ratio-out-of-range");
  }
  const incompatible = reasons.length > 0;
  if (!incompatible && transpositionMargin < ambiguityMargin) reasons.push("transposition-ambiguous");
  return fusionCompatibilitySchema.parse({
    status: incompatible ? "incompatible" : reasons.length > 0 ? "ambiguous" : "compatible",
    detectedTransposition: best.transposition,
    chromaSimilarity: best.chromaSimilarity,
    transpositionMargin,
    scoreNoteCount: scorePitches.length,
    midiNoteCount: midiPitches.length,
    noteCountRatio,
    reasons,
  });
}

function candidate(scorePitches: readonly number[], midiPitches: readonly number[], transposition: number) {
  const scoreHistogram = pitchClassHistogram(scorePitches.map((pitch) => pitch + transposition));
  const midiHistogram = pitchClassHistogram(midiPitches);
  const chromaSimilarity = Math.min(1, cosineSimilarity(scoreHistogram, midiHistogram));
  const scoreMean = mean(scorePitches) + transposition;
  const midiMean = mean(midiPitches);
  const registerAgreement =
    scorePitches.length === 0 || midiPitches.length === 0 ? 0 : Math.max(0, 1 - Math.abs(scoreMean - midiMean) / 12);
  return {
    transposition,
    chromaSimilarity,
    combinedScore: chromaSimilarity * 0.9 + registerAgreement * 0.1,
  };
}

function pitchClassHistogram(pitches: readonly number[]): number[] {
  const result = Array.from({ length: 12 }, () => 0);
  for (const pitch of pitches) result[((pitch % 12) + 12) % 12]! += 1;
  return result;
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  const dot = left.reduce((total, value, index) => total + value * right[index]!, 0);
  const leftLength = Math.sqrt(left.reduce((total, value) => total + value * value, 0));
  const rightLength = Math.sqrt(right.reduce((total, value) => total + value * value, 0));
  return leftLength === 0 || rightLength === 0 ? 0 : dot / (leftLength * rightLength);
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}
