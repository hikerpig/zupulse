# Score Workspace Internal Scrolling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop viewer a viewport-height workbench whose score scrolls internally during alphaTab playback while the top controls and practice panel remain visible.

**Architecture:** The existing `#alpha-tab` element remains the rendered score host, while its `.score-stage-frame` parent becomes alphaTab's explicit playback scroll target to avoid alphaTab 1.8.4 double-counting a host element's `scrollTop`. CSS propagates the remaining viewport height through the shell and workspace; the score frame and practice panel own their overflow, while the existing narrow-screen breakpoint restores natural document flow.

**Tech Stack:** TypeScript 5.5, CSS Grid, alphaTab 1.8.4, Vitest 2, jsdom, Rspack

---

## File Map

- Modify `packages/web-viewer/src/viewerApp.ts`: pass the score host's parent frame into alphaTab player settings as `scrollElement`.
- Modify `packages/web-viewer/src/viewerApp.test.ts`: verify cursor settings use the same host for rendering and playback scrolling.
- Modify `packages/web-viewer/src/styles.css`: implement desktop viewport containment, score/practice overflow, and narrow-screen natural-flow fallback.
- Modify `packages/web-viewer/src/styles.test.ts`: lock the scrolling layout and responsive fallback rules.

### Task 1: Bind alphaTab Playback Following to the Score Host

**Files:**
- Modify: `packages/web-viewer/src/viewerApp.ts:147,243-258`
- Test: `packages/web-viewer/src/viewerApp.test.ts:323-350`

- [ ] **Step 1: Extend the existing cursor settings test with the expected scroll target**

Capture the host and settings from the existing `createApi` spy, then assert identity rather than merely checking a selector string:

```ts
const [alphaTabHost, settings] = createApi.mock.calls[0] as [HTMLElement, {
  player: { scrollElement: HTMLElement };
}];

expect(settings.player).toEqual(expect.objectContaining({
  enablePlayer: true,
  enableCursor: true,
  enableAnimatedBeatCursor: true,
  enableElementHighlighting: true,
}));
expect(settings.player.scrollElement).toBe(alphaTabHost.parentElement);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
rtk pnpm test -- packages/web-viewer/src/viewerApp.test.ts
```

Expected: FAIL because `settings.player.scrollElement` is currently `undefined`.

- [ ] **Step 3: Pass the score host into settings**

Change the call site:

```ts
const scoreScrollElement = alphaTabHost.parentElement;
if (!scoreScrollElement) throw new Error("Viewer DOM is missing the score scroll container");
const api = dependencies.createApi(alphaTabHost, alphaTabSettings(scoreScrollElement));
```

Then change the helper signature and add the one new player property, leaving the existing font resource object byte-for-byte unchanged:

```diff
-function alphaTabSettings(): unknown {
+function alphaTabSettings(scrollElement: HTMLElement): unknown {
```

```diff
     player: {
       enablePlayer: true,
       enableCursor: true,
       enableAnimatedBeatCursor: true,
       enableElementHighlighting: true,
+      scrollElement,
       soundFont: ALPHATAB_ASSETS.soundFont,
     },
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
rtk pnpm test -- packages/web-viewer/src/viewerApp.test.ts
```

Expected: 21 tests pass with no failures.

- [ ] **Step 5: Commit the scroll-target change**

```bash
rtk git add packages/web-viewer/src/viewerApp.ts packages/web-viewer/src/viewerApp.test.ts
rtk git commit -m "fix: scroll score during alphaTab playback"
```

### Task 2: Constrain the Desktop Workbench to the Viewport

**Files:**
- Modify: `packages/web-viewer/src/styles.css:101-410`
- Test: `packages/web-viewer/src/styles.test.ts`

- [ ] **Step 1: Add failing CSS contract assertions**

Extend `styles.test.ts` with a separate test:

```ts
it("contains score scrolling within the desktop viewport and restores mobile document flow", async () => {
  const css = await readFile(new URL("./styles.css", import.meta.url), "utf8");

  expect(css).toMatch(/\.app-shell\s*{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s);
  expect(css).toMatch(/\.workspace\s*{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
  expect(css).toMatch(/\.score-stage-frame\s*{[^}]*height:\s*100%;[^}]*overflow:\s*auto;/s);
  expect(css).toMatch(/\.score-viewer\s*{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*visible;/s);
  expect(css).toMatch(/\.practice-panel\s*{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
  expect(css).toMatch(/@media \(max-width:\s*960px\)[\s\S]*?\.app-shell\s*{[^}]*height:\s*auto;[^}]*overflow:\s*visible;/s);
  expect(css).toMatch(/@media \(max-width:\s*960px\)[\s\S]*?\.score-stage-frame\s*{[^}]*height:\s*auto;[^}]*overflow:\s*visible;/s);
});
```

