import { describe, expect, it } from "vitest";
import { sha256Bytes } from "../canonical-json";
import type { LearnedLayoutSegmentation, LearnedStaffSystem } from "../learned-layout-detector";
import { buildSharedDetectorSystemInputs } from "../shared-layout-detector";

describe("buildSharedDetectorSystemInputs", () => {
  it("materializes one deterministic PDF input per ordered learned crop for both engines", () => {
    const segmentation = learnedSegmentation([
      learnedSystem(0, 1, 11),
      learnedSystem(1, 2, 22),
      learnedSystem(2, 3, 33),
    ]);

    const first = buildSharedDetectorSystemInputs(segmentation);
    const second = buildSharedDetectorSystemInputs(segmentation);

    expect(first.map(({ staffLayout }) => staffLayout)).toEqual(["single-staff", "grand-staff", "three-staff"]);
    expect(first.map(({ cropSha256 }) => cropSha256)).toEqual(segmentation.systems.map(({ cropSha256 }) => cropSha256));
    expect(first.map(({ inputSha256 }) => inputSha256)).toEqual(second.map(({ inputSha256 }) => inputSha256));
    expect(first.map(({ pdfBytes }) => pdfBytes)).toEqual(second.map(({ pdfBytes }) => pdfBytes));
  });

  it("rejects unordered systems before either adapter sees them", () => {
    const segmentation = learnedSegmentation([learnedSystem(1, 2, 22), learnedSystem(0, 1, 11)]);

    expect(() => buildSharedDetectorSystemInputs(segmentation)).toThrow(
      expect.objectContaining({
        code: "ENGINE_OUTPUT_INVALID",
        context: { reason: "shared-detector-system-order" },
      }),
    );
  });

  it("rejects a staff count outside the shared detector boundary", () => {
    const system = learnedSystem(0, 3, 33);
    const segmentation = learnedSegmentation([{ ...system, staffCount: 4 }]);

    expect(() => buildSharedDetectorSystemInputs(segmentation)).toThrow(
      expect.objectContaining({
        code: "ENGINE_OUTPUT_INVALID",
        context: { reason: "shared-detector-staff-count" },
      }),
    );
  });
});

function learnedSegmentation(systems: LearnedStaffSystem[]): LearnedLayoutSegmentation {
  return {
    detectorVersion: "learned-staff-system-v1",
    validationParameters: {
      detectorVersion: "learned-staff-system-v1",
      outputSchemaVersion: "1.0.0",
      targetWidth: 1400,
      cropPaddingMultiplier: 4,
      maximumStaffCount: 3,
      maximumStaffSpacingDeviationRatio: 0.35,
    },
    systems,
  };
}

function learnedSystem(systemIndex: number, staffCount: 1 | 2 | 3, fill: number): LearnedStaffSystem {
  const width = 2;
  const height = 3;
  const cropPixels = new Uint8Array(width * height * 4).fill(fill);
  for (let offset = 3; offset < cropPixels.length; offset += 4) cropPixels[offset] = 255;
  return {
    pageIndex: 0,
    systemIndex,
    staffCount,
    confidence: 0.9,
    pageRenderSha256: "a".repeat(64),
    localStaffSpacingPx: 4,
    pixelBBox: { x: 0, y: systemIndex * height, width, height },
    pdfPointBBox: { x: 0, y: systemIndex * height, width, height },
    cropPixels,
    cropSha256: sha256Bytes(cropPixels),
    staffLineYs: Array.from({ length: staffCount * 5 }, (_, index) => index),
  };
}
