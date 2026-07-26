import type { AlphaTabApiLike } from "@zupulse/web-core";

export type ScoreSystemBounds = {
  systemIndex: number;
  firstMeasureIndex: number;
  lastMeasureIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export function readAlphaTabStaffSystems(api: AlphaTabApiLike): ScoreSystemBounds[] | undefined {
  const systems = api.boundsLookup?.staffSystems;
  if (!systems?.length) return undefined;

  const normalized = systems
    .map((system): ScoreSystemBounds | undefined => {
      const first = system.bars[0]?.index;
      const last = system.bars.at(-1)?.index;
      const values = [
        system.index,
        first,
        last,
        system.realBounds.x,
        system.realBounds.y,
        system.realBounds.w,
        system.realBounds.h,
      ];
      if (first === undefined || last === undefined || !values.every(Number.isFinite)) return undefined;
      return {
        systemIndex: system.index,
        firstMeasureIndex: first,
        lastMeasureIndex: last,
        x: system.realBounds.x,
        y: system.realBounds.y,
        width: system.realBounds.w,
        height: system.realBounds.h,
      };
    })
    .sort((a, b) => (a?.systemIndex ?? 0) - (b?.systemIndex ?? 0));

  return normalized.every((system): system is ScoreSystemBounds => system !== undefined) ? normalized : undefined;
}
