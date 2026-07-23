import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

describe("alphaTab playback cursor styles", () => {
  it("uses camelCase for local CSS Module class names", async () => {
    const modules = await Promise.all([
      source("../app/pages/PageShell.module.css"),
      source("../app/pages/StudioPage.module.css"),
      source("../components/ScoreViewer.module.css"),
      source("../components/studio-split-workspace.module.css"),
      source("../components/Slider.module.css"),
      source("../features/PlaybackWorkspace.module.css"),
      source("../features/harmony-studio/harmony-range-workspace.module.css"),
      source("../features/SheetLibrary.module.css"),
    ]);

    for (const css of modules) {
      const localCss = css.replaceAll(/:global\([^)]*\)/g, "");
      expect(localCss).not.toMatch(/\.[a-zA-Z_][\w-]*-[\w-]*/);
    }
  });

  it("keeps the Studio panes independently scrollable and stacks them at the narrow breakpoint", async () => {
    const [splitCss, studioCss] = await Promise.all([
      source("../components/studio-split-workspace.module.css"),
      source("../app/pages/StudioPage.module.css"),
    ]);

    expect(splitCss).toMatch(/\.pane\s*{[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/s);
    expect(splitCss).toMatch(/--studio-left,\s*40%/);
    expect(splitCss).toMatch(/\.workspace\s*{[^}]*height:\s*100%;/s);
    expect(splitCss).toMatch(
      /@media \(max-width:\s*960px\)[\s\S]*?\.workspace\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s,
    );
    expect(splitCss).toMatch(/@media \(max-width:\s*960px\)[\s\S]*?\.splitter\s*{[^}]*display:\s*none;/s);
    expect(splitCss).toMatch(/@media \(max-width:\s*960px\)[\s\S]*?\.workspace\s*{[^}]*height:\s*auto;/s);
    expect(studioCss).not.toMatch(/\.exportBar\s*{/);
    expect(studioCss).toMatch(/\.analysisRegion\s*{[^}]*padding:\s*20px 24px;/s);
    expect(studioCss).toMatch(/\.utilityGrid\s*>\s*details\s*{[^}]*align-self:\s*start;[^}]*height:\s*fit-content;/s);
  });

  it("gives the Studio range rail room for segment metadata with visual coding", async () => {
    const css = await source("../features/harmony-studio/harmony-range-workspace.module.css");

    expect(css).toMatch(/\.workspace\s*{[^}]*grid-template-columns:\s*350px\s+minmax\(0,\s*1fr\);/s);
    expect(css).toMatch(
      /\.list button\s*{[^}]*align-items:\s*center;[^}]*justify-content:\s*space-between;[^}]*gap:\s*10px;/s,
    );
    expect(css).toMatch(/\.chordName\s*{[^}]*font-size:\s*15px;[^}]*font-weight:\s*700;/s);
    expect(css).toMatch(/@media \(max-width:\s*960px\)[\s\S]*?\.workspace\s*{[^}]*grid-template-columns:\s*1fr;/s);
  });

  it("reserves card boundaries for the primary Studio workspace and sticky export action", async () => {
    const [studioCss, rangeCss] = await Promise.all([
      source("../app/pages/StudioPage.module.css"),
      source("../features/harmony-studio/harmony-range-workspace.module.css"),
    ]);

    expect(studioCss).toMatch(
      /\.utilityPanel\s*{[^}]*border:\s*0;[^}]*border-top:\s*1px solid var\(--border-default\);[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s,
    );
    expect(studioCss).toMatch(
      /\.candidateList\s*{[^}]*border:\s*0;[^}]*border-bottom:\s*1px solid var\(--border-default\);[^}]*background:\s*transparent;/s,
    );
    expect(studioCss).toMatch(/\.chordBuilder\s*{[^}]*border:\s*1px solid var\(--border-default\);/s);
    expect(studioCss).toMatch(
      /\.degreeEditor\s*{[^}]*border:\s*0;[^}]*border-top:\s*1px solid var\(--border-default\);/s,
    );
    expect(studioCss).not.toMatch(/\.exportBar\s*{/);
    expect(rangeCss).toMatch(/\.workspace\s*{[^}]*border:\s*1px solid var\(--border-default\);/s);
  });

  it("loads Space Grotesk from Google Fonts and permits only its hosts", async () => {
    const [css, browserHtml, desktopHtml] = await Promise.all([
      source("../styles.css"),
      source("../../../../apps/web-demo/index.html"),
      source("../../../../apps/desktop-shell/index.html"),
    ]);

    expect(css).toContain(
      '@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap");',
    );
    for (const html of [browserHtml, desktopHtml]) {
      expect(html).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
      expect(html).toContain("font-src 'self' https://fonts.gstatic.com");
    }
  });

  it("makes cursors, played elements, and selections visible", async () => {
    const css = await source("../styles/vendors/alphaTab.css");

    expect(css).toMatch(/\.at-cursor-bar\s*{[^}]*background:/s);
    expect(css).toMatch(/\.at-cursor-beat\s*{[^}]*width:\s*3px;[^}]*background:/s);
    expect(css).toMatch(/\.at-highlight \*\s*{[^}]*fill:[^}]*stroke:/s);
    expect(css).toMatch(/\.at-selection div\s*{[^}]*background:/s);
  });

  it("uses container-width layouts while keeping one score scroll host and bottom transport", async () => {
    const [frameCss, appCss, scoreCss, workspaceCss, libraryCss] = await Promise.all([
      source("../app/App.module.css"),
      source("../app/pages/PageShell.module.css"),
      source("../components/ScoreViewer.module.css"),
      source("../features/PlaybackWorkspace.module.css"),
      source("../features/SheetLibrary.module.css"),
    ]);

    expect(frameCss).toMatch(/\.routeViewport\s*{[^}]*container-type:\s*inline-size;[^}]*container-name:\s*route;/s);
    expect(frameCss).toMatch(/\.appFrame\s*{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s);
    expect(frameCss).not.toMatch(/@media \(max-width:/);
    expect(appCss).toMatch(
      /\.appShell\s*{[^}]*height:\s*100%;[^}]*overflow:\s*hidden;[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;/s,
    );
    expect(appCss).toMatch(/@container route \(max-width:\s*900px\)/);
    expect(appCss).toMatch(/@container route \(max-width:\s*620px\)/);
    expect(appCss).not.toMatch(/@media \(max-width:/);
    expect(workspaceCss).toMatch(/\.workspace\s*{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
    expect(workspaceCss).toMatch(/\.workspace\s*{[^}]*grid-row:\s*2;/s);
    expect(workspaceCss).toMatch(/\.transportBar\s*{[^}]*grid-row:\s*3;/s);
    expect(workspaceCss).toMatch(/@container route \(max-width:\s*900px\)/);
    expect(workspaceCss).toMatch(/@container route \(max-width:\s*620px\)/);
    expect(workspaceCss).not.toMatch(/@media \(max-width:/);
    expect(scoreCss).toMatch(/\.stage\s*{[^}]*height:\s*100%;[^}]*overflow:\s*scroll;/s);
    expect(scoreCss).toMatch(/\.frame\s*{[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/s);
    expect(scoreCss).toMatch(/\.viewer\s*{[^}]*height:\s*auto;[^}]*min-height:\s*100%;[^}]*overflow:\s*visible;/s);
    expect(workspaceCss).toMatch(/\.practicePanel\s*{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
    expect(scoreCss).toMatch(/@container route \(max-width:\s*620px\)/);
    expect(scoreCss).not.toMatch(/@media \(max-width:/);
    expect(libraryCss).toMatch(/@container route \(max-width:\s*900px\)/);
    expect(libraryCss).toMatch(/@container route \(max-width:\s*620px\)/);
    expect(libraryCss).not.toMatch(/@media \(max-width:/);
    expect(`${appCss}\n${workspaceCss}\n${libraryCss}`).toContain("env(safe-area-inset-bottom)");
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
    expect(workspaceCss).toMatch(
      /\.transportBar\s*{[^}]*border-bottom:\s*1px solid[^}]*padding:[^}]*env\(safe-area-inset-bottom\)/s,
    );
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
