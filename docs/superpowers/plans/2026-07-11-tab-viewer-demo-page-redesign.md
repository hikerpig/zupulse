# Tab Viewer Demo Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the shared web demo viewer shell so it reads as a calm, product-grade practice workspace instead of a technical verification page.

**Architecture:** Keep the current `mountViewerApp -> createDefaultOpenSession -> mountPlaybackControls` flow intact and focus the redesign on presentation boundaries. The implementation should separate static shell structure, state-to-view-model presentation, and dynamic control rendering so the page can later evolve toward a denser workstation without changing the session lifecycle.

**Tech Stack:** TypeScript, Vitest, jsdom, shared `@tab-viewer/web-viewer` package, shared `@tab-viewer/web-core` playback state, CSS in `packages/web-viewer/src/styles.css`

## Global Constraints

- Use the current visual language: `Calm Precision`.
- Preserve a future path toward a denser `Studio Workbench` direction later.
- Use a `workspace-first` narrative with no separate marketing hero section.
- Keep the score as the visual focal point.
- Keep playback, speed, looping, and track behavior as the primary operational layer.
- Keep file, restore, and session context legible without scattering status across unrelated regions.
- Prefer calm, restrained structure over dramatic color, motion, or decorative chrome.
- Keep the page architecture to five persistent regions: top context bar, main transport bar, score stage, right practice panel, bottom context strip.
- Keep the right panel grouped as `Loop`, `Tracks`, and `Session`.
- Keep the layout desktop-first while remaining usable at narrow widths by moving the right panel below the score stage.
- Do not add new product scope beyond the current GP demo slice.
- Do not solve MIDI presentation in this change.
- Do not introduce a landing-page-style header above the workspace.

---

## File Structure

- Modify: `packages/web-viewer/src/viewerShell.ts`
  - Replace the minimal HTML shell with the new context bar, transport bar, score stage, three-section practice panel, and bottom context strip.
- Modify: `packages/web-viewer/src/viewerApp.ts`
  - Expand `renderViewerState()` so the shell can show context-bar status, summary text, and empty-state messaging without changing the session lifecycle logic.
- Modify: `packages/web-viewer/src/playbackPresenter.ts`
  - Add explicit presentation fields for audio status, persistence status, session summary text, and bottom-strip labels.
- Modify: `packages/web-viewer/src/playbackControls.ts`
  - Render the redesigned Loop / Tracks / Session regions and wire them to the existing playback commands.
- Modify: `packages/web-viewer/src/styles.css`
  - Replace the current utilitarian styling with the new layout, palette, spacing, stage treatment, and responsive behavior.
- Modify: `packages/web-viewer/src/viewerApp.test.ts`
  - Lock in the new shell IDs and empty-state/status expectations.
- Modify: `packages/web-viewer/src/playbackPresenter.test.ts`
  - Lock in the new view-model fields and wording.
- Modify: `packages/web-viewer/src/playbackControls.test.ts`
  - Lock in the new dynamic rendering and command wiring for Loop / Tracks / Session content.

## Task 1: Rebuild The Static Viewer Shell

**Files:**

- Modify: `packages/web-viewer/src/viewerShell.ts`
- Test: `packages/web-viewer/src/viewerApp.test.ts`

**Interfaces:**

- Consumes: `mountViewerApp()` requires `#open-score`; `createDefaultOpenSession()` requires `#alpha-tab`, `#status`, and `#summary`.
- Produces:
  - Shell IDs kept for session wiring: `open-score`, `status`, `summary`, `alpha-tab`
  - New shell IDs for presentational regions: `context-caption`, `audio-status`, `session-summary`, `session-strip`

- [ ] **Step 1: Write the failing shell-structure tests**

Add assertions near the top of `packages/web-viewer/src/viewerApp.test.ts`:

```ts
it("renders the redesigned workspace shell", () => {
  renderViewerShell(document);

  expect(document.querySelector(".context-bar")).not.toBeNull();
  expect(document.querySelector(".transport-bar")).not.toBeNull();
  expect(document.querySelector(".score-stage")).not.toBeNull();
  expect(document.querySelector(".practice-panel")).not.toBeNull();
  expect(document.querySelector(".session-strip")).not.toBeNull();
  expect(document.getElementById("open-score")?.textContent).toContain("打开 GP 文件");
});

it("renders a productized empty score stage before a file opens", () => {
  renderViewerShell(document);

  expect(document.getElementById("alpha-tab-empty-title")?.textContent).toBe("打开一份 Guitar Pro 乐谱开始练习");
  expect(document.getElementById("alpha-tab-empty-copy")?.textContent).toContain(".gp3 .gp4 .gp5 .gpx .gp");
});
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `pnpm test packages/web-viewer/src/viewerApp.test.ts`

Expected: FAIL with missing selectors such as `.context-bar`, `.score-stage`, or `#alpha-tab-empty-title`.