- [ ] **Step 2: Run the CSS test and verify RED**

Run:

```bash
rtk pnpm test -- packages/web-viewer/src/styles.test.ts
```

Expected: FAIL on the missing viewport containment rules.

- [ ] **Step 3: Implement the desktop height chain and overflow ownership**

Update the existing rules without introducing new DOM wrappers:

```css
.app-shell {
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
}

.workspace {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 20px;
  padding: 20px;
}

.score-stage {
  min-width: 0;
  min-height: 0;
}

.score-stage-frame {
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 18px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  background: var(--bg-score-shell);
  box-shadow: var(--shadow-soft);
}

.score-viewer {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: visible;
  padding: 24px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--bg-score);
}

.practice-panel {
  min-height: 0;
  overflow-y: auto;
  display: grid;
  gap: 16px;
  align-content: start;
}
```

- [ ] **Step 4: Add the narrow-screen natural-flow fallback**

Expand the existing `max-width: 960px` media query:

```css
@media (max-width: 960px) {
  .app-shell {
    height: auto;
    min-height: 100dvh;
    overflow: visible;
  }

  .workspace {
    grid-template-columns: minmax(0, 1fr);
    overflow: visible;
  }

  .score-stage-frame {
    height: auto;
    min-height: 72vh;
    overflow: visible;
  }

  .score-viewer {
    height: auto;
    min-height: calc(72vh - 36px);
    overflow: visible;
  }

  .practice-panel {
    overflow: visible;
  }
}
```

- [ ] **Step 5: Run the CSS test and verify GREEN**

Run:

```bash
rtk pnpm test -- packages/web-viewer/src/styles.test.ts
```

Expected: 2 tests pass with no failures.

- [ ] **Step 6: Run all web-viewer tests**

Run:

```bash
rtk pnpm test -- packages/web-viewer/src
```

Expected: all web-viewer test files pass.

- [ ] **Step 7: Commit the viewport layout**

```bash
rtk git add packages/web-viewer/src/styles.css packages/web-viewer/src/styles.test.ts
rtk git commit -m "feat: contain score scrolling in viewer workspace"
```

### Task 3: Verify Playback, Responsive Layout, and the Full Repository

**Files:**
- Verify only; no production files expected

- [ ] **Step 1: Start or reuse the demo server**

Run:

```bash
rtk pnpm demo:dev
```

Expected: Rspack serves `http://127.0.0.1:5173/` without compilation errors.

- [ ] **Step 2: Verify desktop playback behavior at 1440×900**

Using the browser automation workflow, load `test-fixtures/gp/Treasure.gp5`, start playback, and inspect scroll positions before and after alphaTab advances:

```js
({
  documentScrollY: window.scrollY,
  scoreScrollTop: document.querySelector("#alpha-tab").scrollTop,
  scoreClientHeight: document.querySelector("#alpha-tab").clientHeight,
  scoreScrollHeight: document.querySelector("#alpha-tab").scrollHeight,
  practiceRect: document.querySelector(".practice-panel").getBoundingClientRect(),
})
```

Expected:

- `window.scrollY` remains `0`.
- `scoreScrollHeight > scoreClientHeight`.
- `scoreScrollTop` increases when playback reaches a later system.
- The practice panel rectangle remains inside the viewport.
- The active bar and beat cursors remain inside the `#alpha-tab` visible rectangle after following.

- [ ] **Step 3: Verify narrow-screen fallback at 768px and 320px widths**

At both widths, inspect computed styles and keyboard navigation.

Expected:

- `.workspace` has one grid column.
- `.app-shell` computed height follows content rather than clipping it to the viewport.
- `.score-viewer` does not create a constrained nested vertical scroll area.
- Tab reaches Open, theme, playback, loop, and track controls in DOM order.
- No horizontal overflow occurs at 320px.

- [ ] **Step 4: Run fresh full verification**

Run:

```bash
rtk pnpm check
rtk pnpm demo:build
rtk git diff --check
```

Expected: typecheck passes, all Vitest tests pass, Rspack build and asset verification pass, and `git diff --check` prints no errors.

- [ ] **Step 5: Commit any verification-only test adjustment if one was required**

If browser verification exposed a missing automated assertion, add only that regression assertion and commit it with the directly related implementation file. If no files changed during verification, do not create an empty commit.
