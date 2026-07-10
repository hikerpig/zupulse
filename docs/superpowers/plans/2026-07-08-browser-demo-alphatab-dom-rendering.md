# Browser Demo alphaTab DOM Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出第一个可手动试用的浏览器 demo：用户选择本地 GP 文件后，alphaTab 在页面 DOM 容器中渲染谱面，并显示文件/加载状态。

**Architecture:** 新增一个轻量 `web-demo` workspace，作为未来 WKWebView UI 的浏览器原型。`web-demo` 只负责 DOM、文件输入和页面状态；GP 加载、格式识别、alphaTab façade 仍从 `@tab-viewer/web-core` 复用。

**Tech Stack:** TypeScript、Vite、Vitest、jsdom、`@coderline/alphatab@1.8.4`、现有 `@tab-viewer/web-core`。

## Global Constraints

- 使用中文写文档。
- 第一版不 fork alphaTab，优先使用公共 API、配置项、wrapper、adapter、上游 issue / PR。
- 第一版支持 Guitar Pro：`.gp3`、`.gp4`、`.gp5`、`.gpx`、`.gp`。
- Web Core 不能直接假设平台能力，必须通过 Bridge capability discovery。
- Native Shell 不直接理解谱面排版细节。
- 本计划不实现 SwiftUI / WKWebView 壳层。
- 本计划不实现完整播放音频后端。
- 本计划不引入账号、同步、CloudKit 或本机库。

---

## Scope Check

本计划只实现“浏览器里可试用 GP 渲染”的最小产品切片：

- 新增 `web-demo` workspace。
- Vite dev server 可启动。
- 页面含文件选择、状态区、summary 区、alphaTab 渲染容器。
- 只接受 GP 文件扩展名。
- 读取本地文件 bytes，调用 `createAlphaTabApi(...).load(bytes)` 渲染。
- 用 Vitest + jsdom 覆盖 DOM 状态和 presenter 行为。

不做：

- 播放音频和 SoundFont 配置。
- iOS/macOS app 壳层。
- 文件持久化、sidecar 持久化、CloudKit。
- MIDI。
- 真实 GP fixture 入仓。

## File Structure

- Modify: `package.json`  
  添加 `web-demo` workspace 和 `demo:dev` / `demo:build` 脚本。
- Modify: `tsconfig.json`  
  添加 `web-demo` project reference。
- Modify: `web-core/src/gp/alphaTabBrowser.ts`  
  给 `AlphaTabApiLike` 增加 `load` 和 `destroy`，供 demo 消费。
- Create: `web-demo/package.json`  
  Demo 包配置。
- Create: `web-demo/tsconfig.json`  
  Demo TypeScript 配置。
- Create: `web-demo/index.html`  
  Vite 入口页面。
- Create: `web-demo/src/main.ts`  
  浏览器启动入口。
- Create: `web-demo/src/demoApp.ts`  
  绑定 DOM、处理文件选择、调用 presenter。
- Create: `web-demo/src/gpDemoPresenter.ts`  
  纯 TypeScript presenter，负责校验、读取 bytes、调用 alphaTab API、返回 UI state。
- Create: `web-demo/src/styles.css`  
  最小可用布局和 alphaTab 容器样式。
- Test: `web-demo/src/*.test.ts`  
  Presenter 和 DOM 绑定测试。
- Create: `docs/architecture/browser-demo-alphatab-dom-rendering.md`  
  记录如何构建和试用 demo。

## Task 1: Demo Workspace And Vite Skeleton

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `web-demo/package.json`
- Create: `web-demo/tsconfig.json`
- Create: `web-demo/index.html`
- Create: `web-demo/src/main.ts`
- Create: `web-demo/src/styles.css`
- Test: `web-demo/src/main.test.ts`

**Interfaces:**
- Consumes:
  - Root pnpm workspace.
- Produces:
  - `web-demo` workspace.
  - Root scripts:
    - `pnpm demo:dev`
    - `pnpm demo:build`