- [ ] **Step 3: Replace the shell markup with the new workspace structure**

Update `packages/web-viewer/src/viewerShell.ts` to this shape:

```ts
export function renderViewerShell(ownerDocument: Document): void {
  ownerDocument.body.innerHTML = `
    <main class="app-shell">
      <header class="context-bar">
        <div class="context-brand">
          <p class="eyebrow">Tab Viewer</p>
          <h1 id="summary" class="context-title">未打开乐谱</h1>
          <p id="context-caption" class="context-caption">单一练习工作区，聚焦查看、播放与循环练习。</p>
        </div>
        <div class="context-actions">
          <p id="status" class="status-badge" role="status">等待选择文件</p>
          <button id="open-score" class="primary-button" type="button">打开 GP 文件</button>
        </div>
      </header>

      <section class="transport-bar" aria-label="播放控制">
        <div class="transport-main">
          <button id="play-toggle" class="primary-button" type="button" disabled>播放</button>
          <button id="play-stop" type="button" disabled>停止</button>
        </div>
        <div class="transport-progress">
          <span class="time-readout"><span id="play-current-time">0:00</span> / <span id="play-duration">0:00</span></span>
          <label class="progress-control">
            <span class="sr-only">播放进度</span>
            <input id="play-progress" type="range" min="0" max="1000" value="0">
          </label>
        </div>
        <div class="transport-meta">
          <label class="speed-control">
            <span>速度</span>
            <input id="play-speed" aria-label="速度" type="range" min="25" max="200" step="5" value="100">
            <output id="play-speed-value">100%</output>
          </label>
          <p id="audio-status" class="status-badge subtle">音频准备中</p>
          <button id="soundfont-retry" type="button" hidden>重试音频</button>
        </div>
      </section>

      <section class="workspace">
        <section class="score-stage" aria-label="乐谱工作区">
          <div class="score-stage-frame">
            <section id="alpha-tab" class="score-viewer" aria-label="乐谱预览">
              <div class="score-empty-state">
                <p id="alpha-tab-empty-title" class="empty-title">打开一份 Guitar Pro 乐谱开始练习</p>
                <p id="alpha-tab-empty-copy" class="empty-copy">支持 .gp3 .gp4 .gp5 .gpx .gp，本地读取，不上传文件。</p>
              </div>
            </section>
          </div>
        </section>

        <aside class="practice-panel" aria-label="练习设置">
          <section class="panel-section" aria-labelledby="loop-panel-title">
            <div class="panel-header">
              <p id="loop-panel-title">Loop</p>
              <label class="toggle-row"><input id="loop-enabled" type="checkbox"><span>启用循环</span></label>
            </div>
            <div class="panel-content">
              <div class="button-row">
                <button id="loop-set-a" type="button">设为 A</button>
                <button id="loop-set-b" type="button">设为 B</button>
                <button id="loop-save" type="button">保存区间</button>
              </div>
              <label><span>边界吸附</span><select id="loop-snap-mode"><option value="off">关闭</option><option value="beat" selected>按拍</option><option value="measure">按小节</option></select></label>
              <label><span>A 点</span><input id="loop-start" type="range" min="0" max="1000" value="0"></label>
              <label><span>B 点</span><input id="loop-end" type="range" min="0" max="1000" value="0"></label>
              <div id="loop-list" class="item-list"></div>
            </div>
          </section>

          <section class="panel-section" aria-labelledby="tracks-panel-title">
            <div class="panel-header"><p id="tracks-panel-title">Tracks</p></div>
            <div id="track-list" class="panel-content item-list"></div>
          </section>

          <section class="panel-section" aria-labelledby="session-panel-title">
            <div class="panel-header"><p id="session-panel-title">Session</p></div>
            <div class="panel-content">
              <p id="session-summary" class="session-summary">等待载入乐谱</p>
              <p id="playback-persistence-status" class="persistence-status"></p>
            </div>
          </section>
        </aside>
      </section>

      <footer id="session-strip" class="session-strip" aria-label="当前会话摘要"></footer>
    </main>`;
}
```

