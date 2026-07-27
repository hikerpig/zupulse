import { describe, expect, it } from "vitest";
import { parseSourceHarmonyEvents, projectSourceHarmonyEvents } from "../sourceHarmony";

describe("source harmony", () => {
  it("parses supported symbols, N.C., and preserves unsupported kinds", () => {
    const xml = `<score-partwise><part id="P1"><measure number="1"><harmony><root><root-step>C</root-step></root><kind text="major">major</kind></harmony><harmony><root><root-step>D</root-step></root><kind>other</kind></harmony></measure></part></score-partwise>`;
    const events = parseSourceHarmonyEvents(xml);
    expect(events.map((event) => event.type)).toEqual(["chord", "unresolved"]);
    expect(events[0]).toMatchObject({ type: "chord", chord: { root: { step: "C" }, kind: "major" } });
    expect(events[1]).toMatchObject({ type: "unresolved", reason: "unsupported-source-harmony" });
  });

  it("extends point events to the next source event and keeps N.C. fixed", () => {
    const events = projectSourceHarmonyEvents(
      [
        {
          type: "chord",
          moment: { measureIndex: 0, offsetTicks: 0 },
          chord: { root: { step: "C", alter: 0 }, kind: "major", degrees: [] },
        },
        { type: "no-chord", moment: { measureIndex: 1, offsetTicks: 0 } },
      ],
      { measureIndex: 2, offsetTicks: 0 },
    );
    expect(events[0]?.range).toEqual({
      start: { measureIndex: 0, offsetTicks: 0 },
      end: { measureIndex: 1, offsetTicks: 0 },
    });
    expect(events[1]?.type).toBe("no-chord");
  });

  it("limits source events to the requested part", () => {
    const xml = `<score-partwise><part id="P1"><measure><harmony><root><root-step>C</root-step></root><kind>major</kind></harmony></measure></part><part id="P2"><measure><harmony><root><root-step>D</root-step></root><kind>minor</kind></harmony></measure></part></score-partwise>`;
    expect(parseSourceHarmonyEvents(xml, "P2")[0]).toMatchObject({
      type: "chord",
      chord: { root: { step: "D" }, kind: "minor" },
    });
  });

  it("converts source harmony offsets from effective divisions to alphaTab ticks", () => {
    const xml = `<score-partwise><part id="P1"><measure><attributes><divisions>8</divisions></attributes><harmony><root><root-step>C</root-step></root><kind>major</kind><offset>8</offset></harmony><harmony><root><root-step>D</root-step></root><kind>minor</kind><offset>4</offset></harmony></measure><measure><harmony><root><root-step>E</root-step></root><kind>minor</kind><offset>0.008333333333333333</offset></harmony></measure></part></score-partwise>`;

    expect(parseSourceHarmonyEvents(xml, "P1").map((event) => event.moment)).toEqual([
      { measureIndex: 0, offsetTicks: 480 },
      { measureIndex: 0, offsetTicks: 960 },
      { measureIndex: 1, offsetTicks: 1 },
    ]);
  });
});
