import { sha256Bytes } from "./canonical-json";
import { PdfOmrError } from "./errors";
import type { LearnedLayoutSegmentation, LearnedStaffSystem } from "./learned-layout-detector";
import { encodeRgbaPagesAsPdf } from "./raster-pdf";
import type { StaffLayout } from "./staff-system-segmentation";

export type SharedDetectorSystemInput = {
  detectorVersion: LearnedLayoutSegmentation["detectorVersion"];
  pageIndex: number;
  systemIndex: number;
  staffCount: 1 | 2 | 3;
  staffLayout: Exclude<StaffLayout, "auto">;
  cropSha256: string;
  inputSha256: string;
  pdfBytes: Uint8Array;
};

export function buildSharedDetectorSystemInputs(segmentation: LearnedLayoutSegmentation): SharedDetectorSystemInput[] {
  let previous: LearnedStaffSystem | undefined;
  return segmentation.systems.map((system) => {
    if (
      previous !== undefined &&
      (system.pageIndex < previous.pageIndex ||
        (system.pageIndex === previous.pageIndex && system.systemIndex <= previous.systemIndex))
    ) {
      throw invalidSharedInput("shared-detector-system-order");
    }
    previous = system;
    if (sha256Bytes(system.cropPixels) !== system.cropSha256) {
      throw invalidSharedInput("shared-detector-crop-hash");
    }
    const staffCount = sharedStaffCount(system.staffCount);
    const pdfBytes = encodeRgbaPagesAsPdf([
      { width: system.pixelBBox.width, height: system.pixelBBox.height, pixels: system.cropPixels },
    ]);
    return {
      detectorVersion: segmentation.detectorVersion,
      pageIndex: system.pageIndex,
      systemIndex: system.systemIndex,
      staffCount,
      staffLayout: staffLayout(staffCount),
      cropSha256: system.cropSha256,
      inputSha256: sha256Bytes(pdfBytes),
      pdfBytes,
    };
  });
}

function sharedStaffCount(staffCount: number): 1 | 2 | 3 {
  if (staffCount === 1 || staffCount === 2 || staffCount === 3) return staffCount;
  throw invalidSharedInput("shared-detector-staff-count");
}

function staffLayout(staffCount: 1 | 2 | 3): SharedDetectorSystemInput["staffLayout"] {
  if (staffCount === 1) return "single-staff";
  if (staffCount === 2) return "grand-staff";
  return "three-staff";
}

function invalidSharedInput(reason: string): PdfOmrError {
  return new PdfOmrError("ENGINE_OUTPUT_INVALID", "shared detector output is invalid", { context: { reason } });
}
