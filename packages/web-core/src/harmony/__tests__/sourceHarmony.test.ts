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
});
