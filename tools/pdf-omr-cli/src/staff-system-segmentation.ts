import { sha256Bytes } from "./canonical-json";
import { PdfOmrError } from "./errors";
import type { RenderedPdfPage } from "./render-pdf-pages";

export const GRAND_STAFF_SEGMENTATION_PARAMETERS = {
  detectorVersion: "rokot-grand-staff-v1",
  horizontalRunCoverage: 0.05,
  minimumStaffSpacingPx: 3,
  maximumStaffSpacingPx: 40,
  spacingToleranceRatio: 0.25,
  minimumGrandStaffGapMultiplier: 2,
  maximumGrandStaffGapMultiplier: 10,
  minimumConnectorCoverage: 0.9,
  cropPaddingMultiplier: 4,
} as const;

export type GrandStaffSystem = {
  pageIndex: number;
  systemIndex: number;
  pageRenderSha256: string;
  localStaffSpacingPx: number;
  pixelBBox: { x: number; y: number; width: number; height: number };
  pdfPointBBox: { x: number; y: number; width: number; height: number };
  cropPixels: Uint8Array;
  cropSha256: string;
  staffLineYs: number[];
};

export type GrandStaffSegmentation = {
  detectorVersion: typeof GRAND_STAFF_SEGMENTATION_PARAMETERS.detectorVersion;
  parameters: typeof GRAND_STAFF_SEGMENTATION_PARAMETERS;
  systems: GrandStaffSystem[];
};

type StaffGroup = { lines: number[]; spacing: number };
type PendingSystem = { lines: number[]; spacing: number; top: number; bottom: number };
type HorizontalRun = { y: number; startX: number; endX: number };

export function segmentGrandStaffSystems(pages: readonly RenderedPdfPage[]): GrandStaffSegmentation {
  const systems: GrandStaffSystem[] = [];
  for (const page of [...pages].sort((left, right) => left.pageIndex - right.pageIndex)) {
    const detected = detectPageSystems(page);
    const boundaries = detected.map((system, index) => {
      const previous = detected[index - 1];
      const next = detected[index + 1];
      const paddedTop = Math.max(
        0,
        system.top - GRAND_STAFF_SEGMENTATION_PARAMETERS.cropPaddingMultiplier * system.spacing,
      );
      const paddedBottom = Math.min(
        page.pixelHeight,
        system.bottom + GRAND_STAFF_SEGMENTATION_PARAMETERS.cropPaddingMultiplier * system.spacing,
      );
      const previousBoundary = previous === undefined ? 0 : Math.floor((previous.bottom + system.top) / 2);
      const nextBoundary = next === undefined ? page.pixelHeight : Math.floor((system.bottom + next.top) / 2);
      return {
        top: Math.max(paddedTop, previousBoundary),
        bottom: Math.min(paddedBottom, nextBoundary),
      };
    });

    for (const [systemIndex, system] of detected.entries()) {
      const boundary = boundaries[systemIndex]!;
      if (boundary.bottom <= boundary.top) throw ambiguous(page.pageIndex, { stage: "crop-boundaries" });
      const pixelBBox = { x: 0, y: boundary.top, width: page.pixelWidth, height: boundary.bottom - boundary.top };
      const cropPixels = cropRgba(page, pixelBBox);
      systems.push({
        pageIndex: page.pageIndex,
        systemIndex,
        pageRenderSha256: page.renderSha256,
        localStaffSpacingPx: system.spacing,
        pixelBBox,
        pdfPointBBox: {
          x: pixelBBox.x / page.scale,
          y: page.pdfHeight - (pixelBBox.y + pixelBBox.height) / page.scale,
          width: pixelBBox.width / page.scale,
          height: pixelBBox.height / page.scale,
        },
        cropPixels,
        cropSha256: sha256Bytes(cropPixels),
        staffLineYs: system.lines,
      });
    }
  }
  return {
    detectorVersion: GRAND_STAFF_SEGMENTATION_PARAMETERS.detectorVersion,
    parameters: GRAND_STAFF_SEGMENTATION_PARAMETERS,
    systems,
  };
}

