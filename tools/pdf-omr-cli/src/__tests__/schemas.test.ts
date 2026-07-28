import { describe, expect, it } from "vitest";
import { omrRunManifestSchema, omrScoreDraftSchema, pdfOmrHelpReportSchema, sha256Schema } from "../schemas";

const hash = "a".repeat(64);

describe("PDF OMR schemas", () => {
  it("accepts a strict help envelope", () => {
    expect(
      pdfOmrHelpReportSchema.parse({
        schemaVersion: "1.0.0",
        command: "help",
        usage: "pdf-omr <command>",
      }),
    ).toEqual({
      schemaVersion: "1.0.0",
      command: "help",
      usage: "pdf-omr <command>",
    });
    expect(() =>
      pdfOmrHelpReportSchema.parse({
        schemaVersion: "1.0.0",
        command: "help",
        usage: "pdf-omr <command>",
        extra: true,
      }),
    ).toThrow();
  });

  it("requires lowercase SHA-256 values", () => {
    expect(sha256Schema.parse(hash)).toBe(hash);
    expect(() => sha256Schema.parse(hash.toUpperCase())).toThrow();
    expect(() => sha256Schema.parse("a".repeat(63))).toThrow();
  });

  it("validates run status against completion fields", () => {
    const base = {
      schemaVersion: "1.0.0",
      runId: "run-1",
      inputSha256: hash,
      engine: { id: "audiveris", version: "5.11.0" },
      parameters: {},
      preprocess: { id: "none", version: "1.0.0" },
      startedAt: "2026-07-28T10:00:00.000Z",
      artifactSha256: {},
    };
    expect(omrRunManifestSchema.parse({ ...base, status: "running" })).not.toHaveProperty("completedAt");
    expect(
      omrRunManifestSchema.parse({
        ...base,
        status: "succeeded",
        completedAt: "2026-07-28T10:00:01.000Z",
      }),
    ).toMatchObject({ status: "succeeded" });
    expect(() => omrRunManifestSchema.parse({ ...base, status: "succeeded" })).toThrow();
    expect(() =>
      omrRunManifestSchema.parse({
        ...base,
        status: "running",
        completedAt: "2026-07-28T10:00:01.000Z",
      }),
    ).toThrow();
  });

  it("rejects invalid rational values and confidence", () => {
    const draft = {
      schemaVersion: "1.0.0",
      parts: [
        {
          id: "part-1",
          name: "Piano",
          staves: [
            {
              index: 0,
              measures: [
                {
                  index: 0,
                  timeSignature: { numerator: 4, denominator: 4 },
                  duration: { numerator: 1, denominator: 1 },
                  voices: [
                    {
                      index: 1,
                      events: [
                        {
                          type: "note",
                          id: "note-1",
                          onset: { numerator: 0, denominator: 1 },
                          duration: { numerator: 1, denominator: 4 },
                          writtenPitch: { step: "C", alter: 0, octave: 4 },
                          soundingMidi: 60,
                          confidence: 0.9,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      diagnostics: [],
    };
    expect(omrScoreDraftSchema.parse(draft)).toMatchObject({ schemaVersion: "1.0.0" });
    const invalidDuration = structuredClone(draft);
    invalidDuration.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!.duration.denominator = 0;
    expect(() => omrScoreDraftSchema.parse(invalidDuration)).toThrow();
    const invalidConfidence = structuredClone(draft);
    invalidConfidence.parts[0]!.staves[0]!.measures[0]!.voices[0]!.events[0]!.confidence = 1.1;
    expect(() => omrScoreDraftSchema.parse(invalidConfidence)).toThrow();
  });
});
