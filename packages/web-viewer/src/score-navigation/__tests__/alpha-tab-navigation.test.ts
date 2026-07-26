import { describe, expect, it } from "vitest";
import { readAlphaTabMeasureBounds, readAlphaTabStaffSystems } from "../alpha-tab-navigation";

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

describe("readAlphaTabMeasureBounds", () => {
  it("projects public master-bar bounds with their parent system geometry", () => {
    expect(
      readAlphaTabMeasureBounds({
        boundsLookup: {
          staffSystems: [
            {
              index: 0,
              realBounds: { x: 10, y: 20, w: 800, h: 160 },
              bars: [
                { index: 0, realBounds: { x: 30, y: 20, w: 360, h: 160 } },
                { index: 1, realBounds: { x: 390, y: 20, w: 400, h: 160 } },
              ],
            },
          ],
        },
      }),
    ).toEqual([
      {
        systemIndex: 0,
        measureIndex: 0,
        x: 30,
        y: 20,
        width: 360,
        height: 160,
        systemX: 10,
        systemY: 20,
        systemWidth: 800,
        systemHeight: 160,
      },
      {
        systemIndex: 0,
        measureIndex: 1,
        x: 390,
        y: 20,
        width: 400,
        height: 160,
        systemX: 10,
        systemY: 20,
        systemWidth: 800,
        systemHeight: 160,
      },
    ]);
  });
});