function detectPageSystems(page: RenderedPdfPage): PendingSystem[] {
  if (page.format !== "rgba" || page.pixels.length !== page.pixelWidth * page.pixelHeight * 4) {
    throw ambiguous(page.pageIndex, { stage: "invalid-rgba" });
  }
  const threshold = otsuThreshold(page);
  const candidateRows: HorizontalRun[] = [];
  for (let y = 0; y < page.pixelHeight; y += 1) {
    let longestRun = 0;
    let longestStart = 0;
    let currentRun = 0;
    let currentStart = 0;
    for (let x = 0; x < page.pixelWidth; x += 1) {
      const offset = (y * page.pixelWidth + x) * 4;
      const luminance = Math.round(
        page.pixels[offset]! * 0.2126 + page.pixels[offset + 1]! * 0.7152 + page.pixels[offset + 2]! * 0.0722,
      );
      if (luminance <= threshold) {
        if (currentRun === 0) currentStart = x;
        currentRun += 1;
        if (currentRun > longestRun) {
          longestRun = currentRun;
          longestStart = currentStart;
        }
      } else {
        currentRun = 0;
      }
    }
    if (longestRun / page.pixelWidth >= GRAND_STAFF_SEGMENTATION_PARAMETERS.horizontalRunCoverage) {
      candidateRows.push({ y, startX: longestStart, endX: longestStart + longestRun });
    }
  }
  const detectedLines = mergeAdjacentRows(candidateRows);
  const groups = extractStaffGroups(detectedLines);
  if (groups.length === 0 || groups.length % 2 !== 0) {
    throw ambiguous(page.pageIndex, {
      stage: "staff-groups",
      groupCount: groups.length,
    });
  }

  const result: PendingSystem[] = [];
  for (let index = 0; index < groups.length; index += 2) {
    const upper = groups[index]!;
    const lower = groups[index + 1]!;
    const spacing = Math.round((upper.spacing + lower.spacing) / 2);
    if (Math.abs(upper.spacing - lower.spacing) > Math.max(1, spacing * 0.25)) {
      throw ambiguous(page.pageIndex, { stage: "staff-spacing", groupIndex: index });
    }
    const gap = lower.lines[0]! - upper.lines[4]!;
    if (
      gap < spacing * GRAND_STAFF_SEGMENTATION_PARAMETERS.minimumGrandStaffGapMultiplier ||
      gap > spacing * GRAND_STAFF_SEGMENTATION_PARAMETERS.maximumGrandStaffGapMultiplier ||
      !hasVerticalConnector(page, threshold, upper.lines[0]!, lower.lines[4]!)
    ) {
      throw ambiguous(page.pageIndex, {
        stage: "grand-staff-pairing",
        groupIndex: index,
        gap,
      });
    }
    result.push({
      lines: [...upper.lines, ...lower.lines],
      spacing,
      top: upper.lines[0]!,
      bottom: lower.lines[4]!,
    });
  }
  return result;
}

function extractStaffGroups(detectedLines: readonly HorizontalRun[]): StaffGroup[] {
  const groups: StaffGroup[] = [];
  for (let cursor = 0; cursor < detectedLines.length;) {
    const first = detectedLines[cursor]!;
    let match: { group: StaffGroup; lastIndex: number } | undefined;
    for (let secondIndex = cursor + 1; secondIndex < detectedLines.length; secondIndex += 1) {
      const second = detectedLines[secondIndex]!;
      const spacing = second.y - first.y;
      if (spacing > GRAND_STAFF_SEGMENTATION_PARAMETERS.maximumStaffSpacingPx) break;
      if (spacing < GRAND_STAFF_SEGMENTATION_PARAMETERS.minimumStaffSpacingPx) continue;
      const tolerance = Math.max(1, spacing * GRAND_STAFF_SEGMENTATION_PARAMETERS.spacingToleranceRatio);
      const selected = [first, second];
      let searchFrom = secondIndex + 1;
      for (let lineIndex = 2; lineIndex < 5; lineIndex += 1) {
        const expectedY = selected.at(-1)!.y + spacing;
        let foundIndex = -1;
        for (let candidateIndex = searchFrom; candidateIndex < detectedLines.length; candidateIndex += 1) {
          const candidate = detectedLines[candidateIndex]!;
          if (candidate.y > expectedY + tolerance) break;
          if (Math.abs(candidate.y - expectedY) <= tolerance && runsAligned([...selected, candidate])) {
            foundIndex = candidateIndex;
            selected.push(candidate);
            break;
          }
        }
        if (foundIndex < 0) break;
        searchFrom = foundIndex + 1;
      }
      if (selected.length === 5) {
        match = {
          group: { lines: selected.map((line) => line.y), spacing },
          lastIndex: searchFrom - 1,
        };
        break;
      }
    }
    if (match === undefined) {
      cursor += 1;
    } else {
      groups.push(match.group);
      cursor = match.lastIndex + 1;
    }
  }
  return groups;
}

