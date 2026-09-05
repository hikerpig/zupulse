import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderPdfPages, type RenderedPdfPage } from "../render-pdf-pages";
import {
  PIANO_GRAND_STAFF_SEGMENTATION_V1,
  STAFF_SYSTEM_SEGMENTATION_PARAMETERS,
  resolveFullPageSegmentation,
  segmentationOptionsForPianoGrandStaffV1,
  segmentGrandStaffSystems,
  segmentStaffSystems,
} from "../staff-system-segmentation";

describe("segmentGrandStaffSystems", () => {
  it("segments isolated five-line groups as single-staff systems in auto mode", () => {
    const input = page(0, 200, 220, []);
    const lineYs = [20, 26, 32, 38, 44, 140, 146, 152, 158, 164];
    lineYs.forEach((y) => setBlackRange(input, 10, 190, y));

    const result = segmentStaffSystems([input]);

    expect(result.systems).toHaveLength(2);
    expect(result.systems.map((system) => [system.staffLayout, system.staffCount])).toEqual([
      ["single-staff", 1],
      ["single-staff", 1],
    ]);
    expect(result.systems.map((system) => system.staffLineYs)).toEqual([lineYs.slice(0, 5), lineYs.slice(5)]);
  });

  it("keeps explicit grand-staff mode fail-closed for isolated single staves", () => {
    const input = page(0, 200, 220, []);
    [20, 26, 32, 38, 44, 140, 146, 152, 158, 164].forEach((y) => setBlackRange(input, 10, 190, y));

    expect(() => segmentStaffSystems([input], { staffLayout: "grand-staff" })).toThrow(
      expect.objectContaining({
        code: "ENGINE_OUTPUT_INVALID",
        context: expect.objectContaining({ stage: "grand-staff-pairing", pageIndex: 0 }),
      }),
    );
  });

  it("can pair remaining grand-staff groups adjacently for development crop materialization", () => {
    const input = page(0, 200, 220, []);
    [20, 26, 32, 38, 44, 140, 146, 152, 158, 164].forEach((y) => setBlackRange(input, 10, 190, y));

    const result = segmentStaffSystems([input], {
      staffLayout: "grand-staff",
      pairAdjacentUnpairedGroups: true,
    });

    expect(result.systems).toHaveLength(1);
    expect(result.systems[0]).toMatchObject({
      staffLayout: "grand-staff",
      staffCount: 2,
      pageIndex: 0,
      systemIndex: 0,
    });
  });

  it("keeps auto mode fail-closed when a page mixes paired and unpaired staff groups", () => {
    const input = page(0, 200, 220, [20, 26, 32, 38, 44, 68, 74, 80, 86, 92]);
    [150, 156, 162, 168, 174].forEach((y) => setBlackRange(input, 10, 190, y));

    expect(() => segmentStaffSystems([input])).toThrow(
      expect.objectContaining({
        code: "ENGINE_OUTPUT_INVALID",
        context: expect.objectContaining({ stage: "staff-system-topology", pageIndex: 0 }),
      }),
    );
  });

  it("detects noisy grand staffs, sorts systems, maps coordinates, and is deterministic", () => {
    const pageOne = page(1, 200, 260, [30, 36, 42, 48, 54, 78, 84, 90, 96, 102]);
    const pageZero = page(
      0,
      200,
      260,
      [20, 26, 32, 38, 44, 68, 74, 80, 86, 92, 140, 146, 152, 158, 164, 188, 194, 200, 206, 212],
    );
    setBlack(pageZero, 3, 110);
    setBlack(pageZero, 150, 117);

    const first = segmentGrandStaffSystems([pageOne, pageZero]);
    const second = segmentGrandStaffSystems([pageOne, pageZero]);

    expect(first).toEqual(second);
    expect(first.detectorVersion).toBe("rokot-staff-system-v2");
    expect(first.parameters).toEqual(STAFF_SYSTEM_SEGMENTATION_PARAMETERS);
    expect(first.systems.map((system) => [system.pageIndex, system.systemIndex])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
    expect(first.systems[0]).toMatchObject({
      staffLayout: "grand-staff",
      staffCount: 2,
      pageIndex: 0,
      pageRenderSha256: "render-0",
      localStaffSpacingPx: 6,
      pixelBBox: { x: 0, y: 0, width: 200, height: 116 },
      pdfPointBBox: { x: 0, y: 144, width: 200, height: 116 },
      cropSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      staffLineYs: [20, 26, 32, 38, 44, 68, 74, 80, 86, 92],
    });
    expect(first.systems[0]!.cropPixels).toHaveLength(200 * 116 * 4);
  });

  it("caps padding at deterministic boundaries so neighboring crops never overlap", () => {
    const input = page(
      0,
      200,
      230,
      [20, 26, 32, 38, 44, 68, 74, 80, 86, 92, 120, 126, 132, 138, 144, 168, 174, 180, 186, 192],
    );

    const result = segmentGrandStaffSystems([input]);

    expect(result.systems).toHaveLength(2);
    const upper = result.systems[0]!.pixelBBox;
    const lower = result.systems[1]!.pixelBBox;
    expect(upper.y + upper.height).toBeLessThanOrEqual(lower.y);
    expect(upper.y + upper.height).toBe(106);
    expect(lower.y).toBe(106);
  });

  it("detects a short final system without requiring page-width staff lines", () => {
    const input = page(0, 200, 160, [20, 26, 32, 38, 44, 68, 74, 80, 86, 92], 40);

    const result = segmentGrandStaffSystems([input]);

    expect(result.systems).toHaveLength(1);
    expect(result.systems[0]!.staffLineYs).toEqual([20, 26, 32, 38, 44, 68, 74, 80, 86, 92]);
  });

  it("keeps continuous staff lines separate from adjacent fragmented notation rows", () => {
    const lineYs = [20, 26, 32, 38, 44, 68, 74, 80, 86, 92] as const;
    const input = page(0, 200, 120, lineYs);
    for (const y of lineYs) {
      if (lineYs.includes((y + 1) as (typeof lineYs)[number])) continue;
      setBlackRange(input, 20, 65, y + 1);
      setBlackRange(input, 95, 140, y + 1);
    }

    const result = segmentGrandStaffSystems([input], { allowFragmentedRuns: true });

    expect(result.systems).toHaveLength(1);
    expect(result.systems[0]!.staffLineYs).toEqual(lineYs);
  });

  it("segments every grand staff in the repository K331 development fixture", async () => {
    const fixture = fileURLToPath(new URL("../../../../test-fixtures/musicxml/K331-3_reviewed.pdf", import.meta.url));
    const pages = await renderPdfPages(await readFile(fixture));

    const result = segmentGrandStaffSystems(pages);

    expect(pages.map((page) => result.systems.filter((system) => system.pageIndex === page.pageIndex).length)).toEqual([
      6, 6, 1, 6, 6, 2,
    ]);
    expect(result.systems).toHaveLength(27);
    expect(result.systems.filter((system) => system.pageIndex === 5).map((system) => system.systemIndex)).toEqual([
      0, 1,
    ]);
  });

  it("drops shifted duplicate and dense-notation decoy staves in the piano/violin fixture", async () => {
    const fixture = fileURLToPath(
      new URL("../../../../test-fixtures/pdfs/if_i_aint_got_you/If_I_Aint_Got_You_Alicia_Keys_.pdf", import.meta.url),
    );
    const pages = await renderPdfPages(await readFile(fixture), { targetWidth: 1400, allowLandscape: true });

    const firstPage = segmentStaffSystems([pages[0]!], { allowFragmentedRuns: true, staffLayout: "single-staff" });
    const densePage = segmentStaffSystems([pages[6]!], { allowFragmentedRuns: true, staffLayout: "single-staff" });

    expect(firstPage.systems.map((system) => system.staffLineYs[0])).toEqual([
      264, 387, 509, 731, 853, 976, 1197, 1320, 1442,
    ]);
    expect(densePage.systems.map((system) => system.staffLineYs[0])).toEqual([
      147, 270, 392, 614, 737, 859, 1081, 1203, 1326,
    ]);
    expect(densePage.systems.every((system) => system.localStaffSpacingPx > 5)).toBe(true);
  });

  it("segments the real scanned OLiMPiC system crop with landscape rendering enabled", async () => {
    const fixture = fileURLToPath(new URL("../../corpus/olimpic-scanned-v1/dev/6586696/input.pdf", import.meta.url));
    const pages = await renderPdfPages(await readFile(fixture), { allowLandscape: true });

    const result = segmentGrandStaffSystems(pages, { allowFragmentedRuns: true });

    expect(result.systems).toHaveLength(1);
    expect(result.systems[0]).toMatchObject({ pageIndex: 0, systemIndex: 0 });
  });

  it("prefers consistent staff spacing when fragmented rows include text-like decoys", () => {
    const input = page(0, 200, 320, [10, 37, 69, 92, 114, 160, 172, 184, 196, 208, 240, 252, 264, 276, 288]);
    for (let y = 160; y <= 288; y += 1) setBlack(input, 10, y);

    const result = segmentGrandStaffSystems([input], { allowFragmentedRuns: true });

    expect(result.systems).toHaveLength(1);
    expect(result.systems[0]!.staffLineYs).toEqual([160, 172, 184, 196, 208, 240, 252, 264, 276, 288]);
  });

  it("keeps a grand staff when dense notation leaves staggered fragments on adjacent staff lines", () => {
    const input = page(0, 1400, 260, []);
    const upperLines = [40, 51, 62, 73, 84] as const;
    const lowerLines = [150, 161, 172, 183, 194] as const;
    const upperRanges = [
      [123, 1249],
      [97, 1265],
      [85, 1265],
      [473, 801],
      [673, 1132],
    ] as const;

    upperLines.forEach((y, index) => setBlackRange(input, upperRanges[index]![0], upperRanges[index]![1], y));
    lowerLines.forEach((y) => setBlackRange(input, 85, 1265, y));
    for (let y = upperLines[0]; y <= lowerLines.at(-1)!; y += 1) setBlack(input, 800, y);

    const result = segmentGrandStaffSystems([input], { allowFragmentedRuns: true });

    expect(result.systems).toHaveLength(1);
    expect(result.systems[0]!.staffLineYs).toEqual([...upperLines, ...lowerLines]);
  });

  it("tolerates small accumulated row-center drift across a fragmented five-line staff", () => {
    const input = page(0, 1400, 260, []);
    const upperLines = [40, 50, 61, 73, 86] as const;
    const lowerLines = [150, 161, 172, 183, 194] as const;

    upperLines.forEach((y) => setBlackRange(input, 100, 1265, y));
    lowerLines.forEach((y) => setBlackRange(input, 100, 1265, y));
    for (let y = upperLines[0]; y <= lowerLines.at(-1)!; y += 1) setBlack(input, 800, y);

    const result = segmentGrandStaffSystems([input], { allowFragmentedRuns: true });

    expect(result.systems).toHaveLength(1);
    expect(result.systems[0]!.staffLineYs).toEqual([...upperLines, ...lowerLines]);
  });

  it("skips ledger-line decoys when only a later five-line candidate forms a connected grand staff", () => {
    const input = page(0, 1400, 240, []);
    const ledgerLineDecoys = [18, 29] as const;
    const upperLines = [40, 51, 62, 73, 84] as const;
    const lowerLines = [130, 141, 152, 163, 174] as const;

    [...ledgerLineDecoys, ...upperLines, ...lowerLines].forEach((y) => setBlackRange(input, 100, 1265, y));
    for (let y = upperLines[1]; y <= lowerLines.at(-1)!; y += 1) setBlack(input, 800, y);

    const result = segmentGrandStaffSystems([input], { allowFragmentedRuns: true });

    expect(result.systems).toHaveLength(1);
    expect(result.systems[0]!.staffLineYs).toEqual([...upperLines, ...lowerLines]);
  });

  it("accepts an otherwise isolated grand staff connected by a curved brace with small endpoint gaps", () => {
    const input = page(0, 1400, 240, []);
    const upperLines = [40, 51, 62, 73, 84] as const;
    const lowerLines = [130, 141, 152, 163, 174] as const;

    [...upperLines, ...lowerLines].forEach((y) => setBlackRange(input, 100, 1265, y));
    for (let y = 50; y <= 165; y += 1) setBlack(input, 800, y);

    const result = segmentGrandStaffSystems([input], { allowFragmentedRuns: true });

    expect(result.systems).toHaveLength(1);
    expect(result.systems[0]!.staffLineYs).toEqual([...upperLines, ...lowerLines]);
  });

  it("does not promote a short beam-like row into a staff through fragmented containment", () => {
    const input = page(0, 1400, 240, []);
    const upperLines = [40, 51, 62, 73, 84] as const;
    const lowerLines = [130, 141, 152, 163, 174] as const;

    setBlackRange(input, 700, 780, 29);
    [...upperLines, ...lowerLines].forEach((y) => setBlackRange(input, 100, 1265, y));
    for (let y = upperLines[0]; y <= lowerLines.at(-1)!; y += 1) setBlack(input, 800, y);

    const result = segmentGrandStaffSystems([input], { allowFragmentedRuns: true });

    expect(result.systems).toHaveLength(1);
    expect(result.systems[0]!.staffLineYs).toEqual([...upperLines, ...lowerLines]);
  });

  it("rejects missing staff lines, ambiguous pairings, and zero systems before inference", () => {
    const missingLine = page(0, 200, 160, [20, 26, 32, 38, 68, 74, 80, 86, 92]);
    const ambiguousPairing = page(0, 200, 180, [20, 26, 32, 38, 44, 68, 74, 80, 86, 92, 116, 122, 128, 134, 140]);
    const empty = page(0, 200, 160, []);

    for (const input of [missingLine, ambiguousPairing, empty]) {
      expect(() => segmentGrandStaffSystems([input])).toThrow(
        expect.objectContaining({
          code: "ENGINE_OUTPUT_INVALID",
          context: expect.objectContaining({ reason: "ambiguous-system-segmentation", pageIndex: 0 }),
        }),
      );
    }

    expect(() => segmentGrandStaffSystems([ambiguousPairing])).toThrow(
      expect.objectContaining({
        context: expect.objectContaining({ unpairedStaffLineYs: [[116, 122, 128, 134, 140]] }),
      }),
    );
  });
});

describe("piano-grand-staff-v1 identity", () => {
  it("freezes grand-staff non-fragmented options and leaves the omitted path fragmented auto", () => {
    expect(PIANO_GRAND_STAFF_SEGMENTATION_V1).toEqual({
      id: "piano-grand-staff-v1",
      detectorVersion: "rokot-staff-system-v2",
      staffLayout: "grand-staff",
      allowFragmentedRuns: false,
      pairAdjacentUnpairedGroups: false,
    });
    expect(segmentationOptionsForPianoGrandStaffV1()).toEqual({
      staffLayout: "grand-staff",
      allowFragmentedRuns: false,
      pairAdjacentUnpairedGroups: false,
    });
    expect(resolveFullPageSegmentation({})).toEqual({ allowFragmentedRuns: true, staffLayout: "auto" });
    expect(resolveFullPageSegmentation({ staffLayout: "grand-staff" })).toEqual({
      allowFragmentedRuns: true,
      staffLayout: "grand-staff",
    });
    expect(resolveFullPageSegmentation({ segmentationId: "piano-grand-staff-v1" })).toEqual(
      segmentationOptionsForPianoGrandStaffV1(),
    );
    expect(resolveFullPageSegmentation({ segmentationId: "piano-grand-staff-v1", staffLayout: "grand-staff" })).toEqual(
      segmentationOptionsForPianoGrandStaffV1(),
    );
  });

  it("fail-closes unknown identities and conflicting staff layouts", () => {
    expect(() => resolveFullPageSegmentation({ segmentationId: "learned-staff-system-v1" })).toThrow(
      expect.objectContaining({
        code: "INVALID_CLI_ARGUMENT",
        context: { command: "recognize", segmentationId: "learned-staff-system-v1" },
      }),
    );
    expect(() => resolveFullPageSegmentation({ segmentationId: "piano-grand-staff-v1", staffLayout: "auto" })).toThrow(
      expect.objectContaining({
        code: "INVALID_CLI_ARGUMENT",
        context: {
          command: "recognize",
          segmentationId: "piano-grand-staff-v1",
          staffLayout: "auto",
        },
      }),
    );
  });

  it("maps the identity onto the same detector call as explicit non-fragmented grand-staff", () => {
    const input = page(0, 200, 220, [20, 26, 32, 38, 44, 68, 74, 80, 86, 92]);
    const identity = segmentStaffSystems([input], segmentationOptionsForPianoGrandStaffV1());
    const explicit = segmentStaffSystems([input], { staffLayout: "grand-staff", allowFragmentedRuns: false });
    expect(identity).toEqual(explicit);
    expect(identity.systems).toHaveLength(1);
    expect(identity.systems[0]).toMatchObject({ staffLayout: "grand-staff", staffCount: 2 });
  });
});

function page(
  pageIndex: number,
  width: number,
  height: number,
  lineYs: readonly number[],
  lineEnd = width - 10,
): RenderedPdfPage {
  const pixels = new Uint8Array(width * height * 4).fill(255);
  const result: RenderedPdfPage = {
    pageIndex,
    pdfWidth: width,
    pdfHeight: height,
    pixelWidth: width,
    pixelHeight: height,
    scale: 1,
    format: "rgba",
    pixels,
    renderSha256: `render-${pageIndex}`,
  };
  for (const y of lineYs) {
    for (let x = 10; x < lineEnd; x += 1) setBlack(result, x, y);
  }
  for (let index = 0; index + 9 < lineYs.length; index += 10) {
    for (let y = lineYs[index]!; y <= lineYs[index + 9]!; y += 1) setBlack(result, 10, y);
  }
  return result;
}

function setBlack(page: RenderedPdfPage, x: number, y: number): void {
  const offset = (y * page.pixelWidth + x) * 4;
  page.pixels[offset] = 0;
  page.pixels[offset + 1] = 0;
  page.pixels[offset + 2] = 0;
  page.pixels[offset + 3] = 255;
}

function setBlackRange(page: RenderedPdfPage, startX: number, endX: number, y: number): void {
  for (let x = startX; x < endX; x += 1) setBlack(page, x, y);
}
