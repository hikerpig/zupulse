import { normalizeRational } from "../rational";
import type { OmrScoreDraft } from "../schemas";
import { alignExact } from "./symbolic-alignment";

export type MetricCounts = {
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  precision: number;
  recall: number;
  f1: number;
};

export type SymbolicMetrics = {
  pitch: MetricCounts;
  onset: MetricCounts;
  duration: MetricCounts;
  joint: MetricCounts;
  rest: MetricCounts;
  staff: MetricCounts;
  voice: MetricCounts;
  tie: MetricCounts;
  tuplet: MetricCounts;
  repeat: MetricCounts;
  validMeasure: { valid: number; total: number; rate: number };
};

type SymbolicEvent = {
  part: string;
  staff: number;
  measure: number;
  voice: number;
  type: "note" | "rest";
  pitch: string;
  onset: string;
  duration: string;
  tie: string;
  tuplet: string;
};

export function computeSymbolicMetrics(predicted: OmrScoreDraft, expected: OmrScoreDraft): SymbolicMetrics {
  const predictedEvents = flattenEvents(predicted);
  const expectedEvents = flattenEvents(expected);
  const predictedNotes = predictedEvents.filter((event) => event.type === "note");
  const expectedNotes = expectedEvents.filter((event) => event.type === "note");
  const predictedRests = predictedEvents.filter((event) => event.type === "rest");
  const expectedRests = expectedEvents.filter((event) => event.type === "rest");
  const location = (event: SymbolicEvent) => `${event.part}|${event.measure}|${event.type}`;
  const core = (event: SymbolicEvent) => `${location(event)}|${event.pitch}|${event.onset}|${event.duration}`;
  const joint = (event: SymbolicEvent) =>
    `${core(event)}|staff:${event.staff}|voice:${event.voice}|tie:${event.tie}|tuplet:${event.tuplet}`;
  const predictedRepeats = flattenRepeats(predicted);
  const expectedRepeats = flattenRepeats(expected);
  const expectedMeasures = measureKeys(expected);
  const predictedByMeasure = groupByMeasure(predictedEvents);
  const expectedByMeasure = groupByMeasure(expectedEvents);
  const valid = expectedMeasures.filter((measure) => {
    const predictedInMeasure = predictedByMeasure.get(measure) ?? [];
    const expectedInMeasure = expectedByMeasure.get(measure) ?? [];
    const aligned = alignExact(predictedInMeasure, expectedInMeasure, joint);
    return aligned.unmatchedPredicted.length === 0 && aligned.unmatchedExpected.length === 0;
  }).length;

  return {
    pitch: counts(predictedNotes, expectedNotes, (event) => `${location(event)}|${event.pitch}`),
    onset: counts(predictedEvents, expectedEvents, (event) => `${location(event)}|${event.onset}`),
    duration: counts(predictedEvents, expectedEvents, (event) => `${location(event)}|${event.duration}`),
    joint: counts(predictedEvents, expectedEvents, joint),
    rest: counts(predictedRests, expectedRests, joint),
    staff: counts(predictedEvents, expectedEvents, (event) => `${core(event)}|staff:${event.staff}`),
    voice: counts(predictedEvents, expectedEvents, (event) => `${core(event)}|voice:${event.voice}`),
    tie: counts(predictedNotes, expectedNotes, (event) => `${core(event)}|tie:${event.tie}`),
    tuplet: counts(predictedNotes, expectedNotes, (event) => `${core(event)}|tuplet:${event.tuplet}`),
    repeat: counts(predictedRepeats, expectedRepeats, (value) => value),
    validMeasure: {
      valid,
      total: expectedMeasures.length,
      rate: expectedMeasures.length === 0 ? 1 : valid / expectedMeasures.length,
    },
  };
}