function hasVerticalConnector(page: RenderedPdfPage, threshold: number, top: number, bottom: number): boolean {
  const height = bottom - top + 1;
  for (let x = 0; x < page.pixelWidth; x += 1) {
    let darkPixels = 0;
    for (let y = top; y <= bottom; y += 1) {
      const offset = (y * page.pixelWidth + x) * 4;
      const luminance = Math.round(
        page.pixels[offset]! * 0.2126 + page.pixels[offset + 1]! * 0.7152 + page.pixels[offset + 2]! * 0.0722,
      );
      if (luminance <= threshold) darkPixels += 1;
    }
    if (darkPixels / height >= GRAND_STAFF_SEGMENTATION_PARAMETERS.minimumConnectorCoverage) return true;
  }
  return false;
}

function otsuThreshold(page: RenderedPdfPage): number {
  const histogram = new Uint32Array(256);
  for (let offset = 0; offset < page.pixels.length; offset += 4) {
    const luminance = Math.round(
      page.pixels[offset]! * 0.2126 + page.pixels[offset + 1]! * 0.7152 + page.pixels[offset + 2]! * 0.0722,
    );
    histogram[luminance] += 1;
  }
  const total = page.pixelWidth * page.pixelHeight;
  let weightedTotal = 0;
  for (let value = 0; value < histogram.length; value += 1) weightedTotal += value * histogram[value]!;
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let maximumVariance = -1;
  let threshold = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    backgroundWeight += histogram[value]!;
    if (backgroundWeight === 0) continue;
    const foregroundWeight = total - backgroundWeight;
    if (foregroundWeight === 0) break;
    backgroundSum += value * histogram[value]!;
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (weightedTotal - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > maximumVariance) {
      maximumVariance = variance;
      threshold = value;
    }
  }
  return threshold;
}

function mergeAdjacentRows(rows: readonly HorizontalRun[]): HorizontalRun[] {
  const result: HorizontalRun[] = [];
  let group: HorizontalRun[] = rows[0] === undefined ? [] : [rows[0]];
  for (const row of rows.slice(1)) {
    const previous = group.at(-1);
    if (previous !== undefined && row.y === previous.y + 1 && runsAligned([previous, row])) {
      group.push(row);
      continue;
    }
    if (group.length > 0) result.push(mergeRunGroup(group));
    group = [row];
  }
  if (group.length > 0) result.push(mergeRunGroup(group));
  return result;
}

function mergeRunGroup(group: readonly HorizontalRun[]): HorizontalRun {
  return {
    y: Math.round(group.reduce((sum, row) => sum + row.y, 0) / group.length),
    startX: Math.round(group.reduce((sum, row) => sum + row.startX, 0) / group.length),
    endX: Math.round(group.reduce((sum, row) => sum + row.endX, 0) / group.length),
  };
}

function runsAligned(runs: readonly HorizontalRun[]): boolean {
  if (runs.length === 0) return false;
  const minimumLength = Math.min(...runs.map((run) => run.endX - run.startX));
  const tolerance = Math.max(3, minimumLength * 0.05);
  const starts = runs.map((run) => run.startX);
  const ends = runs.map((run) => run.endX);
  return Math.max(...starts) - Math.min(...starts) <= tolerance && Math.max(...ends) - Math.min(...ends) <= tolerance;
}

function cropRgba(page: RenderedPdfPage, bbox: { x: number; y: number; width: number; height: number }): Uint8Array {
  const result = new Uint8Array(bbox.width * bbox.height * 4);
  const sourceRowBytes = page.pixelWidth * 4;
  const cropRowBytes = bbox.width * 4;
  for (let row = 0; row < bbox.height; row += 1) {
    const sourceOffset = (bbox.y + row) * sourceRowBytes + bbox.x * 4;
    result.set(page.pixels.subarray(sourceOffset, sourceOffset + cropRowBytes), row * cropRowBytes);
  }
  return result;
}

function ambiguous(pageIndex: number, details: Readonly<Record<string, string | number>> = {}): PdfOmrError {
  return new PdfOmrError("ENGINE_OUTPUT_INVALID", "PDF staff-system segmentation is ambiguous", {
    context: { reason: "ambiguous-system-segmentation", pageIndex, ...details },
  });
}
