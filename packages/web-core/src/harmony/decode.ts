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
  searchMode?: "beam" | "exact";
  rangeAllowed?: (
    range: { start: ScoreWrittenMoment; end: ScoreWrittenMoment },
    startIndex: number,
    endIndex: number,
  ) => boolean;
  minimumStartIndex?: (endIndex: number) => number;
  onEndIndexComplete?: (endIndex: number) => void;
  beamWidth?: number;
  maxSegments?: number;
  maxSpan?: number;
}): DecodedHarmonySegment[] {
  if (input.searchMode === "exact") return decodeExactHarmonySequence(input);
  const transition = input.transition ?? (() => 0);
  const beamWidth = input.beamWidth ?? 16;
  const maxSegments = input.maxSegments ?? 64;
  const maxSpan = Math.max(1, input.maxSpan ?? input.boundaries.length);
  const states = new Map<number, Array<{ score: number; path: DecodedHarmonySegment[]; chord: ChordSymbolInput }>>();
  states.set(0, [{ score: 0, path: [], chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] } }]);
  for (let endIndex = 1; endIndex < input.boundaries.length; endIndex += 1) {
    const endStates: Array<{ score: number; path: DecodedHarmonySegment[]; chord: ChordSymbolInput }> = [];
    const minimumStartIndex = input.minimumStartIndex?.(endIndex) ?? Math.max(0, endIndex - maxSpan);
    for (let startIndex = minimumStartIndex; startIndex < endIndex; startIndex += 1) {
      const range = { start: input.boundaries[startIndex]!, end: input.boundaries[endIndex]! };
      if (input.rangeAllowed && !input.rangeAllowed(range, startIndex, endIndex)) continue;
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
    input.onEndIndexComplete?.(endIndex);
    if (endIndex + 1 < input.boundaries.length) {
      const pruneBefore = input.minimumStartIndex?.(endIndex + 1) ?? Math.max(0, endIndex + 1 - maxSpan);
      for (const index of states.keys()) if (index < pruneBefore) states.delete(index);
    }
  }
  return states.get(input.boundaries.length - 1)?.sort((a, b) => b.score - a.score)[0]?.path ?? [];
}

function decodeExactHarmonySequence(input: {
  boundaries: readonly ScoreWrittenMoment[];
  candidates: (range: { start: ScoreWrittenMoment; end: ScoreWrittenMoment }) => readonly HarmonyCandidate[];
  transition?: (from: ChordSymbolInput, to: ChordSymbolInput) => number;
  rangeAllowed?: (
    range: { start: ScoreWrittenMoment; end: ScoreWrittenMoment },
    startIndex: number,
    endIndex: number,
  ) => boolean;
  minimumStartIndex?: (endIndex: number) => number;
  onEndIndexComplete?: (endIndex: number) => void;
  maxSpan?: number;
}): DecodedHarmonySegment[] {
  type State = {
    score: number;
    chord: ChordSymbolInput;
    previous?: State;
    segment?: DecodedHarmonySegment;
  };
  const transition = input.transition ?? (() => 0);
  const maxSpan = Math.max(1, input.maxSpan ?? input.boundaries.length);
  const states = new Map<number, Map<string, State>>();
  states.set(0, new Map([["", { score: 0, chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] } }]]));
  for (let endIndex = 1; endIndex < input.boundaries.length; endIndex += 1) {
    const endStates = new Map<string, State>();
    const minimumStartIndex = input.minimumStartIndex?.(endIndex) ?? Math.max(0, endIndex - maxSpan);
    for (let startIndex = minimumStartIndex; startIndex < endIndex; startIndex += 1) {
      const range = { start: input.boundaries[startIndex]!, end: input.boundaries[endIndex]! };
      if (input.rangeAllowed && !input.rangeAllowed(range, startIndex, endIndex)) continue;
      const candidates = input.candidates(range).slice(0, 8);
      for (const previous of states.get(startIndex)?.values() ?? [])
        for (const candidate of candidates) {
          const score =
            previous.score +
            candidate.sequenceScore +
            (previous.segment ? transition(previous.chord, candidate.chord) : 0);
          const key = chordKey(candidate.chord);
          const existing = endStates.get(key);
          if (existing && existing.score >= score) continue;
          const segment: DecodedHarmonySegment = { range, chord: candidate.chord, score, candidate };
          endStates.set(key, { score, previous, segment, chord: candidate.chord });
        }
    }
    states.set(endIndex, endStates);
    input.onEndIndexComplete?.(endIndex);
    if (endIndex + 1 < input.boundaries.length) {
      const pruneBefore = input.minimumStartIndex?.(endIndex + 1) ?? Math.max(0, endIndex + 1 - maxSpan);
      for (const index of states.keys()) if (index < pruneBefore) states.delete(index);
    }
  }
  const best = [...(states.get(input.boundaries.length - 1)?.values() ?? [])].sort((a, b) => b.score - a.score)[0];
  const path: DecodedHarmonySegment[] = [];
  for (let state = best; state?.segment; state = state.previous) path.push(state.segment);
  return path.reverse();
}

function chordKey(chord: ChordSymbolInput): string {
  return JSON.stringify(chord);
}
