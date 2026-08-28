import { sha256Bytes } from "./canonical-json";
import { PdfOmrError } from "./errors";
import type { RenderedPdfPage } from "./render-pdf-pages";

export const STAFF_SYSTEM_SEGMENTATION_PARAMETERS = {
  detectorVersion: "rokot-staff-system-v2",
  horizontalRunCoverage: 0.05,
  continuousRowCoverage: 0.5,
  minimumStaffSpacingPx: 3,
  maximumStaffSpacingPx: 40,
  spacingToleranceRatio: 0.25,
  fragmentedSpacingToleranceRatio: 0.3,
  fragmentedRunContainmentRatio: 0.9,
  minimumGrandStaffGapMultiplier: 2,
  maximumGrandStaffGapMultiplier: 10,
  minimumConnectorCoverage: 0.95,
  minimumCurvedConnectorCoverage: 0.85,
  fragmentedRowCoverage: 0.2,
  cropPaddingMultiplier: 4,
  staffSpacingConsistencyRatio: 0.5,
} as const;

export type StaffSystem = {
  staffLayout: "single-staff" | "grand-staff";
  staffCount: 1 | 2;
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

export type StaffSystemSegmentation = {
  detectorVersion: typeof STAFF_SYSTEM_SEGMENTATION_PARAMETERS.detectorVersion;
  parameters: typeof STAFF_SYSTEM_SEGMENTATION_PARAMETERS;
  systems: StaffSystem[];
};

export type StaffSystemSegmentationOptions = {
  readonly allowFragmentedRuns?: boolean;
  readonly staffLayout?: StaffLayout;
};

export type StaffLayout = "auto" | "single-staff" | "grand-staff";

type StaffGroup = { lines: number[]; spacing: number; coverage: number; firstIndex: number; lastIndex: number };
type PendingSystem = {
  lines: number[];
  spacing: number;
  top: number;
  bottom: number;
  staffLayout: "single-staff" | "grand-staff";
  staffCount: 1 | 2;
};
type HorizontalRun = { y: number; startX: number; endX: number; fragmented: boolean };

export function segmentGrandStaffSystems(
  pages: readonly RenderedPdfPage[],
  options: StaffSystemSegmentationOptions = {},
): StaffSystemSegmentation {
  return segmentStaffSystems(pages, { ...options, staffLayout: "grand-staff" });
}

export function segmentStaffSystems(
  pages: readonly RenderedPdfPage[],
  options: StaffSystemSegmentationOptions = {},
): StaffSystemSegmentation {
  const systems: StaffSystem[] = [];
  for (const page of [...pages].sort((left, right) => left.pageIndex - right.pageIndex)) {
    const detected = detectPageSystems(page, options.allowFragmentedRuns === true, options.staffLayout ?? "auto");
    const boundaries = detected.map((system, index) => {
      const previous = detected[index - 1];
      const next = detected[index + 1];
      const paddedTop = Math.max(
        0,
        system.top - STAFF_SYSTEM_SEGMENTATION_PARAMETERS.cropPaddingMultiplier * system.spacing,
      );
      const paddedBottom = Math.min(
        page.pixelHeight,
        system.bottom + STAFF_SYSTEM_SEGMENTATION_PARAMETERS.cropPaddingMultiplier * system.spacing,
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
        staffLayout: system.staffLayout,
        staffCount: system.staffCount,
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
    detectorVersion: STAFF_SYSTEM_SEGMENTATION_PARAMETERS.detectorVersion,
    parameters: STAFF_SYSTEM_SEGMENTATION_PARAMETERS,
    systems,
  };
}

function detectPageSystems(
  page: RenderedPdfPage,
  allowFragmentedRuns: boolean,
  staffLayout: StaffLayout,
): PendingSystem[] {
  if (page.format !== "rgba" || page.pixels.length !== page.pixelWidth * page.pixelHeight * 4) {
    throw ambiguous(page.pageIndex, { stage: "invalid-rgba" });
  }
  const threshold = otsuThreshold(page);
  const candidateRows: HorizontalRun[] = [];
  const legacyCandidateRows: HorizontalRun[] = [];
  for (let y = 0; y < page.pixelHeight; y += 1) {
    let longestRun = 0;
    let longestStart = 0;
    let currentRun = 0;
    let currentStart = 0;
    let darkPixelCount = 0;
    let firstDarkPixel = page.pixelWidth;
    let lastDarkPixel = -1;
    for (let x = 0; x < page.pixelWidth; x += 1) {
      const offset = (y * page.pixelWidth + x) * 4;
      const luminance = Math.round(
        page.pixels[offset]! * 0.2126 + page.pixels[offset + 1]! * 0.7152 + page.pixels[offset + 2]! * 0.0722,
      );
      if (luminance <= threshold) {
        darkPixelCount += 1;
        firstDarkPixel = Math.min(firstDarkPixel, x);
        lastDarkPixel = x;
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
    const longestRunCoverage = longestRun / page.pixelWidth;
    const fragmentedCoverage = darkPixelCount / page.pixelWidth;
    if (longestRunCoverage >= STAFF_SYSTEM_SEGMENTATION_PARAMETERS.continuousRowCoverage) {
      candidateRows.push({ y, startX: longestStart, endX: longestStart + longestRun, fragmented: false });
    } else if (
      allowFragmentedRuns &&
      fragmentedCoverage >= STAFF_SYSTEM_SEGMENTATION_PARAMETERS.fragmentedRowCoverage
    ) {
      candidateRows.push({ y, startX: firstDarkPixel, endX: lastDarkPixel + 1, fragmented: true });
    } else if (longestRunCoverage >= STAFF_SYSTEM_SEGMENTATION_PARAMETERS.horizontalRunCoverage) {
      candidateRows.push({ y, startX: longestStart, endX: longestStart + longestRun, fragmented: false });
    }
    if (allowFragmentedRuns && fragmentedCoverage >= STAFF_SYSTEM_SEGMENTATION_PARAMETERS.fragmentedRowCoverage) {
      legacyCandidateRows.push({ y, startX: firstDarkPixel, endX: lastDarkPixel + 1, fragmented: true });
    } else if (longestRunCoverage >= STAFF_SYSTEM_SEGMENTATION_PARAMETERS.horizontalRunCoverage) {
      legacyCandidateRows.push({ y, startX: longestStart, endX: longestStart + longestRun, fragmented: false });
    }
  }
  const detectedLines = mergeAdjacentRows(candidateRows, allowFragmentedRuns);
  const legacyDetectedLines = mergeAdjacentRows(legacyCandidateRows, allowFragmentedRuns);
  const groups = filterConsistentSpacingGroups(
    deduplicateStaffGroups([
      ...extractStaffGroupCandidates(detectedLines, allowFragmentedRuns).map((group) => ({
        group,
        detection: "continuous-first" as const,
      })),
      ...extractStaffGroupCandidates(legacyDetectedLines, allowFragmentedRuns).map((group) => ({
        group,
        detection: "fragmented-first" as const,
      })),
    ]),
  );
  if (groups.length === 0) {
    throw ambiguous(page.pageIndex, {
      stage: "staff-groups",
      groupCount: groups.length,
    });
  }

  if (staffLayout === "single-staff") return groups.map(singleStaffSystem);

  const result: PendingSystem[] = [];
  const selectedGroups: StaffGroup[] = [];
  const appendPairs = (pairs: readonly StaffGroupPair[]) => {
    for (const { upper, lower } of pairs) {
      const spacing = Math.round((upper.spacing + lower.spacing) / 2);
      result.push({
        lines: [...upper.lines, ...lower.lines],
        spacing,
        top: upper.lines[0]!,
        bottom: lower.lines[4]!,
        staffLayout: "grand-staff",
        staffCount: 2,
      });
      selectedGroups.push(upper, lower);
    }
  };
  appendPairs(
    selectGrandStaffPairs(page, threshold, groups, STAFF_SYSTEM_SEGMENTATION_PARAMETERS.minimumConnectorCoverage),
  );
  let unpairedGroups = findUnpairedGroups(groups, selectedGroups);
  appendPairs(
    selectGrandStaffPairs(
      page,
      threshold,
      unpairedGroups,
      STAFF_SYSTEM_SEGMENTATION_PARAMETERS.minimumCurvedConnectorCoverage,
    ),
  );
  result.sort((left, right) => left.top - right.top);
  unpairedGroups = findUnpairedGroups(groups, selectedGroups);
  if (staffLayout === "auto" && result.length === 0 && unpairedGroups.length > 0) {
    return unpairedGroups.map(singleStaffSystem);
  }
  if (staffLayout === "auto" && result.length > 0 && unpairedGroups.length > 0) {
    throw ambiguous(page.pageIndex, {
      stage: "staff-system-topology",
      groupCount: groups.length,
      detectedStaffLineYs: groups.map((group) => group.lines),
      unpairedGroupCount: unpairedGroups.length,
      unpairedStaffLineYs: unpairedGroups.map((group) => group.lines),
    });
  }
  if (result.length === 0 || unpairedGroups.length > 0) {
    throw ambiguous(page.pageIndex, {
      stage: "grand-staff-pairing",
      groupCount: groups.length,
      detectedStaffLineYs: groups.map((group) => group.lines),
      unpairedGroupCount: unpairedGroups.length,
      unpairedStaffLineYs: unpairedGroups.map((group) => group.lines),
    });
  }
  return result;
}

type StaffGroupPair = { upper: StaffGroup; lower: StaffGroup; connectorCoverage: number };

function selectGrandStaffPairs(
  page: RenderedPdfPage,
  threshold: number,
  groups: readonly StaffGroup[],
  minimumConnectorCoverage: number,
): StaffGroupPair[] {
  const candidates: StaffGroupPair[] = [];
  for (const upper of groups) {
    for (const lower of groups) {
      if (lower.firstIndex <= upper.lastIndex) continue;
      const spacing = Math.round((upper.spacing + lower.spacing) / 2);
      if (Math.abs(upper.spacing - lower.spacing) > Math.max(1, spacing * 0.25)) continue;
      const gap = lower.lines[0]! - upper.lines[4]!;
      if (
        gap < spacing * STAFF_SYSTEM_SEGMENTATION_PARAMETERS.minimumGrandStaffGapMultiplier ||
        gap > spacing * STAFF_SYSTEM_SEGMENTATION_PARAMETERS.maximumGrandStaffGapMultiplier
      ) {
        continue;
      }
      const connectorCoverage = maximumVerticalConnectorCoverage(page, threshold, upper.lines[0]!, lower.lines[4]!);
      if (connectorCoverage >= minimumConnectorCoverage) candidates.push({ upper, lower, connectorCoverage });
    }
  }
  const selected: StaffGroupPair[] = [];
  for (const candidate of candidates.sort(
    (left, right) =>
      right.connectorCoverage - left.connectorCoverage ||
      right.upper.coverage + right.lower.coverage - (left.upper.coverage + left.lower.coverage) ||
      left.upper.lines[0]! - right.upper.lines[0]!,
  )) {
    if (
      selected.some(
        ({ upper, lower }) =>
          staffGroupsOverlap(candidate.upper, upper) ||
          staffGroupsOverlap(candidate.upper, lower) ||
          staffGroupsOverlap(candidate.lower, upper) ||
          staffGroupsOverlap(candidate.lower, lower),
      )
    ) {
      continue;
    }
    selected.push(candidate);
  }
  return selected;
}

function singleStaffSystem(group: StaffGroup): PendingSystem {
  return {
    lines: group.lines,
    spacing: group.spacing,
    top: group.lines[0]!,
    bottom: group.lines[4]!,
    staffLayout: "single-staff",
    staffCount: 1,
  };
}

function staffGroupsOverlap(left: StaffGroup, right: StaffGroup): boolean {
  return left.lines[0]! <= right.lines[4]! && left.lines[4]! >= right.lines[0]!;
}

function findUnpairedGroups(groups: readonly StaffGroup[], selectedGroups: readonly StaffGroup[]): StaffGroup[] {
  return groups.filter(
    (candidate) =>
      !selectedGroups.some(
        (selected) => candidate.lines[0]! <= selected.lines[4]! && candidate.lines[4]! >= selected.lines[0]!,
      ),
  );
}

function extractStaffGroupCandidates(
  detectedLines: readonly HorizontalRun[],
  allowFragmentedRuns: boolean,
): StaffGroup[] {
  const groups: StaffGroup[] = [];
  for (let cursor = 0; cursor < detectedLines.length; cursor += 1) {
    const first = detectedLines[cursor]!;
    let match: { group: StaffGroup; lastIndex: number } | undefined;
    for (let secondIndex = cursor + 1; secondIndex < detectedLines.length; secondIndex += 1) {
      const second = detectedLines[secondIndex]!;
      const spacing = second.y - first.y;
      if (spacing > STAFF_SYSTEM_SEGMENTATION_PARAMETERS.maximumStaffSpacingPx) break;
      if (spacing < STAFF_SYSTEM_SEGMENTATION_PARAMETERS.minimumStaffSpacingPx) continue;
      const spacingToleranceRatio = allowFragmentedRuns
        ? STAFF_SYSTEM_SEGMENTATION_PARAMETERS.fragmentedSpacingToleranceRatio
        : STAFF_SYSTEM_SEGMENTATION_PARAMETERS.spacingToleranceRatio;
      const tolerance = Math.max(1, spacing * spacingToleranceRatio);
      const selected = [first, second];
      let searchFrom = secondIndex + 1;
      for (let lineIndex = 2; lineIndex < 5; lineIndex += 1) {
        const expectedY = selected.at(-1)!.y + spacing;
        let foundIndex = -1;
        for (let candidateIndex = searchFrom; candidateIndex < detectedLines.length; candidateIndex += 1) {
          const candidate = detectedLines[candidateIndex]!;
          if (candidate.y > expectedY + tolerance) break;
          if (
            Math.abs(candidate.y - expectedY) <= tolerance &&
            runsAligned([...selected, candidate], allowFragmentedRuns)
          ) {
            foundIndex = candidateIndex;
            selected.push(candidate);
            break;
          }
        }
        if (foundIndex < 0) break;
        searchFrom = foundIndex + 1;
      }
      if (selected.length === 5) {
        if (!staffSpacingIsConsistent(selected, allowFragmentedRuns)) break;
        match = {
          group: {
            lines: selected.map((line) => line.y),
            spacing,
            coverage: Math.min(...selected.map((line) => line.endX - line.startX)),
            firstIndex: cursor,
            lastIndex: searchFrom - 1,
          },
          lastIndex: searchFrom - 1,
        };
        break;
      }
    }
    if (match !== undefined) groups.push(match.group);
  }
  return groups;
}

type StaffGroupCandidate = { group: StaffGroup; detection: "continuous-first" | "fragmented-first" };

function deduplicateStaffGroups(candidates: readonly StaffGroupCandidate[]): StaffGroup[] {
  const selected: StaffGroupCandidate[] = [];
  for (const candidate of [...candidates].sort((left, right) => compareStaffGroupQuality(left.group, right.group))) {
    const candidateTop = candidate.group.lines[0]!;
    const candidateBottom = candidate.group.lines[4]!;
    const duplicate = selected.some((existing) => {
      const overlap =
        Math.min(candidateBottom, existing.group.lines[4]!) - Math.max(candidateTop, existing.group.lines[0]!);
      const minimumHeight = Math.min(
        candidateBottom - candidateTop,
        existing.group.lines[4]! - existing.group.lines[0]!,
      );
      if (overlap > minimumHeight * 0.75) return true;
      // The two detection passes can find the same staff shifted by one line when
      // notation breaks the rows differently. Within a single pass, overlapping
      // candidates (for example ledger-line decoys) are left for grand-staff
      // pairing to resolve.
      return candidate.detection !== existing.detection && countSharedStaffLines(candidate.group, existing.group) >= 3;
    });
    if (!duplicate) selected.push(candidate);
  }
  return selected
    .map(({ group }) => group)
    .sort((left, right) => left.lines[0]! - right.lines[0]!)
    .map((group, index) => ({ ...group, firstIndex: index * 5, lastIndex: index * 5 + 4 }));
}

function countSharedStaffLines(left: StaffGroup, right: StaffGroup): number {
  const tolerance = Math.max(
    1,
    Math.round(Math.min(left.spacing, right.spacing) * STAFF_SYSTEM_SEGMENTATION_PARAMETERS.spacingToleranceRatio),
  );
  return left.lines.filter((y) => right.lines.some((other) => Math.abs(other - y) <= tolerance)).length;
}

// Dense notation (for example 32nd-note beam stacks) can look like a tiny
// five-line staff. All real staves on a page share the same print scale, so
// groups far below the dominant spacing are not staves.
function filterConsistentSpacingGroups(groups: readonly StaffGroup[]): StaffGroup[] {
  if (groups.length < 3) return [...groups];
  const spacings = groups.map((group) => group.spacing).sort((left, right) => left - right);
  const median = spacings[Math.floor(spacings.length / 2)]!;
  return groups.filter(
    (group) => group.spacing >= median * STAFF_SYSTEM_SEGMENTATION_PARAMETERS.staffSpacingConsistencyRatio,
  );
}

function compareStaffGroupQuality(left: StaffGroup, right: StaffGroup): number {
  const leftSpacings = left.lines.slice(1).map((line, index) => line - left.lines[index]!);
  const rightSpacings = right.lines.slice(1).map((line, index) => line - right.lines[index]!);
  const leftSpread = Math.max(...leftSpacings) - Math.min(...leftSpacings);
  const rightSpread = Math.max(...rightSpacings) - Math.min(...rightSpacings);
  return leftSpread - rightSpread || right.coverage - left.coverage || left.lines[0]! - right.lines[0]!;
}

function staffSpacingIsConsistent(selected: readonly HorizontalRun[], allowFragmentedRuns: boolean): boolean {
  if (!allowFragmentedRuns || selected.length < 2) return true;
  const spacings = selected.slice(1).map((line, index) => line.y - selected[index]!.y);
  const minimum = Math.min(...spacings);
  const maximum = Math.max(...spacings);
  const reference = spacings[0]!;
  return (
    maximum - minimum <= Math.max(1, reference * STAFF_SYSTEM_SEGMENTATION_PARAMETERS.fragmentedSpacingToleranceRatio)
  );
}

function maximumVerticalConnectorCoverage(
  page: RenderedPdfPage,
  threshold: number,
  top: number,
  bottom: number,
): number {
  const height = bottom - top + 1;
  let maximumCoverage = 0;
  for (let x = 0; x < page.pixelWidth; x += 1) {
    let darkPixels = 0;
    for (let y = top; y <= bottom; y += 1) {
      const offset = (y * page.pixelWidth + x) * 4;
      const luminance = Math.round(
        page.pixels[offset]! * 0.2126 + page.pixels[offset + 1]! * 0.7152 + page.pixels[offset + 2]! * 0.0722,
      );
      if (luminance <= threshold) darkPixels += 1;
    }
    maximumCoverage = Math.max(maximumCoverage, darkPixels / height);
  }
  return maximumCoverage;
}

function otsuThreshold(page: RenderedPdfPage): number {
  const histogram = new Uint32Array(256);
  for (let offset = 0; offset < page.pixels.length; offset += 4) {
    const luminance = Math.round(
      page.pixels[offset]! * 0.2126 + page.pixels[offset + 1]! * 0.7152 + page.pixels[offset + 2]! * 0.0722,
    );
    histogram[luminance] = histogram[luminance]! + 1;
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

function mergeAdjacentRows(rows: readonly HorizontalRun[], allowFragmentedRuns: boolean): HorizontalRun[] {
  const result: HorizontalRun[] = [];
  let group: HorizontalRun[] = rows[0] === undefined ? [] : [rows[0]];
  for (const row of rows.slice(1)) {
    const previous = group.at(-1);
    if (
      previous !== undefined &&
      row.y === previous.y + 1 &&
      row.fragmented === previous.fragmented &&
      runsAligned([previous, row], allowFragmentedRuns)
    ) {
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
    fragmented: group.some((row) => row.fragmented),
  };
}

function runsAligned(runs: readonly HorizontalRun[], allowFragmentedRuns: boolean): boolean {
  if (runs.length === 0) return false;
  const minimumLength = Math.min(...runs.map((run) => run.endX - run.startX));
  const tolerance = Math.max(3, minimumLength * 0.05);
  const starts = runs.map((run) => run.startX);
  const ends = runs.map((run) => run.endX);
  if (Math.max(...starts) - Math.min(...starts) <= tolerance && Math.max(...ends) - Math.min(...ends) <= tolerance) {
    return true;
  }
  if (!allowFragmentedRuns) return false;
  if (!runs.some((run) => run.fragmented)) return false;
  const anchor = runs.reduce((longest, run) => (run.endX - run.startX > longest.endX - longest.startX ? run : longest));
  return runs.every((run) => {
    const overlap = Math.min(anchor.endX, run.endX) - Math.max(anchor.startX, run.startX);
    return overlap >= (run.endX - run.startX) * STAFF_SYSTEM_SEGMENTATION_PARAMETERS.fragmentedRunContainmentRatio;
  });
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

function ambiguous(pageIndex: number, details: Readonly<Record<string, unknown>> = {}): PdfOmrError {
  return new PdfOmrError("ENGINE_OUTPUT_INVALID", "PDF staff-system segmentation is ambiguous", {
    context: { reason: "ambiguous-system-segmentation", pageIndex, ...details },
  });
}
