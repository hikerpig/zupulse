import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("alphaTab playback cursor styles", () => {
  it("uses camelCase for local CSS Module class names", async () => {
    const modules = await Promise.all([
      source("../app/pages/PageShell.module.css"),
      source("../app/pages/StudioPage.module.css"),
      source("../components/ScoreViewer.module.css"),
      source("../components/Slider.module.css"),
      source("../features/PlaybackWorkspace.module.css"),
      source("../features/SheetLibrary.module.css"),
    ]);

    for (const css of modules) {
      const localCss = css.replaceAll(/:global\([^)]*\)/g, "");
      expect(localCss).not.toMatch(/\.[a-zA-Z_][\w-]*-[\w-]*/);
    }
  });

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
    const [appCss, scoreCss, workspaceCss] = await Promise.all([
      source("../app/pages/PageShell.module.css"),
      source("../components/ScoreViewer.module.css"),
      source("../features/PlaybackWorkspace.module.css"),
    ]);

    expect(appCss).toMatch(/\.appShell\s*{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s);
    expect(workspaceCss).toMatch(/\.workspace\s*{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
    expect(scoreCss).toMatch(/\.frame\s*{[^}]*height:\s*100%;[^}]*overflow:\s*auto;/s);
    expect(scoreCss).toMatch(/\.viewer\s*{[^}]*height:\s*auto;[^}]*min-height:\s*100%;[^}]*overflow:\s*visible;/s);
    expect(workspaceCss).toMatch(/\.practicePanel\s*{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
    expect(appCss).toMatch(
      /@media \(max-width:\s*960px\)[\s\S]*?\.appShell\s*{[^}]*height:\s*auto;[^}]*overflow:\s*visible;/s,
    );
    expect(scoreCss).toMatch(
      /@media \(max-width:\s*960px\)[\s\S]*?\.stage:not\(\.compact\) \.frame\s*{[^}]*height:\s*auto;[^}]*overflow:\s*visible;/s,
    );
  });

  it("keeps the public stylesheet limited to common and vendor styles", async () => {
    const [entryCss, viewerSource, librarySource, workspaceSource, sliderSource] = await Promise.all([
      source("../styles.css"),
      source("../app/pages/ViewerPage.tsx"),
      source("../features/SheetLibrary.tsx"),
      source("../features/PlaybackWorkspace.tsx"),
      source("../components/Slider.tsx"),
    ]);

    expect(entryCss).toMatch(/@layer tokens, base, vendor, components;/);
    expect(entryCss).toMatch(/@import "\.\/styles\/tokens\.css" layer\(tokens\);/);
    expect(entryCss).toMatch(/@import "\.\/styles\/common\.css" layer\(base\);/);
    expect(entryCss).toMatch(/@import "\.\/styles\/vendors\/alphaTab\.css" layer\(vendor\);/);
    expect(viewerSource).toContain('import styles from "./PageShell.module.css";');
    expect(librarySource).toContain('import styles from "./SheetLibrary.module.css";');
    expect(workspaceSource).toContain('import styles from "./PlaybackWorkspace.module.css";');
    expect(sliderSource).toContain('import styles from "./Slider.module.css";');
  });

  it("loads cascade layers before component modules in both application entries", async () => {
    const [browserEntry, desktopEntry] = await Promise.all([
      source("../../../../apps/web-demo/src/main.ts"),
      source("../../../../apps/desktop-shell/src/renderer.ts"),
    ]);

    for (const entry of [browserEntry, desktopEntry]) {
      expect(entry.indexOf('import "@zupulse/web-viewer/styles.css";')).toBeLessThan(
        entry.indexOf('from "@zupulse/web-viewer"'),
      );
    }
  });

  it("keeps the library page out of the viewer grid regardless of stylesheet order", async () => {
    const css = await source("../features/SheetLibrary.module.css");

    expect(css).toMatch(/\.libraryShell\s*{[^}]*display:\s*block;/s);
  });

  it("keeps the library sort control visibly focusable", async () => {
    const css = await source("../features/SheetLibrary.module.css");

    expect(css).not.toMatch(/\.libraryControls \.librarySort select:focus-visible\s*{[^}]*box-shadow:\s*none;/s);
  });

  it("uses a compact continuous-surface workbench with a clean score surface", async () => {
    const [scoreCss, workspaceCss] = await Promise.all([
      source("../components/ScoreViewer.module.css"),
      source("../features/PlaybackWorkspace.module.css"),
    ]);

    expect(workspaceCss).toMatch(/\.workspace\s*{[^}]*display:\s*block;[^}]*padding:\s*12px;/s);
    expect(workspaceCss).toMatch(/\.transportBar\s*{[^}]*border-bottom:\s*1px solid[^}]*padding:\s*8px 12px;/s);
    expect(workspaceCss).toMatch(/\.transportDivider\s*{[^}]*width:\s*1px;[^}]*align-self:\s*stretch;/s);
    expect(workspaceCss).toMatch(/\.practicePanel\s*{[^}]*top:\s*8px;[^}]*right:\s*8px;[^}]*bottom:\s*8px;/s);
    expect(scoreCss).toMatch(/\.viewer\s*{[^}]*background:\s*var\(--bg-score\);/s);
    expect(scoreCss).toMatch(
      /\.viewer :global\(\.at-surface\)\s*{[^}]*display:\s*block;[^}]*background:\s*var\(--bg-score\);/s,
    );
  });

  it("keeps playback progress on the toolbar edge until it is interactive", async () => {
    const [workspaceCss, sliderCss] = await Promise.all([
      source("../features/PlaybackWorkspace.module.css"),
      source("../components/Slider.module.css"),
    ]);

    expect(workspaceCss).toMatch(
      /\.transportProgress\s*{[^}]*position:\s*absolute;[^}]*inset-inline:\s*0;[^}]*bottom:\s*-1px;/s,
    );
    expect(sliderCss).toMatch(/\.progress \.track\s*{[^}]*height:\s*2px;/s);
    expect(sliderCss).toMatch(/\.progress \.thumb\s*{[^}]*opacity:\s*0;/s);
    expect(sliderCss).toMatch(/\.progress:is\(:hover, :focus-within\) \.track\s*{[^}]*height:\s*6px;/s);
    expect(sliderCss).toMatch(/\.progress:is\(:hover, :focus-within\) \.thumb\s*{[^}]*opacity:\s*1;/s);
  });

  it("keeps third-party score layers below viewer controls through shared stacking tokens", async () => {
    const [tokensCss, scoreCss, workspaceCss, libraryCss, alphaTabCss] = await Promise.all([
      source("../styles/tokens.css"),
      source("../components/ScoreViewer.module.css"),
      source("../features/PlaybackWorkspace.module.css"),
      source("../features/SheetLibrary.module.css"),
      source("../styles/vendors/alphaTab.css"),
    ]);

    expect(tokensCss).toMatch(/--z-index-score:\s*0;/);
    expect(tokensCss).toMatch(/--z-index-score-cursor:\s*10;/);
    expect(tokensCss).toMatch(/--z-index-transport:\s*20;/);
    expect(tokensCss).toMatch(/--z-index-practice-panel:\s*30;/);
    expect(tokensCss).toMatch(/--z-index-library-editor:\s*40;/);
    expect(tokensCss).toMatch(/--z-index-library-dialog:\s*50;/);
    expect(scoreCss).toMatch(/\.stage\s*{[^}]*position:\s*relative;[^}]*z-index:\s*var\(--z-index-score\);/s);
    expect(workspaceCss).toMatch(/\.transportBar\s*{[^}]*z-index:\s*var\(--z-index-transport\);/s);
    expect(workspaceCss).toMatch(/\.practicePanel\s*{[^}]*z-index:\s*var\(--z-index-practice-panel\);/s);
    expect(libraryCss).toMatch(/\.libraryEditor\s*{[^}]*z-index:\s*var\(--z-index-library-editor\);/s);
    expect(libraryCss).toMatch(/\.libraryDialog\s*{[^}]*z-index:\s*var\(--z-index-library-dialog\);/s);
    expect(alphaTabCss).toMatch(
      /\.score-viewer \.at-cursors\s*{[^}]*z-index:\s*var\(--z-index-score-cursor\)\s*!important;/s,
    );
  });
});
