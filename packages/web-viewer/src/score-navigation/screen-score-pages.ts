import type { ScoreSystemBounds } from "./alpha-tab-navigation";

export type ScreenScorePage = {
  index: number;
  systemIndexes: number[];
  anchorMeasureIndex: number;
  top: number;
  bottom: number;
  oversized: boolean;
};

export type ScreenScorePageProjection = {
  pages: ScreenScorePage[];
  pageIndexBySystem: Record<number, number>;
};

export function projectScreenScorePages(
  systems: readonly ScoreSystemBounds[],
  viewportHeight: number,
): ScreenScorePageProjection {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return { pages: [], pageIndexBySystem: {} };
  const ordered = [...systems].sort((a, b) => a.systemIndex - b.systemIndex);
  const pages: ScreenScorePage[] = [];

  for (const system of ordered) {
    const current = pages.at(-1);
    const systemBottom = system.y + system.height;
    if (!current || systemBottom - current.top > viewportHeight) {
      pages.push({
        index: pages.length,
        systemIndexes: [system.systemIndex],
        anchorMeasureIndex: system.firstMeasureIndex,
        top: system.y,
        bottom: systemBottom,
        oversized: system.height > viewportHeight,
      });
      continue;
    }
    current.systemIndexes.push(system.systemIndex);
    current.bottom = systemBottom;
  }

  return {
    pages,
    pageIndexBySystem: Object.fromEntries(
      pages.flatMap((page) => page.systemIndexes.map((systemIndex) => [systemIndex, page.index])),
    ),
  };
}
