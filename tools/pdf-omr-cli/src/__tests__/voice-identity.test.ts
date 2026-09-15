import { describe, expect, it } from "vitest";
import { evaluateVoiceIdentity, voiceIdentityReportSchema } from "../benchmark/voice-identity";
import type { OmrScoreDraft } from "../schemas";

function draft(voices: number[][]): OmrScoreDraft {
  return {
    schemaVersion: "1.0.0",
    diagnostics: [],
    parts: [
      {
        id: "P1",
        name: "Piano",
        staves: [
          {
            index: 0,
            measures: [0, 1].map((index) => ({
              index,
              voices: voices.map((pitches, v) => ({
                index: v + 1,
                events: pitches.map((pitch, n) => ({
                  type: "note" as const,
                  id: `${index}-${v}-${n}`,
                  soundingMidi: pitch,
                  onset: { numerator: n, denominator: 4 },
                  duration: { numerator: 1, denominator: 4 },
                })),
              })),
            })),
          },
        ],
      },
    ],
  };
}
const scope = { itemId: "test-system", measureRange: [0, 2] as [number, number] };
const evaluate = (p: OmrScoreDraft, e: OmrScoreDraft) => evaluateVoiceIdentity(p, e, scope);
const measures = (d: OmrScoreDraft) => d.parts[0]!.staves[0]!.measures;

