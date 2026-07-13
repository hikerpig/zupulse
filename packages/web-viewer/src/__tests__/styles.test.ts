import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("alphaTab playback cursor styles", () => {
  it("does not load stylesheets that violate the offline CSP", async () => {
    const css = await source("../styles.css");

    expect(css).not.toMatch(/@import\s+url\(['"]?https?:\/\//);
  });

  it("makes cursors, played elements, and selections visible", async () => {
    const css = await source("../styles/vendors/alphaTab.css");

    expect(css).toMatch(/\.at-cursor-bar\s*{[^}]*background:/s);
    expect(css).toMatch(/\.at-cursor-beat\s*{[^}]*width:\s*3px;[^}]*background:/s);
    expect(css).toMatch(/\.at-highlight \*\s*{[^}]*fill:[^}]*stroke:/s);
    expect(css).toMatch(/\.at-selection div\s*{[^}]*background:/s);
  });

  it("contains score scrolling within the desktop viewport and restores mobile document flow", async () => {
    const [appCss, workspaceCss] = await Promise.all([
      source("../app/App.css"),
      source("../features/PlaybackWorkspace.css"),
    ]);

    expect(appCss).toMatch(/\.app-shell\s*{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s);
    expect(workspaceCss).toMatch(/\.workspace\s*{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
    expect(appCss).toMatch(/\.score-stage-frame\s*{[^}]*height:\s*100%;[^}]*overflow:\s*auto;/s);
    expect(appCss).toMatch(/\.score-viewer\s*{[^}]*height:\s*auto;[^}]*min-height:\s*100%;[^}]*overflow:\s*visible;/s);
    expect(workspaceCss).toMatch(/\.practice-panel\s*{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
    expect(appCss).toMatch(
      /@media \(max-width:\s*960px\)[\s\S]*?\.app-shell\s*{[^}]*height:\s*auto;[^}]*overflow:\s*visible;/s,
    );
    expect(appCss).toMatch(
      /@media \(max-width:\s*960px\)[\s\S]*?\.score-stage-frame\s*{[^}]*height:\s*auto;[^}]*overflow:\s*visible;/s,
    );
  });

  it("keeps the public stylesheet limited to common and vendor styles", async () => {
    const [entryCss, appSource, librarySource, workspaceSource, sliderSource] = await Promise.all([
      source("../styles.css"),
      source("../app/App.tsx"),
      source("../features/SheetLibrary.tsx"),
      source("../features/PlaybackWorkspace.tsx"),
      source("../components/Slider.tsx"),
    ]);

    expect(entryCss).toMatch(/@import "\.\/styles\/common\.css";/);
    expect(entryCss).toMatch(/@import "\.\/styles\/vendors\/alphaTab\.css";/);
    expect(appSource).toContain('import "./App.css";');
    expect(librarySource).toContain('import "./SheetLibrary.css";');
    expect(workspaceSource).toContain('import "./PlaybackWorkspace.css";');
    expect(sliderSource).toContain('import "./Slider.css";');
  });

  it("uses a compact continuous-surface workbench with a clean score surface", async () => {
    const [appCss, workspaceCss] = await Promise.all([
      source("../app/App.css"),
      source("../features/PlaybackWorkspace.css"),
    ]);

    expect(workspaceCss).toMatch(/\.workspace\s*{[^}]*display:\s*block;[^}]*padding:\s*12px;/s);
    expect(workspaceCss).toMatch(/\.transport-bar\s*{[^}]*border-bottom:\s*1px solid[^}]*padding:\s*8px 12px;/s);
    expect(workspaceCss).toMatch(/\.transport-divider\s*{[^}]*width:\s*1px;[^}]*align-self:\s*stretch;/s);
    expect(workspaceCss).toMatch(/\.practice-panel\s*{[^}]*top:\s*8px;[^}]*right:\s*8px;[^}]*bottom:\s*8px;/s);
    expect(appCss).toMatch(/\.score-viewer\s*{[^}]*background:\s*var\(--bg-score\);/s);
    expect(appCss).toMatch(
      /\.score-viewer \.at-surface\s*{[^}]*display:\s*block;[^}]*background:\s*var\(--bg-score\);/s,
    );
  });
});
