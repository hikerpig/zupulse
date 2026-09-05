import { describe, expect, it } from "vitest";
import {
  isPianoGrandStaffTopologyExact,
  pianoGrandStaffMappingSchema,
  type PianoGrandStaffTruthPage,
} from "../piano-grand-staff-topology";

describe("isPianoGrandStaffTopologyExact", () => {
  const truth: PianoGrandStaffTruthPage = {
    height: 1000,
    pageIndex: 0,
    renderSha256: "a".repeat(64),
    systems: [
      { boundingBox: { height: 200, left: 0, top: 100, width: 1400 }, visibleStaffCount: 2 },
      { boundingBox: { height: 200, left: 0, top: 400, width: 1400 }, visibleStaffCount: 2 },
    ],
    width: 1400,
  };

  it("requires count, reading order, staffCount 2, and center in the truth band", () => {
    expect(
      isPianoGrandStaffTopologyExact(
        [
          { staffCount: 2, staffLayout: "grand-staff", pixelBBox: { x: 0, y: 80, width: 1400, height: 160 } },
          { staffCount: 2, staffLayout: "grand-staff", pixelBBox: { x: 0, y: 390, width: 1400, height: 180 } },
        ],
        truth,
      ),
    ).toBe(true);
  });

  it("rejects count mismatch, out-of-band centers, and non-grand-staff systems", () => {
    expect(
      isPianoGrandStaffTopologyExact(
        [{ staffCount: 2, staffLayout: "grand-staff", pixelBBox: { x: 0, y: 80, width: 1400, height: 160 } }],
        truth,
      ),
    ).toBe(false);
    expect(
      isPianoGrandStaffTopologyExact(
        [
          { staffCount: 2, staffLayout: "grand-staff", pixelBBox: { x: 0, y: 0, width: 1400, height: 40 } },
          { staffCount: 2, staffLayout: "grand-staff", pixelBBox: { x: 0, y: 390, width: 1400, height: 180 } },
        ],
        truth,
      ),
    ).toBe(false);
    expect(
      isPianoGrandStaffTopologyExact(
        [
          { staffCount: 1, staffLayout: "single-staff", pixelBBox: { x: 0, y: 80, width: 1400, height: 160 } },
          { staffCount: 2, staffLayout: "grand-staff", pixelBBox: { x: 0, y: 390, width: 1400, height: 180 } },
        ],
        truth,
      ),
    ).toBe(false);
  });

  it("parses the frozen K331 mapping shape", () => {
    expect(() =>
      pianoGrandStaffMappingSchema.parse({
        expectedSystemCounts: [2],
        pages: [truth],
        pdfSha256: "b".repeat(64),
        reviewBasis: "human-visible-five-line-staff-count",
        reviewNote: "fixture",
        schemaVersion: "1.0.0",
        workId: "mozart-k331-3",
      }),
    ).not.toThrow();
  });
});
