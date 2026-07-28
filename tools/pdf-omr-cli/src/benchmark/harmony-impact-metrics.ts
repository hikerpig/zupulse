import { calculateIntervalOverlapDiagnostics } from "@zupulse/harmony-cli";
import {
  chordSymbolSchema,
  type HarmonyAnalysisInput,
  type HarmonySegment,
  type ScoreWrittenMoment,
} from "@zupulse/web-core";

export type HarmonyImpactMetrics = {
  overlap: {
    mappedDurationTicks: number;
    correctDurationTicks: number;
    wrongDurationTicks: number;
    unresolvedDurationTicks: number;
    accuracy: number;
    resolvedPrecision: number;
    resolvedCoverage: number;
  };
  boundaries: {
    expected: number;
    predicted: number;
    truePositive: number;
    overSegmented: number;
    underSegmented: number;
    f1: number;
  };
  falseConfidentChord: {
    wrong: number;
    resolved: number;
    rate: number;
  };
  status: {
    omrBlocked: number;
    harmonyUnresolved: number;
    unsupportedGold: number;
  };
};

export function calculateHarmonyImpactMetrics(options: {
  input: HarmonyAnalysisInput;
  goldSegments: readonly HarmonySegment[];
  omr: { status: "blocked" } | { status: "analyzed"; segments: readonly HarmonySegment[] };
  confidenceThreshold: number;
}): HarmonyImpactMetrics {
  const gold = options.goldSegments.flatMap((segment) =>
    segment.status === "resolved" ? [{ range: segment.range, chord: segment.chord }] : [],
  );
  const predicted = options.omr.status === "analyzed" ? options.omr.segments : [];
  const diagnostics = calculateIntervalOverlapDiagnostics({
    ticksPerQuarter: options.input.ticksPerQuarter,
    measures: options.input.measures,
    legalMoments: legalMoments(options.input),
    gold,
    predicted,
  });
  const confident = predicted.filter(
    (segment): segment is Extract<HarmonySegment, { status: "resolved" }> =>
      segment.status === "resolved" && segment.confidence >= options.confidenceThreshold,
  );
  const wrong = confident.filter(
    (segment) =>
      !options.goldSegments.some(
        (goldSegment) =>
          goldSegment.status === "resolved" &&
          rangesOverlap(segment.range, goldSegment.range, options.input) &&
          sameChord(segment.chord, goldSegment.chord),
      ),
  ).length;
  return {
    overlap: diagnostics.overlap,
    boundaries: diagnostics.boundaries,
    falseConfidentChord: {
      wrong,
      resolved: confident.length,
      rate: confident.length === 0 ? 0 : wrong / confident.length,
    },
    status: {
      omrBlocked: options.omr.status === "blocked" ? 1 : 0,
      harmonyUnresolved:
        options.omr.status === "analyzed"
          ? options.omr.segments.filter((segment) => segment.status === "unresolved").length
          : 0,
      unsupportedGold: options.goldSegments.filter((segment) => segment.status === "unresolved").length,
    },
  };
}

function legalMoments(input: HarmonyAnalysisInput): ScoreWrittenMoment[] {
  const moments: ScoreWrittenMoment[] = input.measures.flatMap((measure) => [
    { measureIndex: measure.index, offsetTicks: 0 },
    { measureIndex: measure.index, offsetTicks: measure.durationTicks },
  ]);
  for (const track of input.tracks) {
    for (const staff of track.staves) {
      for (const note of staff.notes) moments.push(note.moment);
    }
  }
  return moments;
}

function rangesOverlap(
  left: HarmonySegment["range"],
  right: HarmonySegment["range"],
  input: HarmonyAnalysisInput,
): boolean {
  const absolute = absoluteMoment(input);
  return Math.max(absolute(left.start), absolute(right.start)) < Math.min(absolute(left.end), absolute(right.end));
}

function absoluteMoment(input: HarmonyAnalysisInput): (moment: ScoreWrittenMoment) => number {
  const starts = new Map<number, number>();
  let start = 0;
  for (const measure of input.measures) {
    starts.set(measure.index, start);
    start += measure.durationTicks;
  }
  return (moment) => (starts.get(moment.measureIndex) ?? 0) + moment.offsetTicks;
}

function sameChord(
  left: Extract<HarmonySegment, { status: "resolved" }>["chord"],
  right: Extract<HarmonySegment, { status: "resolved" }>["chord"],
): boolean {
  return JSON.stringify(chordSymbolSchema.parse(left)) === JSON.stringify(chordSymbolSchema.parse(right));
}
