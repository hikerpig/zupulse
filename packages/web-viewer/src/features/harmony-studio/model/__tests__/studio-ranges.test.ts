import { describe, expect, it } from "vitest";
import type { HarmonyAnalysisDocument, HarmonyCorrection } from "@zupulse/web-core";
import { projectStudioRanges } from "../studio-ranges";

const chord = (step: "C" | "F", kind: "major" | "minor") => ({ root: { step, alter: 0 }, kind, degrees: [] });

const range = {
  start: { measureIndex: 0, offsetTicks: 0 },
  end: { measureIndex: 0, offsetTicks: 4 },
};

const analysisChord = chord("C", "major");
const correctedChord = chord("F", "minor");

function documentWith(corrections: readonly HarmonyCorrection[]): HarmonyAnalysisDocument {
  return {
    activeRevision: {
      segments: [{ status: "resolved", range, chord: analysisChord, confidence: 0.9, alternatives: [] }],
    },
    corrections,
    annotationTarget: { trackId: "track-1", staffIndex: 0 },
  } as unknown as HarmonyAnalysisDocument;
}

const correction: HarmonyCorrection = {
  id: "00000000-0000-4000-8000-000000000002",
  range,
  value: { type: "chord", chord: correctedChord },
  updatedAt: "2026-08-05T00:00:00.000Z",
};

describe("projectStudioRanges", () => {
  it("renders a corrected range with origin correction instead of the analysis chord", () => {
    const ranges = projectStudioRanges(undefined, documentWith([correction]));

    expect(ranges).toHaveLength(1);
    expect(ranges[0]?.origin).toBe("correction");
    expect(ranges[0]?.effective).toMatchObject({ type: "chord", chord: correctedChord });
  });

  it("falls back to the analysis revision when no correction or source covers the range", () => {
    const ranges = projectStudioRanges(undefined, documentWith([]));

    expect(ranges).toHaveLength(1);
    expect(ranges[0]?.origin).toBe("analysis");
    expect(ranges[0]?.effective).toMatchObject({ type: "chord", chord: analysisChord });
  });
});
