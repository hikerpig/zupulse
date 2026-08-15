import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDesktopLocale } from "../locale";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("createDesktopLocale", () => {
  it("persists a preference before publishing the next locale state", async () => {
    const userData = await mkdtemp(join(tmpdir(), "zupulse-locale-module-"));
    roots.push(userData);
    const locale = await createDesktopLocale({ userData, getSystemLanguages: () => ["en-US"] });

    expect(locale.getState()).toEqual({ preference: "system", effectiveLocale: "en-US" });
    await expect(locale.setPreference("zh-CN")).resolves.toEqual({
      preference: "zh-CN",
      effectiveLocale: "zh-CN",
    });
    expect(locale.getEffectiveLocale()).toBe("zh-CN");

    const restored = await createDesktopLocale({ userData, getSystemLanguages: () => ["en-US"] });
    expect(restored.getState()).toEqual({ preference: "zh-CN", effectiveLocale: "zh-CN" });
  });
});