describe("voice identity evaluation", () => {
  it("ignores consistent renaming without mutating inputs or legacy scores", () => {
    const expected = draft([[60, 62], [67]]),
      predicted = structuredClone(expected);
    for (const m of measures(predicted)) {
      m.voices[0]!.index = 7;
      m.voices[1]!.index = 3;
    }
    const before = JSON.stringify([predicted, expected]);
    const result = evaluate(predicted, expected);
    expect(result.status).toBe("unique");
    expect(result.adjusted?.joint.f1).toBe(1);
    expect(result.legacy?.joint.f1).toBe(0);
    expect(result.adjusted?.validMeasure).toEqual({ valid: 2, total: 2, rate: 1 });
    expect(JSON.stringify([predicted, expected])).toBe(before);
    expect(voiceIdentityReportSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });

  it("preserves original part namespaces when two voice-1 parts align to a grand staff", () => {
    const expected = draft([[60]]);
    expected.parts[0]!.staves.push({ ...structuredClone(expected.parts[0]!.staves[0]!), index: 1 });
    for (const m of expected.parts[0]!.staves[1]!.measures) m.voices[0]!.index = 5;
    const predicted = structuredClone(expected);
    predicted.parts = expected.parts[0]!.staves.map((s, i) => ({
      id: `source-${i}`,
      name: `staff-${i}`,
      staves: [
        {
          ...structuredClone(s),
          index: 0,
          measures: s.measures.map((m) => ({
            ...structuredClone(m),
            voices: m.voices.map((v) => ({ ...structuredClone(v), index: 1 })),
          })),
        },
      ],
    }));
    const r = evaluate(predicted, expected);
    expect(r.status).toBe("unique");
    expect(r.adjusted?.joint.f1).toBe(1);
    expect(r.mapping).toHaveLength(2);
    expect(r.predictedVoices.map((v) => v.originalPartId)).toEqual(["source-0", "source-1"]);
  });

  it.each(["merge", "split"])("penalizes a real voice %s", (mode) => {
    const two = draft([[60, 62], [67]]),
      one = structuredClone(two);
    for (const m of measures(one)) {
      m.voices[0]!.events.push(...m.voices[1]!.events);
      m.voices.splice(1);
    }
    const r = mode === "merge" ? evaluate(one, two) : evaluate(two, one);
    expect(r.status).toBe("unique");
    expect(r.adjusted?.joint.f1).toBeCloseTo(2 / 3);
    expect(r.adjusted?.validMeasure.valid).toBe(0);
  });

  it("does not remap voices independently in each measure", () => {
    const e = draft([[60, 62], [67]]),
      p = structuredClone(e);
    measures(p)[1]!.voices.reverse();
    measures(p)[1]!.voices.forEach((v, i) => {
      v.index = i + 1;
    });
    const r = evaluate(p, e);
    expect(r.status).toBe("ambiguous");
    expect(r.adjusted).toBeUndefined();
  });

  it("withholds adjusted metrics for identical-voice ambiguity and rejects fabricated output", () => {
    const e = draft([[60], [60]]),
      r = evaluate(e, e);
    expect(r.status).toBe("ambiguous");
    expect(r.adjusted).toBeUndefined();
    expect(r.eventCounts.predicted.notes).toBe(4);
    expect(
      voiceIdentityReportSchema.safeParse({ ...r, adjusted: evaluate(draft([[60]]), draft([[60]])).adjusted }).success,
    ).toBe(false);
  });

  it("keeps a crossing voice whole and penalizes a wrong staff", () => {
    const e = draft([[60]]);
    e.parts[0]!.staves.push({ index: 1, measures: [{ index: 0, voices: [] }, measures(e).pop()!] });
    measures(e).push({ index: 1, voices: [] });
    const p = structuredClone(e);
    for (const s of p.parts[0]!.staves) for (const m of s.measures) for (const v of m.voices) v.index = 8;
    expect(evaluate(p, e).adjusted?.joint.f1).toBe(1);
    expect(evaluate(p, e).mapping).toHaveLength(1);
    measures(p)[1]!.voices = p.parts[0]!.staves[1]!.measures[1]!.voices;
    p.parts[0]!.staves[1]!.measures[1]!.voices = [];
    expect(evaluate(p, e).adjusted?.joint.f1).toBe(0.5);
  });

  it.each(["note", "rest"])("retains duplicate %s multiplicity", (type) => {
    const e = draft([[60]]);
    if (type === "rest")
      for (const m of measures(e))
        m.voices[0]!.events = [
          {
            type: "rest",
            id: "r",
            onset: { numerator: 0, denominator: 1 },
            duration: { numerator: 1, denominator: 4 },
          },
        ];
    const p = structuredClone(e);
    measures(p)[0]!.voices[0]!.events.push(structuredClone(measures(p)[0]!.voices[0]!.events[0]!));
    expect(evaluate(p, e).adjusted?.joint.falsePositive).toBe(1);
  });

  it("retains no-overlap and empty denominators without manufacturing mappings", () => {
    const r = evaluate(draft([[60]]), draft([[67]]));
    expect(r.status).toBe("unique");
    expect(r.mapping).toEqual([]);
    expect(r.adjusted?.joint).toMatchObject({ truePositive: 0, falsePositive: 2, falseNegative: 2, f1: 0 });
    expect(evaluate(draft([]), draft([[60]])).adjusted?.joint.falseNegative).toBe(2);
    expect(evaluate(draft([]), draft([])).adjusted?.joint.f1).toBe(1);
  });

  it.each(["tie", "tuplet", "onset", "duration", "pitch"])("does not waive %s errors", (field) => {
    const e = draft([[60]]),
      p = structuredClone(e),
      event = measures(p)[0]!.voices[0]!.events[0]!;
    if (event.type !== "note") throw new Error("note required");
    if (field === "tie") event.tie = "start";
    if (field === "tuplet") event.tuplet = { actualNotes: 3, normalNotes: 2 };
    if (field === "onset") event.onset = { numerator: 1, denominator: 4 };
    if (field === "duration") event.duration = { numerator: 1, denominator: 2 };
    if (field === "pitch") event.soundingMidi = 61;
    expect(evaluate(p, e).adjusted?.joint.f1).toBe(0.5);
  });

  it("fails closed for the voice bound, invalid source identity and topology", () => {
    expect(evaluate(draft(Array.from({ length: 13 }, (_, i) => [60 + i])), draft([[60]])).reason).toBe(
      "resource-limit",
    );
    const p = draft([[60]]);
    p.parts.push(structuredClone(p.parts[0]!));
    expect(evaluate(p, draft([[60]])).reason).toBe("source-identity-invalid");
    p.parts[1]!.id = "P2";
    expect(evaluate(p, draft([[60]])).reason).toBe("part-alignment-unavailable");
  });

  it("finds the global optimum instead of greedily consuming the largest first edge", () => {
    const p = draft([
        [60, 64],
        [60, 62],
      ]),
      e = draft([[60, 62], [64]]);
    for (const d of [p, e])
      for (const m of measures(d))
        for (const v of m.voices) for (const event of v.events) event.onset = { numerator: 0, denominator: 1 };
    const r = evaluate(p, e);
    expect(r.status).toBe("unique");
    expect(r.adjusted?.joint).toMatchObject({ truePositive: 6, falsePositive: 2, falseNegative: 0 });
    expect(r.mapping?.map((pair) => [pair.predicted.voiceIndex, pair.expected.voiceIndex])).toEqual([
      [1, 2],
      [2, 1],
    ]);
  });

  it("supports the voice boundary and reports invalid intervals and excessive events", () => {
    const d = draft(Array.from({ length: 12 }, (_, i) => [60 + i]));
    expect(evaluate(d, d).adjusted?.joint.f1).toBe(1);
    expect(evaluateVoiceIdentity(d, d, { ...scope, measureRange: [0, 3] }).reason).toBe("interval-invalid");
    const huge = draft([[60]]),
      v = measures(huge)[0]!.voices[0]!;
    v.events = Array.from({ length: 20_001 }, () => structuredClone(v.events[0]!));
    expect(evaluate(huge, d).reason).toBe("resource-limit");
    const invalid = draft([[60]]);
    invalid.parts[0]!.id = "";
    expect(evaluate(invalid, d).reason).toBe("source-identity-invalid");
  });
});
