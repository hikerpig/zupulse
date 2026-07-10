import { describe, expect, it } from "vitest";
import * as alphaTab from "@coderline/alphatab";

describe("alphaTab dependency", () => {
  it("exposes the public importer and browser api used by the GP adapter", () => {
    expect(alphaTab.importer.ScoreLoader.loadScoreFromBytes).toBeTypeOf("function");
    expect(alphaTab.AlphaTabApi).toBeTypeOf("function");
    expect(alphaTab.Settings).toBeTypeOf("function");
  });
});