- [ ] **Step 1: Write the failing smoke test**

Create `web-demo/src/main.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEMO_APP_NAME } from "./main";

describe("demo entry", () => {
  it("exposes a stable demo app name", () => {
    expect(DEMO_APP_NAME).toBe("Tab Viewer Demo");
  });
});
```

- [ ] **Step 2: Update package and TypeScript workspace files**

Modify root `package.json`:

```json
{
  "name": "tab-viewer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -b",
    "check": "pnpm typecheck && pnpm test",
    "demo:dev": "pnpm --filter @tab-viewer/web-demo dev",
    "demo:build": "pnpm --filter @tab-viewer/web-demo build"
  },
  "workspaces": [
    "web-core",
    "web-demo"
  ],
  "devDependencies": {
    "@types/node": "^20.14.0",
    "jsdom": "^24.1.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

Modify root `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    {
      "path": "./web-core"
    },
    {
      "path": "./web-demo"
    }
  ]
}
```

Create `web-demo/package.json`:

```json
{
  "name": "@tab-viewer/web-demo",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "vite build"
  },
  "dependencies": {
    "@tab-viewer/web-core": "0.1.0"
  },
  "devDependencies": {}
}
```

Create `web-demo/tsconfig.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "skipLibCheck": true,
    "lib": [
      "ES2022",
      "DOM"
    ],
    "types": [
      "node",
      "vitest"
    ]
  },
  "references": [
    {
      "path": "../web-core"
    }
  ],
  "include": [
    "src/**/*.ts"
  ]
}
```

- [ ] **Step 3: Create minimal page and entry files**

Create `web-demo/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tab Viewer Demo</title>
  </head>
  <body>
    <main class="app-shell">
      <section class="toolbar">
        <label class="file-picker">
          <span>选择 GP 文件</span>
          <input id="score-file" type="file" accept=".gp3,.gp4,.gp5,.gpx,.gp" />
        </label>
        <p id="status" role="status">等待选择文件</p>
      </section>
      <section id="summary" class="summary" aria-live="polite"></section>
      <section id="alpha-tab" class="score-viewer" aria-label="乐谱预览"></section>
    </main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Create `web-demo/src/main.ts`:

```ts
import "./styles.css";

export const DEMO_APP_NAME = "Tab Viewer Demo";

if (typeof document !== "undefined") {
  void import("./demoApp").then(({ mountDemoApp }) => {
    mountDemoApp(document);
  });
}
```

Create `web-demo/src/styles.css`:

```css
:root {
  color: #1d1d1f;
  background: #f7f7f4;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto auto 1fr;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  background: #ffffff;
  border-bottom: 1px solid #deded8;
}

.file-picker {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
}

.summary {
  min-height: 28px;
  padding: 10px 20px;
  color: #4a4a45;
  background: #fbfbf8;
  border-bottom: 1px solid #e8e8e1;
}

.score-viewer {
  min-height: 70vh;
  overflow: auto;
  padding: 20px;
  background: #ffffff;
}
```

- [ ] **Step 4: Run test to verify it fails before install/update**

Run:

```bash
pnpm test -- web-demo/src/main.test.ts
```

Expected: FAIL if dependencies/workspace links are not installed yet, or PASS after `pnpm install`. If it fails only because `web-demo` workspace is not installed, continue to Step 5.

- [ ] **Step 5: Install and run checks**

Run:

```bash
pnpm install
pnpm check
pnpm demo:build
```