export function aggregateSymbolicMetrics(items: readonly SymbolicMetrics[]): SymbolicMetrics {
  const metricNames = [
    "pitch",
    "onset",
    "duration",
    "joint",
    "rest",
    "staff",
    "voice",
    "tie",
    "tuplet",
    "repeat",
  ] as const;
  const aggregated = Object.fromEntries(
    metricNames.map((name) => [
      name,
      withRates({
        truePositive: sum(items, (item) => item[name].truePositive),
        falsePositive: sum(items, (item) => item[name].falsePositive),
        falseNegative: sum(items, (item) => item[name].falseNegative),
      }),
    ]),
  ) as Omit<SymbolicMetrics, "validMeasure">;
  const valid = sum(items, (item) => item.validMeasure.valid);
  const total = sum(items, (item) => item.validMeasure.total);
  return {
    ...aggregated,
    validMeasure: { valid, total, rate: total === 0 ? 1 : valid / total },
  };
}

export function f1FromCounts(input: { truePositive: number; falsePositive: number; falseNegative: number }): number {
  return withRates(input).f1;
}

function counts<T>(predicted: readonly T[], expected: readonly T[], key: (value: T) => string): MetricCounts {
  const alignment = alignExact(predicted, expected, key);
  return withRates({
    truePositive: alignment.matches.length,
    falsePositive: alignment.unmatchedPredicted.length,
    falseNegative: alignment.unmatchedExpected.length,
  });
}

function withRates(input: { truePositive: number; falsePositive: number; falseNegative: number }): MetricCounts {
  const precisionDenominator = input.truePositive + input.falsePositive;
  const recallDenominator = input.truePositive + input.falseNegative;
  const precision =
    precisionDenominator === 0 ? (recallDenominator === 0 ? 1 : 0) : input.truePositive / precisionDenominator;
  const recall =
    recallDenominator === 0 ? (precisionDenominator === 0 ? 1 : 0) : input.truePositive / recallDenominator;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { ...input, precision, recall, f1 };
}

function flattenEvents(draft: OmrScoreDraft): SymbolicEvent[] {
  return draft.parts.flatMap((part) =>
    part.staves.flatMap((staff) =>
      staff.measures.flatMap((measure) =>
        measure.voices.flatMap((voice) =>
          voice.events.map((event) => ({
            part: part.id,
            staff: staff.index,
            measure: measure.index,
            voice: voice.index,
            type: event.type,
            pitch:
              event.type === "note"
                ? event.writtenPitch === undefined
                  ? `midi:${event.soundingMidi ?? "missing"}`
                  : `${event.writtenPitch.step}:${event.writtenPitch.alter}:${event.writtenPitch.octave}`
                : "",
            onset: rationalKey(event.onset),
            duration: rationalKey(event.duration),
            tie: event.type === "note" ? (event.tie ?? "") : "",
            tuplet:
              event.type === "note" && event.tuplet !== undefined
                ? `${event.tuplet.actualNotes}:${event.tuplet.normalNotes}`
                : "",
          })),
        ),
      ),
    ),
  );
}

function flattenRepeats(draft: OmrScoreDraft): string[] {
  return draft.parts.flatMap((part) =>
    part.staves.flatMap((staff) =>
      staff.measures
        .filter((measure) => measure.repeat !== undefined)
        .map(
          (measure) =>
            `${part.id}|${staff.index}|${measure.index}|${measure.repeat!.forward}|${measure.repeat!.backward}`,
        ),
    ),
  );
}

function measureKeys(draft: OmrScoreDraft): string[] {
  return draft.parts.flatMap((part) =>
    part.staves.flatMap((staff) => staff.measures.map((measure) => `${part.id}|${staff.index}|${measure.index}`)),
  );
}

function groupByMeasure(events: readonly SymbolicEvent[]): Map<string, SymbolicEvent[]> {
  const result = new Map<string, SymbolicEvent[]>();
  for (const event of events) {
    const key = `${event.part}|${event.staff}|${event.measure}`;
    const values = result.get(key) ?? [];
    values.push(event);
    result.set(key, values);
  }
  return result;
}

function rationalKey(value: { numerator: number; denominator: number }): string {
  const normalized = normalizeRational(value);
  return `${normalized.numerator}/${normalized.denominator}`;
}

function sum<T>(items: readonly T[], select: (item: T) => number): number {
  return items.reduce((total, item) => total + select(item), 0);
}
