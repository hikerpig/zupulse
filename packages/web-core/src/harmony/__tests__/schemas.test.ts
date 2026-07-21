import { describe, expect, it } from "vitest";
import { chordSymbolSchema, harmonyAnalysisDocumentSchema, scoreWrittenRangeSchema } from "../schemas";

describe("harmony schemas", () => {
  it("round-trips extended altered slash chords with canonical degrees", () => {
    const chord = chordSymbolSchema.parse({
      root: { step: "C", alter: 0 },
      kind: "dominant",
      extension: 13,
      degrees: [
        { operation: "alter", value: 13, alter: -1 },
        { operation: "add", value: 11, alter: 0 },
        { operation: "alter", value: 9, alter: -1 },
      ],
      bass: { step: "E", alter: 0 },
    });

    expect(chord.degrees).toEqual([
      { operation: "alter", value: 9, alter: -1 },
      { operation: "add", value: 11, alter: 0 },
      { operation: "alter", value: 13, alter: -1 },
    ]);
    expect(chordSymbolSchema.parse(JSON.parse(JSON.stringify(chord)))).toEqual(chord);
  });

  it.each([
    { kind: "dominant", extension: undefined },
    { kind: "half-diminished", extension: 9 },
    { kind: "power", extension: 7 },
  ])("rejects invalid kind/extension combination %#", (variant) => {
    expect(() => chordSymbolSchema.parse({ root: { step: "C", alter: 0 }, degrees: [], ...variant })).toThrow();
  });

  it("rejects duplicate degree operations and non-positive ranges", () => {
    expect(() =>
      chordSymbolSchema.parse({
        root: { step: "C", alter: 0 },
        kind: "major",
        degrees: [
          { operation: "add", value: 9, alter: 0 },
          { operation: "add", value: 9, alter: 0 },
        ],
      }),
    ).toThrow();
    expect(() =>
      scoreWrittenRangeSchema.parse({
        start: { measureIndex: 1, offsetTicks: 2 },
        end: { measureIndex: 1, offsetTicks: 2 },
      }),
    ).toThrow();
  });

  it("omits optional fields instead of serializing undefined", () => {
    const document = harmonyAnalysisDocumentSchema.parse({
      schemaVersion: "1.0.0",
      libraryScoreId: "00000000-0000-4000-8000-000000000001",
      sourceContentHash: "a".repeat(64),
      documentVersion: 0,
      activeRevision: {
        id: "00000000-0000-4000-8000-000000000002",
        algorithmVersion: "rules-1",
        createdAt: "2026-07-15T00:00:00.000Z",
        parameters: { scope: { includedTrackIds: ["track-1"] }, topK: 8, decisionThreshold: 0.6 },
        segments: [],
      },
      corrections: [],
      annotationTarget: { trackId: "track-1", staffIndex: 0 },
      updatedAt: "2026-07-15T00:00:00.000Z",
    });
    expect(JSON.stringify(document)).not.toContain("undefined");
    expect(document.activeRevision.segments).toEqual([]);
  });

  it("compacts persisted analysis alternatives and scores", () => {
    const document = harmonyAnalysisDocumentSchema.parse({
      schemaVersion: "1.0.0",
      libraryScoreId: "00000000-0000-4000-8000-000000000001",
      sourceContentHash: "a".repeat(64),
      documentVersion: 0,
      activeRevision: {
        id: "00000000-0000-4000-8000-000000000002",
        algorithmVersion: "rules-1",
        createdAt: "2026-07-15T00:00:00.000Z",
        parameters: { scope: { includedTrackIds: ["track-1"] }, topK: 8, decisionThreshold: 0.666 },
        segments: [
          {
            status: "resolved",
            range: { start: { measureIndex: 0, offsetTicks: 0 }, end: { measureIndex: 0, offsetTicks: 1 } },
            chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] },
            confidence: 0.987,
            alternatives: [
              {
                chord: { root: { step: "G", alter: 0 }, kind: "major", degrees: [] },
                localScore: 12.345,
                sequenceScore: 6.789,
                confidence: 0.665,
              },
              {
                chord: { root: { step: "F", alter: 0 }, kind: "major", degrees: [] },
                localScore: 9.876,
                sequenceScore: 5.432,
                confidence: 0.666,
              },
            ],
          },
        ],
      },
      corrections: [],
      annotationTarget: { trackId: "track-1", staffIndex: 0 },
      updatedAt: "2026-07-15T00:00:00.000Z",
    });

    expect(document.activeRevision.parameters.decisionThreshold).toBe(0.67);
    expect(document.activeRevision.segments[0]).toMatchObject({ confidence: 0.99 });
    expect(document.activeRevision.segments[0]?.alternatives).toEqual([
      expect.objectContaining({ localScore: 9.88, sequenceScore: 5.43, confidence: 0.67 }),
    ]);
  });
});
