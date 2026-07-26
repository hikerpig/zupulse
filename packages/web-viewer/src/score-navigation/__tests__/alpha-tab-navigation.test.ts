import { describe, expect, it } from "vitest";
import { readAlphaTabStaffSystems } from "../alpha-tab-navigation";

describe("readAlphaTabStaffSystems", () => {
  it("normalizes ordered public staff-system bounds with written anchors", () => {
    expect(
      readAlphaTabStaffSystems({
        boundsLookup: {
          staffSystems: [
            {
              index: 1,
              realBounds: { x: 0, y: 220, w: 800, h: 180 },
              bars: [{ index: 2 }],
            },
            {
              index: 0,
              realBounds: { x: 0, y: 20, w: 800, h: 160 },
              bars: [{ index: 0 }, { index: 1 }],
            },
          ],
        },
      }),
    ).toEqual([
      {
        systemIndex: 0,
        firstMeasureIndex: 0,
        lastMeasureIndex: 1,
        x: 0,
        y: 20,
        width: 800,
        height: 160,
      },
      {
        systemIndex: 1,
        firstMeasureIndex: 2,
        lastMeasureIndex: 2,
        x: 0,
        y: 220,
        width: 800,
        height: 180,
      },
    ]);
  });

  it("returns unavailable when bounds are incomplete or non-finite", () => {
    expect(readAlphaTabStaffSystems({})).toBeUndefined();
    expect(
      readAlphaTabStaffSystems({
        boundsLookup: {
          staffSystems: [
            {
              index: 0,
              realBounds: { x: 0, y: Number.NaN, w: 800, h: 160 },
              bars: [{ index: 0 }],
            },
          ],
        },
      }),
    ).toBeUndefined();
  });
});
