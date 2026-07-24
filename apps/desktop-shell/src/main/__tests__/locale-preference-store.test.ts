import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalePreferenceStore } from "../locale-preference-store";

describe("LocalePreferenceStore", () => {
  it("defaults missing preferences to system and round-trips a private document", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "zupulse-locale-"));
    const store = new LocalePreferenceStore(directory);

    await expect(store.load()).resolves.toBe("system");
    await store.save("zh-CN");

    await expect(store.load()).resolves.toBe("zh-CN");
    expect(JSON.parse(await readFile(path.join(directory, "preferences.json"), "utf8"))).toEqual({
      schemaVersion: "1.0.0",
      localePreference: "zh-CN",
    });
    expect((await stat(path.join(directory, "preferences.json"))).mode & 0o777).toBe(0o600);
  });

  it("quarantines invalid documents and falls back to system", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "zupulse-locale-"));
    await writeFile(path.join(directory, "preferences.json"), '{"localePreference":"fr-FR"}');

    await expect(new LocalePreferenceStore(directory).load()).resolves.toBe("system");
    expect((await readdir(directory)).some((name) => name.endsWith(".corrupt"))).toBe(true);
  });
});