- [ ] **Step 4: Re-run the targeted tests**

Run: `pnpm test packages/web-viewer/src/viewerApp.test.ts`

Expected: PASS for the new shell-structure assertions, while older behavior tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web-viewer/src/viewerShell.ts packages/web-viewer/src/viewerApp.test.ts
git commit -m "feat: rebuild viewer shell layout"
```

### Task 2: Present Context, Audio, And Session Summary State

**Files:**

- Modify: `packages/web-viewer/src/viewerApp.ts`
- Modify: `packages/web-viewer/src/playbackPresenter.ts`
- Test: `packages/web-viewer/src/playbackPresenter.test.ts`
- Test: `packages/web-viewer/src/viewerApp.test.ts`

**Interfaces:**

- Consumes:
  - `DemoState` from `presentGpFile()`
  - `PlaybackState` from `PlaybackController`
- Produces:
  - `renderViewerState(status, summary, state): void` continues to own file-open state copy
  - `presentPlayback(state)` now returns:
    - `audioStatusLabel: string`
    - `audioStatusTone: "subtle" | "ready" | "error"`
    - `persistenceMessage: string`
    - `sessionSummary: string`
    - `sessionFacts: Array<{ label: string; value: string }>`

- [ ] **Step 1: Write failing presenter tests for the new copy**

Extend `packages/web-viewer/src/playbackPresenter.test.ts` with:

```ts
it("presents audio, persistence, and session facts for the redesigned shell", () => {
  const view = presentPlayback(
    playbackState({
      soundFont: "ready",
      persistence: "saving",
      activeLoopId: "loop-1",
    }),
  );

  expect(view.audioStatusLabel).toBe("音频已就绪");
  expect(view.audioStatusTone).toBe("ready");
  expect(view.persistenceMessage).toBe("正在保存练习设置");
  expect(view.sessionSummary).toContain("Lead");
  expect(view.sessionFacts).toEqual([
    { label: "Tracks", value: "2" },
    { label: "Tempo", value: "100%" },
    { label: "Loop", value: "Verse" },
    { label: "Primary", value: "Lead" },
  ]);
});

it("falls back to quiet status copy when no loop is active", () => {
  const view = presentPlayback(playbackState({ activeLoopId: undefined, soundFont: "loading" }));

  expect(view.audioStatusLabel).toBe("音频准备中");
  expect(view.audioStatusTone).toBe("subtle");
  expect(view.sessionFacts[2]).toEqual({ label: "Loop", value: "未启用" });
});
```

Add one `renderViewerState()` assertion in `packages/web-viewer/src/viewerApp.test.ts`:

```ts
expect(document.getElementById("summary")?.textContent).toContain("Treasure");
expect(document.getElementById("context-caption")?.textContent).toContain("3 tracks");
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `pnpm test packages/web-viewer/src/playbackPresenter.test.ts packages/web-viewer/src/viewerApp.test.ts`

Expected: FAIL with missing fields such as `audioStatusLabel` or old `renderViewerState()` copy.

- [ ] **Step 3: Expand the playback presenter and viewer state renderer**

Update the `PlaybackViewModel` in `packages/web-viewer/src/playbackPresenter.ts`:

```ts
export type PlaybackViewModel = {
  playLabel: "播放" | "暂停";
  playDisabled: boolean;
  stopDisabled: boolean;
  currentTime: string;
  duration: string;
  progress: number;
  speedPercent: number;
  looping: boolean;
  loopDraftStart: number;
  loopDraftEnd: number;
  loopSnapMode: "off" | "beat" | "measure";
  soundFontRetryVisible: boolean;
  audioStatusLabel: string;
  audioStatusTone: "subtle" | "ready" | "error";
  persistenceMessage: string;
  sessionSummary: string;
  sessionFacts: Array<{ label: string; value: string }>;
  loops: Array<...>;
  tracks: Array<...>;
};
```

Fill the new fields inside `presentPlayback()`:

```ts
const primaryTrack =
  state.tracks.find((track) => track.id === state.trackState.primaryVisibleTrackId)?.name ?? "未选择";
const activeLoop =
  state.loops.find((loop) => loop.id === state.activeLoopId && loop.deletedAt === undefined)?.label ?? "未启用";

return {
  ...existingFields,
  audioStatusLabel: audioStatusLabel(state.soundFont),
  audioStatusTone: audioStatusTone(state.soundFont),
  persistenceMessage: persistenceMessage(state.persistence),
  sessionSummary: `${primaryTrack} · ${state.tracks.length} 个轨道 · ${Math.round(state.scoreSpeed * 100)}% 速度`,
  sessionFacts: [
    { label: "Tracks", value: String(state.tracks.length) },
    { label: "Tempo", value: `${Math.round(state.scoreSpeed * 100)}%` },
    { label: "Loop", value: activeLoop },
    { label: "Primary", value: primaryTrack },
  ],
};
```

