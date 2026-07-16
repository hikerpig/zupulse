import type { HarmonyCandidate } from "./candidates";
import type { ScoreWrittenMoment } from "./writtenTime";
import type { ChordSymbolInput } from "./schemas";

export type DecodedHarmonySegment = {
  range: { start: ScoreWrittenMoment; end: ScoreWrittenMoment };
  chord: ChordSymbolInput;
  score: number;
  candidate: HarmonyCandidate;
};
export function decodeHarmonySequence(input: {
  boundaries: readonly ScoreWrittenMoment[];
  candidates: (range: { start: ScoreWrittenMoment; end: ScoreWrittenMoment }) => readonly HarmonyCandidate[];
  transition?: (from: ChordSymbolInput, to: ChordSymbolInput) => number;
  beamWidth?: number;
  maxSegments?: number;
  maxSpan?: number;
}): DecodedHarmonySegment[] {
  const transition = input.transition ?? (() => 0);
  const beamWidth = input.beamWidth ?? 16;
  const maxSegments = input.maxSegments ?? 64;
  const maxSpan = Math.max(1, input.maxSpan ?? input.boundaries.length);
  const states = new Map<number, Array<{ score: number; path: DecodedHarmonySegment[]; chord: ChordSymbolInput }>>();
  states.set(0, [{ score: 0, path: [], chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] } }]);
  for (let endIndex = 1; endIndex < input.boundaries.length; endIndex += 1) {
    const endStates: Array<{ score: number; path: DecodedHarmonySegment[]; chord: ChordSymbolInput }> = [];
    for (let startIndex = Math.max(0, endIndex - maxSpan); startIndex < endIndex; startIndex += 1) {
      const range = { start: input.boundaries[startIndex]!, end: input.boundaries[endIndex]! };
      const candidates = input.candidates(range).slice(0, 8);
      for (const previous of states.get(startIndex) ?? [])
        for (const candidate of candidates) {
          const segment: DecodedHarmonySegment = {
            range,
            chord: candidate.chord,
            score:
              previous.score +
              candidate.sequenceScore +
              (previous.path.length ? transition(previous.chord, candidate.chord) : 0),
            candidate,
          };
          endStates.push({ score: segment.score, path: [...previous.path, segment], chord: candidate.chord });
        }
    }
    states.set(endIndex, endStates.sort((a, b) => b.score - a.score).slice(0, Math.min(beamWidth, maxSegments)));
  }
  return states.get(input.boundaries.length - 1)?.sort((a, b) => b.score - a.score)[0]?.path ?? [];
}
