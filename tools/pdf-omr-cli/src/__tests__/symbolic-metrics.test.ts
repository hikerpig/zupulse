import { describe, expect, it } from "vitest";
import { musicXmlReadyDraft } from "./fixtures/musicxml-ready-draft";
import { aggregateSymbolicMetrics, computeSymbolicMetrics, f1FromCounts } from "../benchmark/symbolic-metrics";

describe("symbolic metrics", () => {
  it("defines empty, perfect and partial F1 without NaN", () => {
    expect(f1FromCounts({ truePositive: 0, falsePositive: 0, falseNegative: 0 })).toBe(1);
    expect(f1FromCounts({ truePositive: 0, falsePositive: 1, falseNegative: 0 })).toBe(0);
    expect(f1FromCounts({ truePositive: 1, falsePositive: 1, falseNegative: 1 })).toBe(0.5);
  });

  it("separates pitch, onset, duration and joint errors", () => {
    const expected = musicXmlReadyDraft();
    const predicted = structuredClone(expected);
    const note = predicted.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!;
    if (note.type !== "note") throw new Error("fixture note required");
    note.writtenPitch = { step: "D", alter: 0, octave: 4 };
    note.soundingMidi = 62;

    const metrics = computeSymbolicMetrics(predicted, expected);

    expect(metrics.pitch.f1).toBeLessThan(1);
    expect(metrics.onset.f1).toBe(1);
    expect(metrics.duration.f1).toBe(1);
    expect(metrics.joint.f1).toBeLessThan(1);
    expect(metrics.repeat.f1).toBe(1);
  });

  it("aggregates item counts without averaging away corpus cardinality", () => {
    const perfect = computeSymbolicMetrics(musicXmlReadyDraft(), musicXmlReadyDraft());
    const emptyPrediction = structuredClone(musicXmlReadyDraft());
    for (const measure of emptyPrediction.parts[0]!.staves[0]!.measures) {
      for (const voice of measure.voices) voice.events = [];
    }
    const missed = computeSymbolicMetrics(emptyPrediction, musicXmlReadyDraft());

    const aggregate = aggregateSymbolicMetrics([perfect, missed]);

    expect(aggregate.joint.truePositive).toBe(perfect.joint.truePositive);
    expect(aggregate.joint.falseNegative).toBe(missed.joint.falseNegative);
    expect(aggregate.joint.f1).toBeGreaterThan(0);
    expect(aggregate.joint.f1).toBeLessThan(1);
  });
});
