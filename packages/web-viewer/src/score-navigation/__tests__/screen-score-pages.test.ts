import { describe, expect, it } from "vitest";
import { projectScreenScorePages } from "../screen-score-pages";

describe("projectScreenScorePages", () => {
  it("packs consecutive complete systems using their real gaps", () => {
    const projection = projectScreenScorePages(
      [system(0, 0, 180, 0), system(1, 220, 180, 2), system(2, 450, 180, 4)],
      420,
    );

    expect(projection.pages.map((page) => page.systemIndexes)).toEqual([[0, 1], [2]]);
    expect(projection.pages.map((page) => page.anchorMeasureIndex)).toEqual([0, 4]);
    expect(projection.pageIndexBySystem).toEqual({ 0: 0, 1: 0, 2: 1 });
  });

  it("keeps an oversized system on an explicit page", () => {
    const projection = projectScreenScorePages([system(0, 20, 600, 0), system(1, 640, 100, 4)], 400);

    expect(projection.pages[0]).toMatchObject({ systemIndexes: [0], oversized: true });
    expect(projection.pages[1]).toMatchObject({ systemIndexes: [1], oversized: false });
  });
});

function system(systemIndex: number, y: number, height: number, firstMeasureIndex: number) {
  return {
    systemIndex,
    firstMeasureIndex,
    lastMeasureIndex: firstMeasureIndex + 1,
    x: 0,
    y,
    width: 800,
    height,
  };
}