Expected: `pnpm check` passes. `pnpm demo:build` creates a Vite production build successfully.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json web-demo/package.json web-demo/tsconfig.json web-demo/index.html web-demo/src/main.ts web-demo/src/main.test.ts web-demo/src/styles.css
git commit -m "feat: scaffold browser demo workspace"
```

## Task 2: Extend alphaTab Browser Facade For Loading

**Files:**
- Modify: `web-core/src/gp/alphaTabBrowser.ts`
- Modify: `web-core/src/gp/alphaTabBrowser.test.ts`

**Interfaces:**
- Consumes:
  - Existing `AlphaTabApiLike`
  - Existing `createAlphaTabApi`
- Produces:
  - `AlphaTabApiLike.load(scoreData: unknown, trackIndexes?: number[]): boolean`
  - `AlphaTabApiLike.destroy(): void`
  - `function loadAlphaTabBytes(api: AlphaTabApiLike, bytes: Uint8Array): boolean`

- [ ] **Step 1: Add failing tests**

Append to `web-core/src/gp/alphaTabBrowser.test.ts`:

```ts
import { loadAlphaTabBytes } from "./alphaTabBrowser";

describe("loadAlphaTabBytes", () => {
  it("delegates bytes to AlphaTabApi.load", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const api = {
      load(scoreData: unknown) {
        expect(scoreData).toBe(bytes);
        return true;
      },
    };

    expect(loadAlphaTabBytes(api, bytes)).toBe(true);
  });

  it("returns false when load is unavailable", () => {
    expect(loadAlphaTabBytes({}, new Uint8Array([1]))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test -- web-core/src/gp/alphaTabBrowser.test.ts
```

Expected: FAIL because `loadAlphaTabBytes` is not exported.

- [ ] **Step 3: Implement load façade**

Modify `web-core/src/gp/alphaTabBrowser.ts`:

```ts
import * as alphaTab from "@coderline/alphatab";

export type AlphaTabPositionEvent = {
  positionMs: number;
  endMs?: number;
  tickPosition?: number;
};

export type AlphaTabApiLike = {
  play?: () => unknown;
  destroy?: () => void;
  load?: (scoreData: unknown, trackIndexes?: number[]) => boolean;
  playerPositionChanged?: {
    on(handler: (arg: unknown) => void): () => void;
  };
};

export type AlphaTabApiFactory = (element: HTMLElement, options: unknown) => AlphaTabApiLike;

export function createAlphaTabApi(
  element: HTMLElement,
  options: unknown = {},
  factory: AlphaTabApiFactory = defaultAlphaTabApiFactory,
): AlphaTabApiLike {
  return factory(element, options);
}

export function loadAlphaTabBytes(api: AlphaTabApiLike, bytes: Uint8Array): boolean {
  return api.load?.(bytes) ?? false;
}

export function attachAlphaTabPositionEvents(
  api: AlphaTabApiLike,
  emit: (event: AlphaTabPositionEvent) => void,
): () => void {
  const detach = api.playerPositionChanged?.on(arg => {
    const event = arg as { currentTime?: number; endTime?: number; tickPosition?: number };
    const mapped: AlphaTabPositionEvent = {
      positionMs: event.currentTime ?? 0,
    };
    if (event.endTime !== undefined) {
      mapped.endMs = event.endTime;
    }
    if (event.tickPosition !== undefined) {
      mapped.tickPosition = event.tickPosition;
    }
    emit(mapped);
  });

  return detach ?? (() => {});
}

function defaultAlphaTabApiFactory(element: HTMLElement, options: unknown): AlphaTabApiLike {
  return new alphaTab.AlphaTabApi(element, options as alphaTab.Settings);
}
```

- [ ] **Step 4: Run check**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-core/src/gp/alphaTabBrowser.ts web-core/src/gp/alphaTabBrowser.test.ts
git commit -m "feat: expose alphatab byte loading"
```

## Task 3: Demo Presenter For File Validation And Rendering

**Files:**
- Create: `web-demo/src/gpDemoPresenter.ts`
- Test: `web-demo/src/gpDemoPresenter.test.ts`

**Interfaces:**
- Consumes:
  - `detectScoreFormat(fileName: string): ScoreFormat`
  - `createScoreIdentity(input): Promise<ScoreIdentity>`
  - `loadAlphaTabBytes(api, bytes): boolean`
  - `summarizeGpScore(score)`
- Produces:
  - `type DemoStatus = "idle" | "loading" | "ready" | "error"`
  - `type DemoState`
  - `type DemoFileLike`
  - `function presentGpFile(input): Promise<DemoState>`

- [ ] **Step 1: Write presenter tests**

Create `web-demo/src/gpDemoPresenter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { presentGpFile } from "./gpDemoPresenter";

describe("presentGpFile", () => {
  it("rejects non-GP files", async () => {
    const state = await presentGpFile({
      file: fileLike("lesson.mid", new Uint8Array([1])),
      api: {},
      loader: () => ({ title: "Should not load" }),
    });

    expect(state).toEqual({
      status: "error",
      message: "请选择 Guitar Pro 文件",
    });
  });

  it("loads GP bytes into alphaTab and returns summary", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const state = await presentGpFile({
      file: fileLike("song.gp5", bytes),
      api: {
        load(scoreData: unknown) {
          expect(scoreData).toEqual(bytes);
          return true;
        },
      },
      loader: input => {
        expect(input).toEqual(bytes);
        return {
          title: "Song",
          artist: "Artist",
          tracks: [{}, {}],
          masterBars: [{}, {}, {}],
          tempo: 120,
        };
      },
    });

    expect(state.status).toBe("ready");
    expect(state.message).toBe("已加载 Song");
    expect(state.summary).toEqual({
      title: "Song",
      artist: "Artist",
      trackCount: 2,
      masterBarCount: 3,
      tempo: 120,
    });
    expect(state.identity?.format).toBe("gp");
  });

  it("reports an error when alphaTab refuses the bytes", async () => {
    const state = await presentGpFile({
      file: fileLike("broken.gp", new Uint8Array([9])),
      api: {
        load() {
          return false;
        },
      },
      loader: () => ({ title: "Broken" }),
    });

    expect(state).toEqual({
      status: "error",
      message: "alphaTab 无法加载该文件",
    });
  });
});

function fileLike(name: string, bytes: Uint8Array) {
  return {
    name,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test -- web-demo/src/gpDemoPresenter.test.ts
```

Expected: FAIL because `gpDemoPresenter.ts` does not exist.

- [ ] **Step 3: Implement presenter**

Create `web-demo/src/gpDemoPresenter.ts`:

```ts
import {
  createScoreIdentity,
  detectScoreFormat,
  loadAlphaTabBytes,
  loadGpScore,
  summarizeGpScore,
  type AlphaTabApiLike,
  type AlphaTabScoreLoader,
  type GpScoreSummary,
  type ScoreIdentity,
} from "@tab-viewer/web-core";

export type DemoStatus = "idle" | "loading" | "ready" | "error";

export type DemoState = {
  status: DemoStatus;
  message: string;
  identity?: ScoreIdentity;
  summary?: GpScoreSummary;
};

export type DemoFileLike = {
  name: string;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export async function presentGpFile(input: {
  file: DemoFileLike;
  api: AlphaTabApiLike;
  loader?: AlphaTabScoreLoader;
}): Promise<DemoState> {
  if (detectScoreFormat(input.file.name) !== "gp") {
    return {
      status: "error",
      message: "请选择 Guitar Pro 文件",
    };
  }

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const loaded = loadAlphaTabBytes(input.api, bytes);
  if (!loaded) {
    return {
      status: "error",
      message: "alphaTab 无法加载该文件",
    };
  }

  const score = loadGpScore(bytes, input.loader);
  const summary = summarizeGpScore(score);
  const identity = await createScoreIdentity({
    fileName: input.file.name,
    bytes,
    title: summary.title,
    artist: summary.artist,
    trackNames: [],
    tempoSummary: summary.tempo === undefined ? undefined : `${summary.tempo} bpm`,
  });

  return {
    status: "ready",
    message: `已加载 ${summary.title}`,
    identity,
    summary,
  };
}
```

- [ ] **Step 4: Run check**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-demo/src/gpDemoPresenter.ts web-demo/src/gpDemoPresenter.test.ts
git commit -m "feat: add gp demo presenter"
```

## Task 4: DOM App Binding

**Files:**
- Create: `web-demo/src/demoApp.ts`
- Test: `web-demo/src/demoApp.test.ts`
- Modify: `web-demo/src/main.ts`

**Interfaces:**
- Consumes:
  - `createAlphaTabApi(element, options)`
  - `presentGpFile(input)`
- Produces:
  - `function mountDemoApp(document: Document): void`
  - `function renderDemoState(targets, state): void`

- [ ] **Step 1: Write DOM binding tests**

Create `web-demo/src/demoApp.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderDemoState } from "./demoApp";

describe("renderDemoState", () => {
  it("renders ready state into status and summary regions", () => {
    document.body.innerHTML = `
      <p id="status"></p>
      <section id="summary"></section>
    `;

    renderDemoState(
      {
        status: document.querySelector("#status") as HTMLElement,
        summary: document.querySelector("#summary") as HTMLElement,
      },
      {
        status: "ready",
        message: "已加载 Song",
        summary: {
          title: "Song",
          artist: "Artist",
          trackCount: 2,
          masterBarCount: 3,
          tempo: 120,
        },
      },
    );

    expect(document.querySelector("#status")?.textContent).toBe("已加载 Song");
    expect(document.querySelector("#summary")?.textContent).toContain("Song");
    expect(document.querySelector("#summary")?.textContent).toContain("2 tracks");
    expect(document.querySelector("#summary")?.textContent).toContain("120 bpm");
  });

  it("renders error state without stale summary", () => {
    document.body.innerHTML = `
      <p id="status"></p>
      <section id="summary">old summary</section>
    `;

    renderDemoState(
      {
        status: document.querySelector("#status") as HTMLElement,
        summary: document.querySelector("#summary") as HTMLElement,
      },
      {
        status: "error",
        message: "请选择 Guitar Pro 文件",
      },
    );

    expect(document.querySelector("#status")?.textContent).toBe("请选择 Guitar Pro 文件");
    expect(document.querySelector("#summary")?.textContent).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test -- web-demo/src/demoApp.test.ts
```

Expected: FAIL because `demoApp.ts` does not exist.

- [ ] **Step 3: Implement DOM binding**

Create `web-demo/src/demoApp.ts`:

```ts
import { createAlphaTabApi } from "@tab-viewer/web-core";
import { presentGpFile, type DemoState } from "./gpDemoPresenter";

export type DemoTargets = {
  status: HTMLElement;
  summary: HTMLElement;
};

export function mountDemoApp(ownerDocument: Document): void {
  const fileInput = ownerDocument.querySelector<HTMLInputElement>("#score-file");
  const alphaTabHost = ownerDocument.querySelector<HTMLElement>("#alpha-tab");
  const status = ownerDocument.querySelector<HTMLElement>("#status");
  const summary = ownerDocument.querySelector<HTMLElement>("#summary");

  if (!fileInput || !alphaTabHost || !status || !summary) {
    throw new Error("Demo DOM is missing required elements");
  }

  const api = createAlphaTabApi(alphaTabHost, {
    display: {
      scale: 1,
    },
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) {
      renderDemoState({ status, summary }, { status: "idle", message: "等待选择文件" });
      return;
    }

    renderDemoState({ status, summary }, { status: "loading", message: "正在加载文件" });
    void presentGpFile({ file, api })
      .then(state => renderDemoState({ status, summary }, state))
      .catch(error => {
        renderDemoState({
          status,
          summary,
        }, {
          status: "error",
          message: error instanceof Error ? error.message : "加载失败",
        });
      });
  });
}

export function renderDemoState(targets: DemoTargets, state: DemoState): void {
  targets.status.textContent = state.message;

  if (state.status !== "ready" || !state.summary) {
    targets.summary.textContent = "";
    return;
  }

  const artist = state.summary.artist ? ` · ${state.summary.artist}` : "";
  const tempo = state.summary.tempo === undefined ? "" : ` · ${state.summary.tempo} bpm`;
  targets.summary.textContent = `${state.summary.title}${artist} · ${state.summary.trackCount} tracks · ${state.summary.masterBarCount} bars${tempo}`;
}
```

Modify `web-demo/src/main.ts`:

```ts
import "./styles.css";

export const DEMO_APP_NAME = "Tab Viewer Demo";

if (typeof document !== "undefined") {
  void import("./demoApp").then(({ mountDemoApp }) => {
    mountDemoApp(document);
  });
}
```

- [ ] **Step 4: Run check and build**

Run:

```bash
pnpm check
pnpm demo:build
```

Expected: PASS. Vite build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web-demo/src/demoApp.ts web-demo/src/demoApp.test.ts web-demo/src/main.ts
git commit -m "feat: bind browser demo ui"
```

## Task 5: Demo Usage Documentation

**Files:**
- Create: `docs/architecture/browser-demo-alphatab-dom-rendering.md`
- Modify: `docs/architecture/implementation-foundation.md`

**Interfaces:**
- Consumes:
  - `pnpm demo:dev`
  - `pnpm demo:build`
- Produces:
  - Clear instructions for trying the browser demo locally.

- [ ] **Step 1: Write browser demo doc**

Create `docs/architecture/browser-demo-alphatab-dom-rendering.md`:

```markdown
# Browser Demo alphaTab DOM Rendering

## 范围

浏览器 demo 是 GP 渲染的第一个可手动试用入口。它允许用户选择本地 Guitar Pro 文件，并用 alphaTab 渲染到页面 DOM 容器。

## 构建

```bash
pnpm install
pnpm check
pnpm demo:build
```

## 试用

```bash
pnpm demo:dev
```

打开 Vite 输出的本地地址，选择 `.gp3`、`.gp4`、`.gp5`、`.gpx` 或 `.gp` 文件。

## 当前能力

- 本地文件选择。
- GP 扩展名校验。
- alphaTab DOM 渲染。
- 文件加载状态。
- score summary 展示。

## 当前边界

- 不包含 SoundFont 播放配置。
- 不包含 SwiftUI / WKWebView 壳层。
- 不保存 sidecar。
- 不同步文件或元数据。
- 不支持 MIDI。
```

- [ ] **Step 2: Update implementation foundation doc**

Append to `docs/architecture/implementation-foundation.md`:

```markdown

## Browser Demo

浏览器 demo 位于 `web-demo/`。它使用 Vite 启动本地页面，通过 `@tab-viewer/web-core` 创建 alphaTab API，并把用户选择的 GP 文件渲染到 DOM 容器。

运行：

```bash
pnpm demo:dev
```

构建：

```bash
pnpm demo:build
```
```

- [ ] **Step 3: Run final checks**

Run:

```bash
PATTERN='TO''DO|TB''D|待''定|占''位|FIX''ME'
rg -n "$PATTERN" docs web-core web-demo
rg_status=$?
if [ "$rg_status" -ne 1 ]; then exit "$rg_status"; fi
pnpm check
pnpm demo:build
```

Expected: placeholder scan finds nothing. Typecheck, tests, and Vite build pass.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/browser-demo-alphatab-dom-rendering.md docs/architecture/implementation-foundation.md
git commit -m "docs: describe browser demo usage"
```

## Self-Review

Spec coverage:

- 可手动试用浏览器 demo：Task 1、Task 4。
- alphaTab DOM rendering：Task 2、Task 3、Task 4。
- GP 文件选择和扩展名校验：Task 3、Task 4。
- 构建命令和试用说明：Task 1、Task 5。
- 不做 SwiftUI / SoundFont / Sync / MIDI：Global Constraints 和 Task 5 文档明确说明。

Type consistency:

- `AlphaTabApiLike.load` 在 Task 2 增加，Task 3 presenter 消费。
- `presentGpFile` 在 Task 3 定义，Task 4 DOM binding 消费。
- `renderDemoState` 在 Task 4 定义并测试。

Execution handoff:

- 推荐用 Inline Execution，因为当前任务集中在同一 repo 和同一 demo slice，顺序依赖清晰。