Add the helpers:

```ts
function audioStatusLabel(soundFont: PlaybackState["soundFont"]): string {
  if (soundFont === "ready") return "音频已就绪";
  if (soundFont === "error") return "音频初始化失败";
  return "音频准备中";
}

function audioStatusTone(soundFont: PlaybackState["soundFont"]): "subtle" | "ready" | "error" {
  if (soundFont === "ready") return "ready";
  if (soundFont === "error") return "error";
  return "subtle";
}
```

Update `renderViewerState()` in `packages/web-viewer/src/viewerApp.ts`:

```ts
export function renderViewerState(status: HTMLElement, summary: HTMLElement, state: DemoState): void {
  const contextCaption = required<HTMLElement>(summary.ownerDocument, "context-caption");

  status.textContent = state.message;
  if (state.status !== "ready" || !state.summary) {
    summary.textContent = "未打开乐谱";
    contextCaption.textContent = "单一练习工作区，聚焦查看、播放与循环练习。";
    return;
  }

  const artist = state.summary.artist ? ` · ${state.summary.artist}` : "";
  const tempo = state.summary.tempo === undefined ? "" : ` · ${state.summary.tempo} bpm`;
  summary.textContent = state.summary.title;
  contextCaption.textContent = `${state.summary.trackCount} tracks · ${state.summary.masterBarCount} bars${artist}${tempo}`;
}
```

- [ ] **Step 4: Re-run the targeted tests**

Run: `pnpm test packages/web-viewer/src/playbackPresenter.test.ts packages/web-viewer/src/viewerApp.test.ts`

Expected: PASS with the new presenter fields and context-bar copy.

- [ ] **Step 5: Commit**

```bash
git add packages/web-viewer/src/playbackPresenter.ts packages/web-viewer/src/viewerApp.ts packages/web-viewer/src/playbackPresenter.test.ts packages/web-viewer/src/viewerApp.test.ts
git commit -m "feat: present viewer session context"
```

### Task 3: Render The Redesigned Loop, Tracks, And Session Regions

**Files:**

- Modify: `packages/web-viewer/src/playbackControls.ts`
- Test: `packages/web-viewer/src/playbackControls.test.ts`

**Interfaces:**

- Consumes:
  - `presentPlayback(state)` with `audioStatusLabel`, `audioStatusTone`, `sessionSummary`, and `sessionFacts`
  - existing `PlaybackCommand` command names
- Produces:
  - `mountPlaybackControls()` updates:
    - `#audio-status`
    - `#session-summary`
    - `#session-strip`
  - loop and track rows rendered with product-style metadata blocks while preserving existing `data-action` attributes

- [ ] **Step 1: Write failing control-render tests for the new UI regions**

Add to `packages/web-viewer/src/playbackControls.test.ts`:

```ts
it("renders audio status, session summary, and bottom-strip facts", () => {
  document.body.innerHTML = controlsHtml();
  mountPlaybackControls(document, new FakeController(playbackState()), timeline);

  expect(document.getElementById("audio-status")?.textContent).toBe("音频已就绪");
  expect(document.getElementById("session-summary")?.textContent).toContain("Lead");
  expect(document.getElementById("session-strip")?.textContent).toContain("Tracks");
  expect(document.getElementById("session-strip")?.textContent).toContain("Loop");
});

it("renders product-style loop and track rows", () => {
  document.body.innerHTML = controlsHtml();
  mountPlaybackControls(document, new FakeController(playbackState()), timeline);

  expect(document.querySelector(".loop-card")).not.toBeNull();
  expect(document.querySelector(".track-card")).not.toBeNull();
  expect(document.querySelector('[data-action="rename-loop"]')).not.toBeNull();
  expect(document.querySelector('[data-action="track-volume"]')).not.toBeNull();
});
```

Update `controlsHtml()` to include the new host nodes:

```ts
<p id="audio-status"></p>
<p id="session-summary"></p>
<div id="session-strip"></div>
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `pnpm test packages/web-viewer/src/playbackControls.test.ts`

Expected: FAIL with missing `#audio-status`, `#session-summary`, `#session-strip`, `.loop-card`, or `.track-card`.

