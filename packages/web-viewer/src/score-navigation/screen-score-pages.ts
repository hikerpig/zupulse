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
  loopRange?: { startMeasureIndex: number; endMeasureIndex: number },
): ScreenScorePageProjection {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return { pages: [], pageIndexBySystem: {} };
  const ordered = [...systems].sort((a, b) => a.systemIndex - b.systemIndex);
  const pages: ScreenScorePage[] = [];
  const loopSystemIndexes = loopRange
    ? ordered
        .map((system, index) => ({ system, index }))
        .filter(
          ({ system }) =>
            system.lastMeasureIndex >= loopRange.startMeasureIndex &&
            system.firstMeasureIndex <= loopRange.endMeasureIndex,
        )
        .map(({ index }) => index)
    : [];
  const loopStart = loopSystemIndexes[0];
  const loopEnd = loopSystemIndexes.at(-1);
  const loopFits =
    loopStart !== undefined &&
    loopEnd !== undefined &&
    ordered[loopEnd]!.y + ordered[loopEnd]!.height - ordered[loopStart]!.y <= viewportHeight;

  for (const [systemPosition, system] of ordered.entries()) {
    const current = pages.at(-1);
    const systemBottom = system.y + system.height;
    const startsLoopPage = loopFits && systemPosition === loopStart && Boolean(current?.systemIndexes.length);
    const isInsideFittingLoop =
      loopFits &&
      loopStart !== undefined &&
      loopEnd !== undefined &&
      systemPosition > loopStart &&
      systemPosition <= loopEnd;
    if (!current || startsLoopPage || (!isInsideFittingLoop && systemBottom - current.top > viewportHeight)) {
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
