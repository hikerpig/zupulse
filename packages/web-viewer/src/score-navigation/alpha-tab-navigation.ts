import type { AlphaTabApiLike } from "@zupulse/web-core";
import type { ScoreMeasureBounds } from "../practice-loop/loop-range-geometry";

export type ScoreSystemBounds = {
  systemIndex: number;
  firstMeasureIndex: number;
  lastMeasureIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ScoreStaffBounds = {
  systemIndex: number;
  staffId: string;
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

export function readAlphaTabMeasureBounds(api: AlphaTabApiLike): ScoreMeasureBounds[] | undefined {
  const systems = api.boundsLookup?.staffSystems;
  if (!systems?.length) return undefined;

  const measures = systems.flatMap((system) =>
    system.bars.map((bar): ScoreMeasureBounds | undefined => {
      const bounds = bar.realBounds;
      const values = [
        system.index,
        bar.index,
        bounds?.x,
        bounds?.y,
        bounds?.w,
        bounds?.h,
        system.realBounds.x,
        system.realBounds.y,
        system.realBounds.w,
        system.realBounds.h,
      ];
      if (!bounds || !values.every(Number.isFinite)) return undefined;
      return {
        systemIndex: system.index,
        measureIndex: bar.index,
        x: bounds.x,
        y: bounds.y,
        width: bounds.w,
        height: bounds.h,
        systemX: system.realBounds.x,
        systemY: system.realBounds.y,
        systemWidth: system.realBounds.w,
        systemHeight: system.realBounds.h,
      };
    }),
  );

  return measures.every((measure): measure is ScoreMeasureBounds => measure !== undefined)
    ? measures.sort((a, b) => a.measureIndex - b.measureIndex)
    : undefined;
}

export function readAlphaTabStaffBounds(api: AlphaTabApiLike): ScoreStaffBounds[] | undefined {
  const systems = api.boundsLookup?.staffSystems;
  if (!systems?.length) return undefined;
  const byStaffAndSystem = new Map<string, ScoreStaffBounds>();
  for (const system of systems) {
    for (const masterBar of system.bars) {
      for (const bar of masterBar.bars ?? []) {
        const bounds = bar.realBounds;
        const staffId = `track-${bar.bar.staff.track.index}:staff-${bar.bar.staff.index}`;
        const key = `${system.index}:${staffId}`;
        const existing = byStaffAndSystem.get(key);
        if (existing) {
          const left = Math.min(existing.x, bounds.x);
          const top = Math.min(existing.y, bounds.y);
          const right = Math.max(existing.x + existing.width, bounds.x + bounds.w);
          const bottom = Math.max(existing.y + existing.height, bounds.y + bounds.h);
          existing.x = left;
          existing.y = top;
          existing.width = right - left;
          existing.height = bottom - top;
        } else {
          byStaffAndSystem.set(key, {
            systemIndex: system.index,
            staffId,
            x: bounds.x,
            y: bounds.y,
            width: bounds.w,
            height: bounds.h,
          });
        }
      }
    }
  }
  return [...byStaffAndSystem.values()].sort(
    (a, b) => a.systemIndex - b.systemIndex || a.y - b.y || a.staffId.localeCompare(b.staffId),
  );
}
