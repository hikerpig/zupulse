import { describe, expect, it } from "vitest";
import { resolveLocale } from "../catalog";

describe("resolveLocale", () => {
  it.each([
    ["zh-CN", ["en-US"], "zh-CN"],
    ["en-US", ["zh-CN"], "en-US"],
    ["system", ["en-GB", "zh-CN"], "en-US"],
    ["system", ["zh-Hant", "en-US"], "zh-CN"],
    ["system", ["fr-FR"], "en-US"],
    ["system", [], "en-US"],
  ] as const)("resolves %s with %j to %s", (preference, systemLocales, expected) => {
    expect(resolveLocale(preference, systemLocales)).toBe(expected);
  });
});
