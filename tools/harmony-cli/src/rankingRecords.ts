import {
  analyzeHarmonyRules,
  buildHarmonyFeatureCache,
  createHarmonyRankerFeatures,
  type ChordSymbolInput,
  type HarmonyAnalysisInput,
  type ScoreWrittenRange,
} from "@zupulse/web-core";
import type { V3DatasetRole } from "./evaluationProtocol";

type RankingGold = { range: ScoreWrittenRange; weight: number; chord?: ChordSymbolInput };

export type HarmonyRankingRecord = {
  id: string;
  corpus: string;
  groupId: string;
  range: ScoreWrittenRange;
  weight: number;
  outcome: "oracle-hit" | "oracle-miss";
  primaryIndex: number;
  targetIndex?: number;
  candidates: Array<{
    chord: ChordSymbolInput;
    features: number[];
    ruleLocalScore: number;
    ruleSequenceScore: number;
  }>;
};

type RankingRecordRequest = {
  corpus: string;
  groupId: string;
  role: V3DatasetRole;
  input: HarmonyAnalysisInput;
  includedTrackIds: readonly string[];
  gold: readonly RankingGold[];
};

export function createHarmonyRankingRecords(request: RankingRecordRequest): HarmonyRankingRecord[] {
  if (request.role !== "train")
    throw new Error(`ranking records require train role: ${request.groupId} is ${request.role}`);
  return createRecords(request);
}

export function createHarmonyRankingEvaluationRecords(request: RankingRecordRequest): HarmonyRankingRecord[] {
  if (request.role !== "tune")
    throw new Error(`ranking evaluation records require tune role: ${request.groupId} is ${request.role}`);
  return createRecords(request);
}

function createRecords(request: RankingRecordRequest): HarmonyRankingRecord[] {
  const included = new Set(request.includedTrackIds);
  const cache = buildHarmonyFeatureCache({
    ticksPerQuarter: request.input.ticksPerQuarter,
    notes: request.input.tracks
      .filter((track) => included.has(track.id) && !track.isPercussion)
      .flatMap((track) => track.staves.flatMap((staff) => staff.notes)),
  });
  const segments = analyzeHarmonyRules(request.input, {
    includedTrackIds: request.includedTrackIds,
    topK: 8,
    decisionThreshold: 0,
  });
  return segments.flatMap((segment) => {
    const gold = bestOverlappingGold(segment.range, request.gold, request.input);
    if (!gold?.chord || segment.alternatives.length === 0) return [];
    const features = cache.forRange(segment.range);
    const candidates = segment.alternatives.slice(0, 8).map((candidate) => ({
      chord: candidate.chord,
      features: createHarmonyRankerFeatures(features, candidate.chord),
      ruleLocalScore: roundScore(candidate.localScore),
      ruleSequenceScore: roundScore(candidate.sequenceScore),
    }));
    const targetIndex = candidates.findIndex((candidate) => sameChord(candidate.chord, gold.chord!));
    const primaryIndex = candidates.findIndex((candidate) =>
      segment.status === "resolved" ? sameChord(candidate.chord, segment.chord) : false,
    );
    return [
      {
        id: `${request.corpus}:${request.groupId}:${segment.range.start.measureIndex}:${segment.range.start.offsetTicks}`,
        corpus: request.corpus,
        groupId: request.groupId,
        range: segment.range,
        weight: overlapTicks(segment.range, gold.range, request.input),
        outcome: targetIndex >= 0 ? ("oracle-hit" as const) : ("oracle-miss" as const),
        primaryIndex,
        ...(targetIndex < 0 ? {} : { targetIndex }),
        candidates,
      },
    ];
  });
}

function bestOverlappingGold(
  range: ScoreWrittenRange,
  gold: readonly RankingGold[],
  input: HarmonyAnalysisInput,
): RankingGold | undefined {
  return [...gold]
    .filter((item) => item.chord !== undefined)
    .map((item) => ({ item, overlap: overlapTicks(range, item.range, input) }))
    .filter(({ overlap }) => overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)[0]?.item;
}

function overlapTicks(a: ScoreWrittenRange, b: ScoreWrittenRange, input: HarmonyAnalysisInput): number {
  const starts = measureStarts(input);
  const start = Math.max(absoluteTick(a.start, starts), absoluteTick(b.start, starts));
  const end = Math.min(absoluteTick(a.end, starts), absoluteTick(b.end, starts));
  return Math.max(0, end - start);
}

function measureStarts(input: HarmonyAnalysisInput): number[] {
  const starts = [0];
  for (const measure of input.measures) starts.push(starts.at(-1)! + measure.durationTicks);
  return starts;
}

function absoluteTick(moment: ScoreWrittenRange["start"], starts: readonly number[]): number {
  return (starts[moment.measureIndex] ?? starts.at(-1)!) + moment.offsetTicks;
}

function sameChord(a: ChordSymbolInput, b: ChordSymbolInput): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function roundScore(value: number): number {
  return Number(value.toFixed(2));
}