- [ ] **Step 3: Update control rendering to fill the new regions**

In `packages/web-viewer/src/playbackControls.ts`, update `render()`:

```ts
elements.audioStatus.textContent = view.audioStatusLabel;
elements.audioStatus.className = `status-badge ${view.audioStatusTone}`;
elements.sessionSummary.textContent = view.sessionSummary;
elements.sessionStrip.replaceChildren(
  ...view.sessionFacts.map((fact) => {
    const item = ownerDocument.createElement("div");
    item.className = "session-fact";

    const label = ownerDocument.createElement("span");
    label.className = "session-fact-label";
    label.textContent = fact.label;

    const value = ownerDocument.createElement("strong");
    value.className = "session-fact-value";
    value.textContent = fact.value;

    item.append(label, value);
    return item;
  }),
);
```

Update `renderLoops()` to wrap each row as a card:

```ts
const row = ownerDocument.createElement("article");
row.className = "loop-card";

const top = ownerDocument.createElement("div");
top.className = "loop-card-top";

const meta = ownerDocument.createElement("div");
meta.className = "loop-card-meta";
meta.append(name, range);

const actions = ownerDocument.createElement("div");
actions.className = "loop-card-actions";
actions.append(select, remove);

top.append(meta, actions);

const bottom = ownerDocument.createElement("div");
bottom.className = "loop-card-bottom";
bottom.append(speed);

row.append(top, bottom);
```

Update `renderTracks()` similarly:

```ts
const row = ownerDocument.createElement("article");
row.className = "track-card";

const heading = ownerDocument.createElement("div");
heading.className = "track-card-heading";
heading.append(title, labelFor(ownerDocument, primary, "主轨"), labelFor(ownerDocument, additional, "显示"));

const mix = ownerDocument.createElement("div");
mix.className = "track-card-mix";
mix.append(labelFor(ownerDocument, mute, "静音"), labelFor(ownerDocument, solo, "独奏"));

const volumeWrap = ownerDocument.createElement("label");
volumeWrap.className = "track-card-volume";
volumeWrap.append(ownerDocument.createElement("span"), volume);
volumeWrap.firstElementChild!.textContent = "音量";

row.append(heading, mix, volumeWrap);
```

Add new required nodes in `queryElements()`:

```ts
audioStatus: required<HTMLElement>(ownerDocument, "audio-status"),
sessionSummary: required<HTMLElement>(ownerDocument, "session-summary"),
sessionStrip: required<HTMLElement>(ownerDocument, "session-strip"),
```

- [ ] **Step 4: Re-run the targeted tests**

Run: `pnpm test packages/web-viewer/src/playbackControls.test.ts`

Expected: PASS with the new render assertions and the existing command-dispatch assertions still passing.

- [ ] **Step 5: Commit**

```bash
git add packages/web-viewer/src/playbackControls.ts packages/web-viewer/src/playbackControls.test.ts
git commit -m "feat: redesign practice panel rendering"
```

### Task 4: Apply Calm Precision Styling And Verify The Full Demo

**Files:**

- Modify: `packages/web-viewer/src/styles.css`
- Verify: `packages/web-viewer/src/viewerApp.test.ts`
- Verify: `packages/web-viewer/src/playbackPresenter.test.ts`
- Verify: `packages/web-viewer/src/playbackControls.test.ts`

**Interfaces:**

- Consumes:
  - shell class names from `viewerShell.ts`
  - control-render class names from `playbackControls.ts`
- Produces:
  - responsive layout for `.context-bar`, `.transport-bar`, `.workspace`, `.score-stage`, `.practice-panel`, `.session-strip`
  - visual state tokens for `.status-badge.subtle`, `.status-badge.ready`, `.status-badge.error`

- [ ] **Step 1: Write a failing style-level shell test**

Add one DOM-level expectation to `packages/web-viewer/src/viewerApp.test.ts`:

```ts
it("keeps the score workspace and practice panel as separate desktop regions", () => {
  renderViewerShell(document);

  expect(document.querySelector(".workspace")?.querySelector(".score-stage")).not.toBeNull();
  expect(document.querySelector(".workspace")?.querySelector(".practice-panel")).not.toBeNull();
});
```

This is a cheap guard that the final CSS task is styling the intended structure rather than changing markup ad hoc.

- [ ] **Step 2: Run the targeted tests**

