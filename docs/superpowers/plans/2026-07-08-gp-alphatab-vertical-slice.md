# GP alphaTab Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接入 `@coderline/alphatab`，实现 GP 文件从 Bridge 打开到 alphaTab loader、GP summary、浏览器 API façade 的第一条可测试竖切。

**Architecture:** Web Core 继续拥有 GP 适配逻辑，Native Shell 仍只通过 Bridge 提供文件字节。第一版不 fork alphaTab，不直接实现完整渲染 UI；先把 alphaTab SDK 包在 `gp/` 边界后面，让后续 WKWebView/Vite UI 只消费稳定 façade。

**Tech Stack:** TypeScript、Vitest、`@coderline/alphatab@1.8.4`、现有 MockNativeBridge、现有 ViewerSession。

## Global Constraints

- 使用中文写文档。
- 第一版不 fork alphaTab，优先使用公共 API、配置项、wrapper、adapter、上游 issue / PR。
- 第一版支持 Guitar Pro：`.gp3`、`.gp4`、`.gp5`、`.gpx`、`.gp`。
- Web Core 不能直接假设平台能力，必须通过 Bridge capability discovery。
- Native Shell 不直接理解谱面排版细节。
- 第一版不同步原始谱文件。
- 本计划不实现真实 SwiftUI / WKWebView 壳层。
- 本计划不实现完整播放音频后端。

---

## Scope Check

本计划只做 GP + alphaTab 的第一条竖切：

- 确认 `@coderline/alphatab@1.8.4` 依赖。
- 封装 alphaTab `ScoreLoader.loadScoreFromBytes`。
- 从 alphaTab score 提取稳定 summary。
- 给浏览器渲染入口提供 `AlphaTabApi` façade。
- 串起 `MockNativeBridge -> open file -> create viewer session -> load GP summary`。

后续另写计划处理：

- 真实浏览器页面和样式。
- alphaTab 播放器 SoundFont 配置。
- 当前小节/音符高亮事件映射。
- SwiftUI / WKWebView 壳层。

## File Structure

- Modify: `web-core/package.json`  
  添加 `@coderline/alphatab` 依赖。
- Create: `web-core/src/gp/alphaTabAdapter.ts`  
  封装 alphaTab score loader 与 summary 提取。
- Create: `web-core/src/gp/alphaTabBrowser.ts`  
  封装 `AlphaTabApi` 创建和播放位置事件订阅。
- Create: `web-core/src/gp/gpOpenFlow.ts`  
  串起 Bridge 打开文件和 GP summary。
- Modify: `web-core/src/index.ts`  
  导出 GP slice API。
- Test: `web-core/src/gp/*.test.ts`  
  用 fake loader/fake API 做单元测试，避免依赖真实 GP fixture。
- Create: `docs/architecture/gp-alphatab-vertical-slice.md`  
  记录本次 slice 的边界和后续接 UI 的入口。

## Task 1: alphaTab Dependency Boundary

**Files:**
- Modify: `web-core/package.json`
- Modify: `package-lock.json`
- Test: `web-core/src/gp/alphaTabDependency.test.ts`

**Interfaces:**
- Produces:
  - `@coderline/alphatab@1.8.4` 可被 TypeScript 导入。

- [ ] **Step 1: Write dependency smoke test**

Create `web-core/src/gp/alphaTabDependency.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as alphaTab from "@coderline/alphatab";

describe("alphaTab dependency", () => {
  it("exposes the public importer and browser api used by the GP adapter", () => {
    expect(alphaTab.importer.ScoreLoader.loadScoreFromBytes).toBeTypeOf("function");
    expect(alphaTab.AlphaTabApi).toBeTypeOf("function");
    expect(alphaTab.Settings).toBeTypeOf("function");
  });
});
```

- [ ] **Step 2: Run test**

Run:

```bash
npm test -- web-core/src/gp/alphaTabDependency.test.ts
```

Expected: PASS when `@coderline/alphatab@1.8.4` is installed.

