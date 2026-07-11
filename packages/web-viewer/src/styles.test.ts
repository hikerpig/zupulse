import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("alphaTab playback cursor styles", () => {
  it("makes cursors, played elements, and selections visible", async () => {
    const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

    expect(css).toMatch(/\.at-cursor-bar\s*{[^}]*background:/s);
    expect(css).toMatch(/\.at-cursor-beat\s*{[^}]*width:\s*3px;[^}]*background:/s);
    expect(css).toMatch(/\.at-highlight \*\s*{[^}]*fill:[^}]*stroke:/s);
    expect(css).toMatch(/\.at-selection div\s*{[^}]*background:/s);
  });

  it("contains score scrolling within the desktop viewport and restores mobile document flow", async () => {
    const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

    expect(css).toMatch(/\.app-shell\s*{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/\.workspace\s*{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/\.score-stage[\s\S]*?\.score-stage-frame[\s\S]*?height:\s*100%;/s);
    expect(css).toMatch(/\.score-viewer\s*{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/s);
    expect(css).toMatch(/\.practice-panel\s*{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
    expect(css).toMatch(/@media \(max-width:\s*960px\)[\s\S]*?\.app-shell\s*{[^}]*height:\s*auto;[^}]*overflow:\s*visible;/s);
    expect(css).toMatch(/@media \(max-width:\s*960px\)[\s\S]*?\.score-viewer\s*{[^}]*height:\s*auto;[^}]*overflow:\s*visible;/s);
  });
});
