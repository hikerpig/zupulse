import { describe, expect, it } from "vitest";
import { buildTopologyEvidenceReport } from "../benchmark/topology-evidence";
import type { OmrScoreDraft } from "../schemas";
import { musicXmlReadyDraft } from "./fixtures/musicxml-ready-draft";

describe("topology evidence", () => {
  it("classifies header-only, duplicate, and contentful extra parts without exposing expected note facts", () => {
    const expected = grandStaffDraft();
    const headerOnly = threePartDraft([60, 62, null]);
    const duplicate = threePartDraft([60, 62, 60]);
    const contentful = threePartDraft([60, 62, 64]);

    const report = buildTopologyEvidenceReport({
      sourceReportSha256: "a".repeat(64),
      items: [
        failedItem("header-only", headerOnly, expected),
        failedItem("duplicate", duplicate, expected),
        failedItem("contentful", contentful, expected),
      ],
    });

    expect(report.summary).toEqual({
      attempted: 3,
      classifications: {
        "contentful-extra-part": 1,
        "duplicate-extra-part": 1,
        "header-only-extra-part": 1,
      },
    });
    expect(report.items.map((item) => [item.itemId, item.classification])).toEqual([
      ["contentful", "contentful-extra-part"],
      ["duplicate", "duplicate-extra-part"],
      ["header-only", "header-only-extra-part"],
    ]);
    expect(report.items.find((item) => item.itemId === "contentful")).toMatchObject({
      predicted: {
        partCount: 3,
        staffCount: 3,
        parts: [
          { eventCount: 4, pitchedEventCount: 2, minimumSoundingMidi: 60, maximumSoundingMidi: 60 },
          { eventCount: 4, pitchedEventCount: 2, minimumSoundingMidi: 62, maximumSoundingMidi: 62 },
          { eventCount: 4, pitchedEventCount: 2, minimumSoundingMidi: 64, maximumSoundingMidi: 64 },
        ],
      },
      expectedTopology: { partCount: 1, staffCount: 2, staffCountsByPart: [2] },
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("expectedParts");
    expect(serialized).not.toContain("groundTruth");
    expect(serialized).not.toContain("events");
  });

  it("separates empty parts, unresolved roles, and engine failures", () => {
    const expected = grandStaffDraft();
    const unresolved = structuredClone(expected);
    unresolved.parts.push(structuredClone(unresolved.parts[0]!));

    const report = buildTopologyEvidenceReport({
      sourceReportSha256: "b".repeat(64),
      items: [
        {
          itemId: "empty",
          error: {
            code: "ENGINE_OUTPUT_INVALID",
            message: "LEGATO output contains an empty page part",
            context: { reason: "empty-page-part" },
          },
        },
        failedItem("unresolved", unresolved, expected, "part-role-unresolved"),
        {
          itemId: "engine-failure",
          error: { code: "ENGINE_EXECUTION_FAILED", message: "engine failed" },
        },
      ],
    });

    expect(report.items.map((item) => [item.itemId, item.classification])).toEqual([
      ["empty", "empty-part"],
      ["engine-failure", "engine-failure"],
      ["unresolved", "unresolved-role"],
    ]);
  });

  it("omits machine-specific error context", () => {
    const report = buildTopologyEvidenceReport({
      sourceReportSha256: "c".repeat(64),
      items: [
        {
          itemId: "engine-failure",
          error: {
            code: "ENGINE_EXECUTION_FAILED",
            message: "engine failed at /private/tmp/model",
            context: { reason: "inference-failed", path: "/private/tmp/model" },
          },
        },
      ],
    });

    expect(report.items[0]).toEqual({
      itemId: "engine-failure",
      error: { code: "ENGINE_EXECUTION_FAILED", reason: "inference-failed" },
      classification: "engine-failure",
    });
    expect(JSON.stringify(report)).not.toContain("/private/tmp");
  });
});

function failedItem(itemId: string, predicted: OmrScoreDraft, expected: OmrScoreDraft, reason = "part-count-mismatch") {
  return {
    itemId,
    error: {
      code: "BENCHMARK_EVALUATION_LIMITATION" as const,
      message: "benchmark evaluation cannot establish part identity",
      context: { reason },
    },
    predicted,
    expected,
  };
}

function grandStaffDraft(): OmrScoreDraft {
  const draft = musicXmlReadyDraft();
  const lower = structuredClone(draft.parts[0]!.staves[0]!);
  lower.index = 2;
  draft.parts[0]!.staves.push(lower);
  return draft;
}

function threePartDraft(pitches: readonly (number | null)[]): OmrScoreDraft {
  const source = musicXmlReadyDraft();
  return {
    ...source,
    parts: pitches.map((pitch, index) => {
      const part = structuredClone(source.parts[0]!);
      part.id = `P${index + 1}`;
      part.name = `P${index + 1}`;
      if (pitch === null) {
        part.staves[0]!.measures.forEach((measure) => {
          measure.voices = [];
        });
      } else {
        part.staves[0]!.measures.forEach((measure) => {
          measure.voices.forEach((voice) => {
            voice.events.forEach((event) => {
              if (event.type !== "rest") event.soundingMidi = pitch;
            });
          });
        });
      }
      return part;
    }),
  };
}