- [ ] **Step 3: Run full check**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web-core/package.json package-lock.json web-core/src/gp/alphaTabDependency.test.ts
git commit -m "feat: add alphatab dependency boundary"
```

## Task 2: GP Score Loader And Summary

**Files:**
- Create: `web-core/src/gp/alphaTabAdapter.ts`
- Modify: `web-core/src/index.ts`
- Test: `web-core/src/gp/alphaTabAdapter.test.ts`

**Interfaces:**
- Produces:
  - `type AlphaTabScoreLike`
  - `type GpScoreSummary`
  - `type AlphaTabScoreLoader`
  - `function loadGpScore(bytes: Uint8Array, loader?: AlphaTabScoreLoader): AlphaTabScoreLike`
  - `function summarizeGpScore(score: AlphaTabScoreLike): GpScoreSummary`

- [ ] **Step 1: Write tests**

Create `web-core/src/gp/alphaTabAdapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadGpScore, summarizeGpScore } from "./alphaTabAdapter";

describe("loadGpScore", () => {
  it("delegates bytes to an injectable alphaTab loader", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const score = {
      title: "Song",
      artist: "Artist",
      tracks: [{ name: "Guitar" }, { name: "Bass" }],
      masterBars: [{}, {}],
      tempo: 128,
    };

    const loaded = loadGpScore(bytes, input => {
      expect(input).toEqual(bytes);
      return score;
    });

    expect(loaded).toBe(score);
  });
});