Run: `pnpm test packages/web-viewer/src/viewerApp.test.ts`

Expected: PASS or fail only if markup drifted. If it already passes, keep it as the regression guard and continue.

- [ ] **Step 3: Replace the utilitarian CSS with the new layout and visual system**

Update `packages/web-viewer/src/styles.css` around these blocks:

```css
:root {
  color: #182028;
  background: #f3f5f7;
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

body {
  margin: 0;
  color: #182028;
  background: radial-gradient(circle at top left, rgba(31, 122, 107, 0.08), transparent 24%), #f3f5f7;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
}

.context-bar,
.transport-bar,
.session-strip {
  padding-inline: 20px;
}

.context-bar {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding-top: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #d9e0e6;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
}

.context-title {
  margin: 4px 0;
  font-size: 24px;
  line-height: 1.2;
}

.context-caption,
.session-summary,
.empty-copy,
.session-fact-label {
  color: #5f6b76;
}

.primary-button {
  color: #ffffff;
  background: #1f7a6b;
  border-color: #1f7a6b;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid #d9e0e6;
  border-radius: 999px;
  background: #f8fafb;
  font-size: 12px;
  white-space: nowrap;
}

.status-badge.ready {
  color: #1f7a6b;
  background: #ddf3ee;
  border-color: #b9e6d8;
}

.status-badge.error {
  color: #b24c43;
  background: #f8e6e4;
  border-color: #ebc6c1;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 20px;
  padding: 20px;
}

.score-stage-frame {
  min-height: 72vh;
  padding: 18px;
  border: 1px solid #d9e0e6;
  border-radius: 20px;
  background: linear-gradient(180deg, #f8fafb 0%, #eef3f6 100%);
}

.score-viewer {
  min-height: calc(72vh - 36px);
  overflow: auto;
  padding: 24px;
  border-radius: 16px;
  background: #ffffff;
}

.score-empty-state {
  display: grid;
  place-items: center;
  gap: 12px;
  min-height: 320px;
  text-align: center;
}

.practice-panel {
  display: grid;
  gap: 16px;
  align-content: start;
}

.panel-section {
  border: 1px solid #d9e0e6;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
}

.panel-header,
.panel-content {
  padding: 16px;
}

.loop-card,
.track-card {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid #e4eaef;
  border-radius: 12px;
  background: #f8fafb;
}

.session-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  padding-top: 12px;
  padding-bottom: 20px;
  border-top: 1px solid #d9e0e6;
  background: rgba(255, 255, 255, 0.92);
}

@media (max-width: 960px) {
  .workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .session-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .context-bar,
  .transport-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .session-strip {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 4: Run the full repo checks for the redesign**

Run: `pnpm check && pnpm demo:build`

Expected:

- `pnpm typecheck` PASS
- `pnpm test` PASS
- `pnpm --filter @tab-viewer/web-demo build` PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web-viewer/src/styles.css packages/web-viewer/src/viewerApp.test.ts
git commit -m "feat: apply calm precision viewer styling"
```

## Spec Coverage Review

- `Calm Precision` visual language: covered by Task 4 CSS palette, spacing, and badge system.
- `workspace-first` narrative: covered by Task 1 shell structure.
- Five persistent regions: covered by Task 1 shell structure and Task 4 responsive CSS.
- Context bar and top-level session status: covered by Task 1 shell IDs and Task 2 `renderViewerState()`.
- Main transport bar and audio status treatment: covered by Task 1 markup, Task 2 presenter fields, Task 3 control rendering.
- Score stage and productized empty state: covered by Task 1 markup and Task 4 styling.
- Right-side `Loop / Tracks / Session` grouping: covered by Task 1 structure and Task 3 rendering.
- Bottom context strip: covered by Task 1 shell, Task 2 `sessionFacts`, and Task 3 rendering.
- Desktop-first with narrow-width fallback: covered by Task 4 media queries.

## Placeholder Scan

- No `TBD`, `TODO`, or “implement later” placeholders remain.
- Each task includes exact file paths, targeted tests, implementation snippets, commands, and commit messages.

## Type Consistency Review

- Existing wiring stays stable around `mountViewerApp()`, `createDefaultOpenSession()`, and `mountPlaybackControls()`.
- New presenter fields are introduced once in `PlaybackViewModel` and then consumed only through `presentPlayback(state)`.
- Existing playback command names and DOM IDs required by the session lifecycle stay intact: `open-score`, `status`, `summary`, `alpha-tab`.
