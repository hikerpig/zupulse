import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WrittenTimeMappingError, createWrittenTimeMap } from "../writtenTime";

describe("written time mapping", () => {
  it("round-trips legal source offsets across changing divisions without rounding", () => {
    const map = createWrittenTimeMap([1, 7, 11]);

    expect(map.ticksPerQuarter).toBe(77);

    const seventh = map.toMoment({ measureIndex: 0, divisions: 7, offsetDivisions: 1 });
    const eleventh = map.toMoment({ measureIndex: 1, divisions: 11, offsetDivisions: 5 });

    expect(seventh).toEqual({ measureIndex: 0, offsetTicks: 11 });
    expect(eleventh).toEqual({ measureIndex: 1, offsetTicks: 35 });
    expect(map.toSource(seventh, 7)).toEqual({ measureIndex: 0, divisions: 7, offsetDivisions: 1 });
    expect(map.toSource(eleventh, 11)).toEqual({ measureIndex: 1, divisions: 11, offsetDivisions: 5 });
  });

  it("uses the score timebase to represent a divisions change inside one measure", () => {
    const map = createWrittenTimeMap([4, 6]);
    const beforeChange = map.toMoment({ measureIndex: 2, divisions: 4, offsetDivisions: 3 });
    const afterChange = map.toMoment({ measureIndex: 2, divisions: 6, offsetDivisions: 5 });

    expect(map.ticksPerQuarter).toBe(12);
    expect(beforeChange).toEqual({ measureIndex: 2, offsetTicks: 9 });
    expect(afterChange).toEqual({ measureIndex: 2, offsetTicks: 10 });
    expect(map.toSource(beforeChange, 4).offsetDivisions).toBe(3);
    expect(map.toSource(afterChange, 6).offsetDivisions).toBe(5);
  });

  it("rejects a source division that cannot represent a legal moment exactly", () => {
    const map = createWrittenTimeMap([7]);
    const moment = map.toMoment({ measureIndex: 0, divisions: 7, offsetDivisions: 1 });

    expect(() => map.toSource(moment, 2)).toThrow(WrittenTimeMappingError);
  });

  it("rejects timebases that exceed the safe integer range", () => {
    expect(() => createWrittenTimeMap([Number.MAX_SAFE_INTEGER, 2])).toThrow(WrittenTimeMappingError);
  });

  it("rejects an empty divisions map", () => {
    expect(() => createWrittenTimeMap([])).toThrow(WrittenTimeMappingError);
  });

  it("preserves legal positions from the divisions-change tuplet fixture", async () => {
    const source = await readFile(resolve("test-fixtures/musicxml/generated/harmony-written-time.musicxml"), "utf8");
    const map = createWrittenTimeMap([7, 11]);
    const tupletStart = map.toMoment({ measureIndex: 0, divisions: 7, offsetDivisions: 1 });
    const changedDivisionOffset = map.toMoment({ measureIndex: 0, divisions: 11, offsetDivisions: 5 });

    expect(source).toContain("<backup><duration>7</duration></backup>");
    expect(source).toContain("<forward><duration>6</duration></forward>");
    expect(source).toContain("<actual-notes>7</actual-notes>");
    expect(tupletStart).toEqual({ measureIndex: 0, offsetTicks: 11 });
    expect(changedDivisionOffset).toEqual({ measureIndex: 0, offsetTicks: 35 });
    expect(map.toSource(tupletStart, 7).offsetDivisions).toBe(1);
    expect(map.toSource(changedDivisionOffset, 11).offsetDivisions).toBe(5);
  });
});