describe("summarizeGpScore", () => {
  it("extracts a stable summary without exposing alphaTab internals", () => {
    expect(
      summarizeGpScore({
        title: "Song",
        artist: "Artist",
        tracks: [{ name: "Guitar" }, { name: "Bass" }],
        masterBars: [{}, {}, {}],
        tempo: 96,
      }),
    ).toEqual({
      title: "Song",
      artist: "Artist",
      trackCount: 2,
      masterBarCount: 3,
      tempo: 96,
    });
  });

  it("uses safe defaults for sparse alphaTab scores", () => {
    expect(summarizeGpScore({})).toEqual({
      title: "Untitled",
      trackCount: 0,
      masterBarCount: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- web-core/src/gp/alphaTabAdapter.test.ts
```

Expected: FAIL with module not found for `./alphaTabAdapter`.

- [ ] **Step 3: Implement adapter**

Create `web-core/src/gp/alphaTabAdapter.ts`:

```ts
import * as alphaTab from "@coderline/alphatab";

export type AlphaTabScoreLike = {
  title?: string;
  artist?: string;
  tracks?: unknown[];
  masterBars?: unknown[];
  tempo?: number;
};

export type GpScoreSummary = {
  title: string;
  artist?: string;
  trackCount: number;
  masterBarCount: number;
  tempo?: number;
};

export type AlphaTabScoreLoader = (bytes: Uint8Array) => AlphaTabScoreLike;

export function loadGpScore(bytes: Uint8Array, loader: AlphaTabScoreLoader = defaultAlphaTabLoader): AlphaTabScoreLike {
  return loader(bytes);
}

export function summarizeGpScore(score: AlphaTabScoreLike): GpScoreSummary {
  const summary: GpScoreSummary = {
    title: score.title && score.title.length > 0 ? score.title : "Untitled",
    trackCount: score.tracks?.length ?? 0,
    masterBarCount: score.masterBars?.length ?? 0,
  };

  if (score.artist && score.artist.length > 0) {
    summary.artist = score.artist;
  }
  if (score.tempo !== undefined) {
    summary.tempo = score.tempo;
  }

  return summary;
}

function defaultAlphaTabLoader(bytes: Uint8Array): AlphaTabScoreLike {
  const settings = new alphaTab.Settings();
  return alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes, settings) as AlphaTabScoreLike;
}
```

Modify `web-core/src/index.ts`:

```ts
export const WEB_CORE_VERSION = "0.1.0";

export * from "./score/types";
export * from "./score/format";
export * from "./score/identity";
export * from "./score/session";
export * from "./bridge/types";
export * from "./bridge/mockNativeBridge";
export * from "./bridge/openFileFlow";
export * from "./storage/sidecar";
export * from "./storage/sqliteSchema";
export * from "./gp/alphaTabAdapter";
```

- [ ] **Step 4: Run check**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-core/src/index.ts web-core/src/gp/alphaTabAdapter.ts web-core/src/gp/alphaTabAdapter.test.ts
git commit -m "feat: add gp alphatab adapter"
```

## Task 3: Browser alphaTab API Facade

**Files:**
- Create: `web-core/src/gp/alphaTabBrowser.ts`
- Modify: `web-core/src/index.ts`
- Test: `web-core/src/gp/alphaTabBrowser.test.ts`

**Interfaces:**
- Produces:
  - `type AlphaTabApiLike`
  - `type AlphaTabApiFactory`
  - `type AlphaTabPositionEvent`
  - `function createAlphaTabApi(element: HTMLElement, options?: unknown, factory?: AlphaTabApiFactory): AlphaTabApiLike`
  - `function attachAlphaTabPositionEvents(api: AlphaTabApiLike, emit: (event: AlphaTabPositionEvent) => void): () => void`

- [ ] **Step 1: Write tests**

Create `web-core/src/gp/alphaTabBrowser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { attachAlphaTabPositionEvents, createAlphaTabApi } from "./alphaTabBrowser";

describe("createAlphaTabApi", () => {
  it("uses an injectable factory so tests do not require a browser DOM", () => {
    const element = {} as HTMLElement;
    const api = { play: () => true };

    const created = createAlphaTabApi(element, { display: { scale: 1.2 } }, (actualElement, options) => {
      expect(actualElement).toBe(element);
      expect(options).toEqual({ display: { scale: 1.2 } });
      return api;
    });

    expect(created).toBe(api);
  });
});

describe("attachAlphaTabPositionEvents", () => {
  it("maps alphaTab playerPositionChanged events to stable app events", () => {
    let handler: ((arg: unknown) => void) | undefined;
    let detached = false;
    const api = {
      playerPositionChanged: {
        on(nextHandler: (arg: unknown) => void) {
          handler = nextHandler;
          return () => {
            detached = true;
          };
        },
      },
    };
    const events: unknown[] = [];

    const detach = attachAlphaTabPositionEvents(api, event => events.push(event));
    handler?.({ currentTime: 1250, endTime: 5000, tickPosition: 240 });
    detach();

    expect(events).toEqual([
      {
        positionMs: 1250,
        endMs: 5000,
        tickPosition: 240,
      },
    ]);
    expect(detached).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- web-core/src/gp/alphaTabBrowser.test.ts
```

Expected: FAIL with module not found for `./alphaTabBrowser`.

- [ ] **Step 3: Implement browser façade**

Create `web-core/src/gp/alphaTabBrowser.ts`:

```ts
import * as alphaTab from "@coderline/alphatab";

export type AlphaTabPositionEvent = {
  positionMs: number;
  endMs?: number;
  tickPosition?: number;
};

export type AlphaTabApiLike = {
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

export function attachAlphaTabPositionEvents(
  api: AlphaTabApiLike,
  emit: (event: AlphaTabPositionEvent) => void,
): () => void {
  const detach = api.playerPositionChanged?.on(arg => {
    const event = arg as { currentTime?: number; endTime?: number; tickPosition?: number };
    emit({
      positionMs: event.currentTime ?? 0,
      endMs: event.endTime,
      tickPosition: event.tickPosition,
    });
  });

  return detach ?? (() => {});
}

function defaultAlphaTabApiFactory(element: HTMLElement, options: unknown): AlphaTabApiLike {
  return new alphaTab.AlphaTabApi(element, options as alphaTab.SettingsJson | alphaTab.Settings);
}
```

Modify `web-core/src/index.ts`:

```ts
export const WEB_CORE_VERSION = "0.1.0";

export * from "./score/types";
export * from "./score/format";
export * from "./score/identity";
export * from "./score/session";
export * from "./bridge/types";
export * from "./bridge/mockNativeBridge";
export * from "./bridge/openFileFlow";
export * from "./storage/sidecar";
export * from "./storage/sqliteSchema";
export * from "./gp/alphaTabAdapter";
export * from "./gp/alphaTabBrowser";
```

- [ ] **Step 4: Run check**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-core/src/index.ts web-core/src/gp/alphaTabBrowser.ts web-core/src/gp/alphaTabBrowser.test.ts
git commit -m "feat: add alphatab browser facade"
```

## Task 4: GP Open Flow Through Bridge

**Files:**
- Create: `web-core/src/gp/gpOpenFlow.ts`
- Modify: `web-core/src/index.ts`
- Test: `web-core/src/gp/gpOpenFlow.test.ts`

**Interfaces:**
- Consumes:
  - `MockNativeBridge`
  - `openFileThroughBridge`
  - `loadGpScore`
  - `summarizeGpScore`
- Produces:
  - `type GpOpenResult`
  - `function openGpThroughBridge(input: { bridge: MockNativeBridge; fileRef: string; mode: "external-reference" | "local-library-copy"; loader?: AlphaTabScoreLoader }): Promise<GpOpenResult>`

- [ ] **Step 1: Write tests**

Create `web-core/src/gp/gpOpenFlow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MockNativeBridge } from "../bridge/mockNativeBridge";
import { openGpThroughBridge } from "./gpOpenFlow";

describe("openGpThroughBridge", () => {
  it("opens GP bytes through bridge and summarizes the alphaTab score", async () => {
    const bridge = new MockNativeBridge();
    bridge.registerFileBytes("gp-file", {
      fileName: "song.gp5",
      bytes: new Uint8Array([1, 2, 3]),
    });

    const result = await openGpThroughBridge({
      bridge,
      fileRef: "gp-file",
      mode: "external-reference",
      loader: bytes => {
        expect([...bytes]).toEqual([1, 2, 3]);
        return {
          title: "Song",
          artist: "Artist",
          tracks: [{}, {}],
          masterBars: [{}, {}, {}],
          tempo: 110,
        };
      },
    });

    expect(result.session.identity.format).toBe("gp");
    expect(result.summary).toEqual({
      title: "Song",
      artist: "Artist",
      trackCount: 2,
      masterBarCount: 3,
      tempo: 110,
    });
  });

  it("rejects MIDI files before calling the GP loader", async () => {
    const bridge = new MockNativeBridge();
    bridge.registerFileBytes("midi-file", {
      fileName: "song.mid",
      bytes: new Uint8Array([1, 2, 3]),
    });

    await expect(
      openGpThroughBridge({
        bridge,
        fileRef: "midi-file",
        mode: "external-reference",
        loader: () => {
          throw new Error("loader should not run");
        },
      }),
    ).rejects.toThrow("Expected GP score but received format: midi");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- web-core/src/gp/gpOpenFlow.test.ts
```

Expected: FAIL with module not found for `./gpOpenFlow`.

- [ ] **Step 3: Implement GP open flow**

Create `web-core/src/gp/gpOpenFlow.ts`:

```ts
import { openFileThroughBridge } from "../bridge/openFileFlow";
import type { MockNativeBridge } from "../bridge/mockNativeBridge";
import type { ViewerSession } from "../score/session";
import { loadGpScore, summarizeGpScore, type AlphaTabScoreLoader, type GpScoreSummary } from "./alphaTabAdapter";

export type GpOpenResult = {
  session: ViewerSession;
  summary: GpScoreSummary;
};

export async function openGpThroughBridge(input: {
  bridge: MockNativeBridge;
  fileRef: string;
  mode: "external-reference" | "local-library-copy";
  loader?: AlphaTabScoreLoader;
}): Promise<GpOpenResult> {
  const session = await openFileThroughBridge({
    bridge: input.bridge,
    fileRef: input.fileRef,
    mode: input.mode,
  });

  if (session.identity.format !== "gp") {
    throw new Error(`Expected GP score but received format: ${session.identity.format}`);
  }

  const file = await input.bridge.rpc<{ bytes: Uint8Array }>("file.readBytes", {
    fileToken: input.fileRef,
  });
  const score = loadGpScore(file.bytes, input.loader);

  return {
    session,
    summary: summarizeGpScore(score),
  };
}
```

Modify `web-core/src/index.ts`:

```ts
export const WEB_CORE_VERSION = "0.1.0";

export * from "./score/types";
export * from "./score/format";
export * from "./score/identity";
export * from "./score/session";
export * from "./bridge/types";
export * from "./bridge/mockNativeBridge";
export * from "./bridge/openFileFlow";
export * from "./storage/sidecar";
export * from "./storage/sqliteSchema";
export * from "./gp/alphaTabAdapter";
export * from "./gp/alphaTabBrowser";
export * from "./gp/gpOpenFlow";
```

- [ ] **Step 4: Run check**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-core/src/index.ts web-core/src/gp/gpOpenFlow.ts web-core/src/gp/gpOpenFlow.test.ts
git commit -m "feat: add gp bridge open flow"
```

## Task 5: Document GP Vertical Slice

**Files:**
- Create: `docs/architecture/gp-alphatab-vertical-slice.md`
- Modify: `docs/architecture/implementation-foundation.md`

**Interfaces:**
- Consumes:
  - GP API exported from `web-core/src/gp/`.
- Produces:
  - Documentation for the next UI implementation plan.

- [ ] **Step 1: Write GP slice doc**

Create `docs/architecture/gp-alphatab-vertical-slice.md`:

```markdown
# GP alphaTab 竖切说明

## 范围

本竖切接入 `@coderline/alphatab@1.8.4`，验证 Web Core 可以从 Bridge 获取 GP 文件字节，交给 alphaTab loader，并提取稳定 summary。

## 已实现入口

- `web-core/src/gp/alphaTabAdapter.ts`：封装 `ScoreLoader.loadScoreFromBytes` 和 GP summary。
- `web-core/src/gp/alphaTabBrowser.ts`：封装 `AlphaTabApi` 创建和播放位置事件订阅。
- `web-core/src/gp/gpOpenFlow.ts`：串起 Bridge 打开文件与 GP summary。

## 当前边界

- 没有 fork alphaTab。
- 没有引入真实浏览器页面。
- 没有配置 SoundFont。
- 没有实现 SwiftUI / WKWebView 壳层。
- 没有提交真实 GP fixture。

## 下一步

下一步应实现一个浏览器 demo 页面，把 `createAlphaTabApi` 接到实际 DOM 容器，并通过文件选择器或 mock bridge 加载 GP 文件。
```

- [ ] **Step 2: Update implementation foundation doc**

Append to `docs/architecture/implementation-foundation.md`:

```markdown

## GP alphaTab 竖切

GP 第一条竖切已经接入 `@coderline/alphatab@1.8.4`：

- `web-core/src/gp/alphaTabAdapter.ts`
- `web-core/src/gp/alphaTabBrowser.ts`
- `web-core/src/gp/gpOpenFlow.ts`

当前实现验证 Web Core 可以通过 Bridge 获取 GP 文件字节、交给 alphaTab loader，并提取稳定 summary。真实浏览器页面、SoundFont、播放 UI 和 Apple 壳层仍在后续计划中。
```

- [ ] **Step 3: Run checks**

Run:

```bash
PATTERN='TO''DO|TB''D|待''定|占''位|FIX''ME'
rg -n "$PATTERN" docs web-core
rg_status=$?
if [ "$rg_status" -ne 1 ]; then exit "$rg_status"; fi
npm run check
```

Expected: `rg` exits with code 1 because no unfinished markers are found. `npm run check` exits with code 0.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/gp-alphatab-vertical-slice.md docs/architecture/implementation-foundation.md
git commit -m "docs: describe gp alphatab vertical slice"
```

## Self-Review

Spec coverage:

- alphaTab dependency：Task 1。
- GP loader wrapper：Task 2。
- Browser AlphaTabApi façade：Task 3。
- Bridge 到 GP summary 竖切：Task 4。
- 文档：Task 5。

Type consistency:

- `AlphaTabScoreLoader` 在 adapter 定义，并被 GP open flow 消费。
- `GpScoreSummary` 在 adapter 定义，并由 GP open flow 返回。
- `MockNativeBridge` 继续作为测试 bridge，不扩展到真实平台逻辑。
