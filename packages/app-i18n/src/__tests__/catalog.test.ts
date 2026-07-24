import { describe, expect, it } from "vitest";
import { createAppI18n, namespaces, resources } from "../catalog";

function resourceShape(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return [prefix];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    resourceShape(child, prefix.length > 0 ? `${prefix}.${key}` : key),
  );
}

function resourcePlaceholders(value: unknown, prefix = ""): Record<string, string[]> {
  if (typeof value === "string") {
    return {
      [prefix]: [...value.matchAll(/\{\{(\w+)/g)].map((match) => match[1] ?? "").sort(),
    };
  }
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      Object.entries(resourcePlaceholders(child, prefix.length > 0 ? `${prefix}.${key}` : key)),
    ),
  );
}

describe("translation catalog", () => {
  it("keeps locale resource trees identical", () => {
    expect(resourceShape(resources["en-US"])).toEqual(resourceShape(resources["zh-CN"]));
  });

  it("keeps interpolation placeholders identical", () => {
    expect(resourcePlaceholders(resources["en-US"])).toEqual(resourcePlaceholders(resources["zh-CN"]));
  });

  it("selects locale plural forms from the semantic base key", () => {
    const english = createAppI18n("en-US");
    expect(english.t("library:scoreCount", { count: 1 })).toBe("1 score");
    expect(english.t("library:scoreCount", { count: 2 })).toBe("2 scores");
  });

  it("initializes every namespace synchronously", () => {
    const instance = createAppI18n("en-US");
    expect(namespaces.every((namespace) => instance.hasLoadedNamespace(namespace))).toBe(true);
  });

  it("keeps application instances isolated", async () => {
    const chinese = createAppI18n("zh-CN");
    const english = createAppI18n("en-US");

    await chinese.changeLanguage("en-US");

    expect(chinese.resolvedLanguage).toBe("en-US");
    expect(english.resolvedLanguage).toBe("en-US");
    await english.changeLanguage("zh-CN");
    expect(chinese.resolvedLanguage).toBe("en-US");
  });

  it("throws for missing keys in strict development mode", () => {
    const instance = createAppI18n("en-US", { strictMissingKeys: true });
    expect(() => instance.t("common:missing")).toThrow(/common:missing/);
  });
});
