# Electron Desktop GP Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保留 Browser Demo，并交付可在 macOS arm64 与 Windows x64 验收的 Electron GP 查看与播放练习桌面应用。

**Architecture:** 先把领域核心、共享 Viewer UI 和两个应用宿主整理为 pnpm workspace，再以 Zod schema 作为 Bridge 与持久 payload 的唯一真相源。Electron Main 独占文件、存储、协议和生命周期，sandboxed Preload 暴露固定领域 Bridge，Renderer 只运行共享 Viewer UI。

**Tech Stack:** TypeScript 5.5、pnpm workspace、Rspack 2.1、Vitest 2、alphaTab 1.8.4、Electron 43.1.0、Electron Forge 7.11.2、Zod 4.4.3、Playwright 1.61.1。

## Global Constraints

- 开始 Electron 集成前必须先完成 GP 准入素材生成与自动化验证；派生 fixture 不代表完整 GP 兼容矩阵通过。
- 工作区固定为 `packages/web-core`、`packages/web-viewer`、`apps/web-demo`、`apps/desktop-shell`，测试素材固定放在根 `test-fixtures/`。
- 继续使用 pnpm workspace、根 `pnpm-lock.yaml`、TypeScript project references 和 Rspack；不引入 Turborepo、Nx 或第二套 Renderer bundler。
- 首版只开放 GP3、GP4、GP5、GPX 与 `.gp`；不开放 MIDI、SQLite、同步、文件关联、拖放、多窗口、自动更新或遥测。
- Electron Renderer 必须保持 `nodeIntegration: false`、`contextIsolation: true`、`sandbox: true`。
- Renderer 只能加载 `tab-viewer://app/` 内置资源；不使用 `file://`，不加载远程代码，不启用 `bypassCSP`。
- 文件读取必须使用一次性 opaque token，单文件上限固定为 64 MiB，Renderer 永远不能获得真实路径。
- Practice Sidecar 使用 500 ms 防抖；Local Playback Resume 使用 5 秒节流，并在暂停、停止、换谱和关闭时 flush。
- 首版只生成 macOS arm64 和 Windows x64 Internal Acceptance Build；正式签名、公证和公开分发不在本计划内。
- 每个任务必须先写失败测试、确认失败、写最小实现、确认通过并单独提交。

---

## File Map

### 可复用包

- `packages/web-core/src/bridge/schemas.ts`：Bridge envelope、请求、响应、事件、capabilities 与错误的 Zod schema。
- `packages/web-core/src/bridge/types.ts`：只重新导出由 schema 推导的类型。
- `packages/web-core/src/storage/schemas.ts`：Sidecar 与 Local Playback Resume 的 Zod schema。
- `packages/web-core/src/storage/sidecar.ts`：编码、迁移与 schema 解析。
- `packages/web-viewer/src/viewerShell.ts`：共享 Viewer DOM 结构。
- `packages/web-viewer/src/viewerApp.ts`：宿主无关的文件打开、Session 和生命周期编排。
- `packages/web-viewer/src/host.ts`：Browser/Electron 都必须实现的最小宿主端口。
- `packages/web-viewer/src/playbackControls.ts`、`playbackPresenter.ts`、`styles.css`：从当前 Demo 提取的共享 UI。

### Browser 应用

- `apps/web-demo/src/browserHost.ts`：浏览器文件选择与 mock persistence。
- `apps/web-demo/src/main.ts`：挂载共享 Viewer。
- `apps/web-demo/rspack.config.mjs`：Browser 开发服务器与离线资源构建。

### Electron 应用

- `apps/desktop-shell/src/main/main.ts`：单实例、窗口、菜单、协议、IPC 和系统生命周期组合入口。
- `apps/desktop-shell/src/main/fileTokens.ts`：一次性文件 token。
- `apps/desktop-shell/src/main/storage.ts`：原子 JSON 持久化与损坏隔离。
- `apps/desktop-shell/src/main/protocol.ts`：`tab-viewer://app/` 只读协议。
- `apps/desktop-shell/src/main/diagnostics.ts`：本地隐私化轮转日志。
- `apps/desktop-shell/src/preload.ts`：固定 `contextBridge` 暴露面。
- `apps/desktop-shell/src/renderer.ts`：生产 Bridge host 与共享 Viewer 挂载。
- `apps/desktop-shell/rspack.config.mjs`：Main、Preload、Renderer 三个构建目标。
- `apps/desktop-shell/forge.config.mjs`：macOS arm64 与 Windows x64 package/maker。
- `apps/desktop-shell/e2e/desktop.spec.ts`：关键跨进程 smoke。

### Fixture 与验证

- `test-fixtures/gp/Treasure.gp5`：已授权原始 GP5。
- `test-fixtures/gp/generated/desktop-acceptance.gp`：确定性派生现代 GP 中文样本。
- `scripts/generate-gp-fixtures.mjs`：派生 fixture 生成器。
- `scripts/verify-gp-fixtures.mjs`：准入素材结构验证。

---

### Task 1: 迁移 monorepo 目录而不改变行为

**Files:**
- Move: `web-core/` → `packages/web-core/`
- Move: `web-demo/` → `apps/web-demo/`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `.gitignore`
- Modify: `apps/web-demo/rspack.config.mjs`

**Interfaces:**
- Consumes: 现有 pnpm 包名 `@tab-viewer/web-core`、`@tab-viewer/web-demo`。
- Produces: 稳定的 `packages/*`、`apps/*` workspace 路径；包名和运行命令保持不变。

- [ ] **Step 1: 记录迁移前基线**

Run: `pnpm check && pnpm demo:build`

Expected: TypeScript、全部 Vitest 测试和 Browser Demo 生产构建通过。

- [ ] **Step 2: 移动两个现有 workspace**

```bash
mkdir -p packages apps
git mv web-core packages/web-core
git mv web-demo apps/web-demo
```

- [ ] **Step 3: 更新根 workspace 与 project references**

`package.json` 中替换为：

```json
"workspaces": ["packages/*", "apps/*"]
```

`tsconfig.json` 中替换为：

```json
{
  "files": [],
  "references": [
    { "path": "./packages/web-core" },
    { "path": "./apps/web-demo" }
  ]
}
```

`apps/web-demo/rspack.config.mjs` 中 alphaTab 依赖路径从 `../node_modules` 改为 `../../node_modules`。`.gitignore` 使用：

```gitignore
node_modules/
*.tsbuildinfo
.DS_Store
packages/*/dist/
apps/*/dist/
apps/*/out/
```

- [ ] **Step 4: 重装 workspace 链接并验证迁移**

Run: `pnpm install && pnpm check && pnpm demo:build`

Expected: 命令全部通过；`git status --short` 不包含生成的 `dist/`、`out/` 或 `.DS_Store`。

- [ ] **Step 5: 提交目录迁移**

```bash
git add package.json pnpm-lock.yaml tsconfig.json .gitignore packages apps
git commit -m "chore: organize workspaces under packages and apps"
```

---

### Task 2: 提取共享 web-viewer，同时保持 Browser Demo 可运行

**Files:**
- Create: `packages/web-viewer/package.json`
- Create: `packages/web-viewer/tsconfig.json`
- Create: `packages/web-viewer/src/index.ts`
- Create: `packages/web-viewer/src/host.ts`
- Create: `packages/web-viewer/src/viewerShell.ts`
- Create: `packages/web-viewer/src/viewerApp.ts`
- Move: `apps/web-demo/src/playbackControls.ts` → `packages/web-viewer/src/playbackControls.ts`
- Move: `apps/web-demo/src/playbackPresenter.ts` → `packages/web-viewer/src/playbackPresenter.ts`
- Move: `apps/web-demo/src/styles.css` → `packages/web-viewer/src/styles.css`
- Create: `apps/web-demo/src/browserHost.ts`
- Modify: `apps/web-demo/src/main.ts`
- Modify: `apps/web-demo/index.html`
- Modify: `apps/web-demo/package.json`
- Modify: `tsconfig.json`
- Test: `packages/web-viewer/src/viewerApp.test.ts`
- Test: `apps/web-demo/src/browserHost.test.ts`

**Interfaces:**
- Consumes: `PlaybackController`, `BridgePlaybackPersistence`, alphaTab adapters from `@tab-viewer/web-core`。
- Produces: `ViewerHost`, `ViewerFile`, `ViewerAppHandle`, `mountViewerApp()` and `renderViewerShell()`。

- [ ] **Step 1: 写共享宿主与生命周期失败测试**

```ts
// packages/web-viewer/src/viewerApp.test.ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { mountViewerApp } from "./viewerApp";
import { renderViewerShell } from "./viewerShell";

describe("mountViewerApp", () => {
  it("opens through the injected host and destroys the active session", async () => {
    renderViewerShell(document);
    const openScore = vi.fn(async () => ({
      fileName: "song.gp5",
      bytes: new Uint8Array([1]),
    }));
    const destroySession = vi.fn(async () => undefined);
    const app = mountViewerApp(document, {
      host: { openScore, subscribe: () => () => undefined },
      openSession: async () => ({ destroy: destroySession, pauseAndFlush: vi.fn() }),
    });

    document.querySelector<HTMLButtonElement>("#open-score")?.click();
    await vi.waitFor(() => expect(openScore).toHaveBeenCalledOnce());
    await app.destroy();
    expect(destroySession).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: 运行测试确认缺少共享包**

Run: `npx vitest run packages/web-viewer/src/viewerApp.test.ts`

Expected: FAIL，提示 `viewerApp` 或 `viewerShell` 不存在。

- [ ] **Step 3: 定义最小共享接口与 DOM**

```ts
// packages/web-viewer/src/host.ts
export type ViewerFile = { fileName: string; bytes: Uint8Array };
export type ViewerHostEvent =
  | { type: "open-score" }
  | { type: "toggle-playback" }
  | { type: "suspend" }
  | { type: "prepare-close" };

export interface ViewerHost {
  openScore(): Promise<ViewerFile | undefined>;
  subscribe(listener: (event: ViewerHostEvent) => void): () => void;
}

export type ViewerSessionHandle = {
  pauseAndFlush(): Promise<void>;
  destroy(): Promise<void>;
};

export type ViewerAppHandle = ViewerSessionHandle & {
  openScore(): Promise<void>;
};
```

```ts
// packages/web-viewer/src/viewerShell.ts
export function renderViewerShell(ownerDocument: Document): void {
  ownerDocument.body.innerHTML = `
    <main class="app-shell">
      <header class="file-bar"><button id="open-score" type="button">打开 GP 文件</button><p id="status" role="status">等待选择文件</p></header>
      <section id="summary" class="summary" aria-live="polite"></section>
      <section class="transport" aria-label="播放控制">
        <button id="play-toggle" type="button" disabled>播放</button><button id="play-stop" type="button" disabled>停止</button>
        <span><span id="play-current-time">0:00</span> / <span id="play-duration">0:00</span></span>
        <input id="play-progress" aria-label="播放进度" type="range" min="0" max="1000" value="0">
        <input id="play-speed" aria-label="速度" type="range" min="25" max="200" step="5" value="100"><output id="play-speed-value">100%</output>
        <button id="soundfont-retry" type="button" hidden>重试音频</button>
      </section>
      <section class="workspace"><section id="alpha-tab" class="score-viewer"></section><aside class="inspector">
        <input id="loop-enabled" type="checkbox"><button id="loop-set-a">设为 A</button><button id="loop-set-b">设为 B</button><button id="loop-save">保存区间</button>
        <select id="loop-snap-mode"><option value="off">关闭</option><option value="beat" selected>按拍</option><option value="measure">按小节</option></select>
        <input id="loop-start" type="range" min="0" max="1000"><input id="loop-end" type="range" min="0" max="1000">
        <div id="loop-list"></div><div id="track-list"></div><p id="playback-persistence-status"></p>
      </aside></section>
    </main>`;
}
```

- [ ] **Step 4: 实现共享 Viewer 编排并迁移现有 presenter/controls**

```ts
// packages/web-viewer/src/viewerApp.ts
import type { ViewerAppHandle, ViewerHost, ViewerHostEvent, ViewerSessionHandle } from "./host";

export type ViewerAppDependencies = {
  host: ViewerHost;
  openSession(file: { fileName: string; bytes: Uint8Array }): Promise<ViewerSessionHandle>;
};

export function mountViewerApp(
  ownerDocument: Document,
  dependencies: ViewerAppDependencies,
): ViewerAppHandle {
  const openButton = ownerDocument.querySelector<HTMLButtonElement>("#open-score");
  if (!openButton) throw new Error("Viewer DOM is missing #open-score");
  let active: ViewerSessionHandle | undefined;
  let chain = Promise.resolve();
  const openScore = async () => {
    const file = await dependencies.host.openScore();
    if (!file) return;
    await active?.destroy();
    active = await dependencies.openSession(file);
  };
  const enqueueOpen = () => { chain = chain.then(openScore); };
  const onHostEvent = (event: ViewerHostEvent) => {
    if (event.type === "open-score") enqueueOpen();
    if (event.type === "suspend") void active?.pauseAndFlush();
    if (event.type === "prepare-close") void destroy();
  };
  openButton.addEventListener("click", enqueueOpen);
  const unsubscribe = dependencies.host.subscribe(onHostEvent);
  const destroy = async () => {
    openButton.removeEventListener("click", enqueueOpen);
    unsubscribe();
    await chain;
    await active?.destroy();
    active = undefined;
  };
  return {
    openScore,
    pauseAndFlush: async () => { await active?.pauseAndFlush(); },
    destroy,
  };
}
```

把现有 `demoApp.ts` 中 alphaTab Session 创建逻辑迁入 `web-viewer` 的默认 `openSession` 工厂；把 `playbackControls.ts`、`playbackPresenter.ts` 和样式原样迁移并修正相对导入。`packages/web-viewer/src/index.ts` 只导出 `host`、`viewerShell`、`viewerApp` 与现有 UI API。

- [ ] **Step 5: 实现 BrowserHost 并接回 Demo**

```ts
// apps/web-demo/src/browserHost.ts
import { MockNativeBridge } from "@tab-viewer/web-core";
import type { ViewerHost, ViewerFile } from "@tab-viewer/web-viewer";

export function createBrowserHost(ownerDocument: Document): ViewerHost & { bridge: MockNativeBridge } {
  const bridge = new MockNativeBridge();
  return {
    bridge,
    subscribe: () => () => undefined,
    async openScore(): Promise<ViewerFile | undefined> {
      const input = ownerDocument.createElement("input");
      input.type = "file";
      input.accept = ".gp3,.gp4,.gp5,.gpx,.gp";
      const file = await new Promise<File | undefined>(resolve => {
        input.addEventListener("change", () => resolve(input.files?.[0]), { once: true });
        input.click();
      });
      return file ? { fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : undefined;
    },
  };
}
```

`apps/web-demo/src/main.ts` 先导入共享样式，调用 `renderViewerShell(document)`，再以 BrowserHost 和共享默认 Session 工厂调用 `mountViewerApp`。`apps/web-demo/index.html` 只保留空 `<body>` 与 CSP/viewport 元数据。

- [ ] **Step 6: 验证共享 UI 与 Browser 回归**

Run: `pnpm check && pnpm demo:build`

Expected: 所有原测试迁移后通过；Demo 构建仍包含 alphaTab、字体、SoundFont 和许可证。

- [ ] **Step 7: 提交共享 Viewer**

```bash
git add packages/web-viewer apps/web-demo package.json pnpm-lock.yaml tsconfig.json
git commit -m "refactor: extract shared viewer app"
```

---

### Task 3: 生成并验证 GP 准入 fixture

**Files:**
- Move: `apps/web-demo/data/Treasure.gp5` → `test-fixtures/gp/Treasure.gp5`
- Move: `apps/web-demo/data/README.md` → `test-fixtures/gp/README.md`
- Create: `scripts/generate-gp-fixtures.mjs`
- Create: `scripts/verify-gp-fixtures.mjs`
- Modify: `package.json`
- Modify: `docs/architecture/gp-playback-practice-acceptance.md`

**Interfaces:**
- Consumes: `@coderline/alphatab` `importer.ScoreLoader` 与 `exporter.Gp7Exporter`。
- Produces: `test-fixtures/gp/generated/desktop-acceptance.gp` 和可重复运行的 `pnpm fixtures:gp`。

- [ ] **Step 1: 写失败的 fixture 验证器**

```js
// scripts/verify-gp-fixtures.mjs
import { readFile } from "node:fs/promises";
import { importer, Settings } from "@coderline/alphatab";

for (const file of [
  "test-fixtures/gp/Treasure.gp5",
  "test-fixtures/gp/generated/desktop-acceptance.gp",
]) {
  const bytes = new Uint8Array(await readFile(file));
  const score = importer.ScoreLoader.loadScoreFromBytes(bytes, new Settings());
  if (!score.tracks.length || !score.masterBars.length) throw new Error(`Invalid fixture: ${file}`);
  if (file.endsWith("desktop-acceptance.gp")
    && (score.title !== "桌面验收谱" || score.tracks[0]?.name !== "主音吉他")) {
    throw new Error("Generated fixture lost Chinese metadata");
  }
}
```

- [ ] **Step 2: 运行验证器确认派生文件缺失**

Run: `node scripts/verify-gp-fixtures.mjs`

Expected: FAIL，指出 `desktop-acceptance.gp` 不存在。

- [ ] **Step 3: 实现确定性生成器**

```js
// scripts/generate-gp-fixtures.mjs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { exporter, importer, Settings } from "@coderline/alphatab";

const settings = new Settings();
const source = new Uint8Array(await readFile("test-fixtures/gp/Treasure.gp5"));
const score = importer.ScoreLoader.loadScoreFromBytes(source, settings);
score.title = "桌面验收谱";
if (!score.tracks[0]) throw new Error("Treasure.gp5 must contain at least one track");
score.tracks[0].name = "主音吉他";
const bytes = new exporter.Gp7Exporter().export(score, settings);
await mkdir("test-fixtures/gp/generated", { recursive: true });
await writeFile("test-fixtures/gp/generated/desktop-acceptance.gp", bytes);
```

根脚本增加：

```json
"fixtures:gp": "node scripts/generate-gp-fixtures.mjs && node scripts/verify-gp-fixtures.mjs"
```

- [ ] **Step 4: 生成、验证并记录准入结果**

Run: `pnpm fixtures:gp && pnpm check && pnpm demo:build`

Expected: 生成器和验证器通过；Browser Demo 对 GP5 与派生 GP 都能解析。更新验收文档对应行，但只有实际人工执行过的单元格才能写“通过”。

- [ ] **Step 5: 提交 fixture 基线**

```bash
git add test-fixtures scripts package.json docs/architecture/gp-playback-practice-acceptance.md
git commit -m "test: add deterministic GP acceptance fixtures"
```

---

### Task 4: 用 Zod schema 统一 Bridge 与持久 payload

**Files:**
- Create: `packages/web-core/src/score/schemas.ts`
- Create: `packages/web-core/src/playback/schemas.ts`
- Create: `packages/web-core/src/storage/schemas.ts`
- Create: `packages/web-core/src/bridge/schemas.ts`
- Modify: `packages/web-core/src/score/types.ts`
- Modify: `packages/web-core/src/playback/types.ts`
- Modify: `packages/web-core/src/storage/sidecar.ts`
- Modify: `packages/web-core/src/bridge/types.ts`
- Modify: `packages/web-core/src/bridge/mockNativeBridge.ts`
- Modify: `packages/web-core/src/index.ts`
- Modify: `packages/web-core/package.json`
- Test: `packages/web-core/src/bridge/schemas.test.ts`
- Test: `packages/web-core/src/storage/schemas.test.ts`

**Interfaces:**
- Consumes: 现有 ScoreIdentity、MusicalPosition、SidecarPayload 结构。
- Produces: `bridgeRequestSchema`、`bridgeEventSchema`、`bridgeResponseSchemas`、`capabilitiesSchema`、`sidecarPayloadSchema`、`localPlaybackResumeSchema` 及其推导类型。

- [ ] **Step 1: 写 Bridge 信任边界失败测试**

```ts
import { describe, expect, it } from "vitest";
import { bridgeRequestSchema, capabilitiesSchema } from "./schemas";

describe("bridge schemas", () => {
  it("rejects unknown message types", () => {
    expect(() => bridgeRequestSchema.parse({
      bridgeVersion: "1.0.0", correlationId: "x", type: "electron.send", payload: {},
    })).toThrow();
  });

  it("models temporary file access without platform mechanisms", () => {
    expect(capabilitiesSchema.parse({
      fileAccess: { openExternalFile: true, persistentFileReferences: false, localLibraryImport: false },
      storage: { sqliteIndex: false, sidecarPayload: true },
      sync: { available: false, provider: "none" },
      audio: { webAudio: true, nativeBridge: false },
    }).fileAccess.persistentFileReferences).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认 schema 尚不存在**

Run: `npx vitest run packages/web-core/src/bridge/schemas.test.ts`

Expected: FAIL，提示无法导入 `./schemas`。

- [ ] **Step 3: 定义共享基础 schema**

```ts
// packages/web-core/src/bridge/schemas.ts
import { z } from "zod";
import { scoreIdentitySchema } from "../score/schemas";
import { localPlaybackResumeSchema, sidecarPayloadSchema } from "../storage/schemas";

export const BRIDGE_SCHEMA_VERSION = "1.0.0" as const;
const id = z.string().min(1).max(128);
const envelope = <T extends string, S extends z.ZodType>(type: T, payload: S) => z.object({
  bridgeVersion: z.literal(BRIDGE_SCHEMA_VERSION), correlationId: id, type: z.literal(type), payload,
}).strict();

export const bridgeErrorSchema = z.object({
  code: z.string().min(1), message: z.string(), recoverable: z.boolean(), details: z.unknown().optional(),
}).strict();
export const capabilitiesSchema = z.object({
  fileAccess: z.object({ openExternalFile: z.boolean(), persistentFileReferences: z.boolean(), localLibraryImport: z.boolean() }).strict(),
  storage: z.object({ sqliteIndex: z.boolean(), sidecarPayload: z.boolean() }).strict(),
  sync: z.object({ available: z.boolean(), provider: z.enum(["none", "custom"]) }).strict(),
  audio: z.object({ webAudio: z.boolean(), nativeBridge: z.boolean() }).strict(),
}).strict();
export const bridgeRequestSchema = z.discriminatedUnion("type", [
  envelope("app.handshake", z.object({ appVersion: z.string(), rendererBuildHash: id }).strict()),
  envelope("file.open", z.object({}).strict()),
  envelope("file.readBytes", z.object({ fileToken: id }).strict()),
  envelope("sidecar.read", z.object({ identity: scoreIdentitySchema }).strict()),
  envelope("sidecar.write", z.object({ identity: scoreIdentitySchema, payload: sidecarPayloadSchema }).strict()),
  envelope("playbackResume.read", z.object({ identity: scoreIdentitySchema }).strict()),
  envelope("playbackResume.write", z.object({ identity: scoreIdentitySchema, resume: localPlaybackResumeSchema }).strict()),
  envelope("app.lifecycleAck", z.object({ state: z.enum(["suspend", "prepare-close"]) }).strict()),
  envelope("diagnostics.write", z.object({ code: id, durationMs: z.number().nonnegative().optional(), contentHashPrefix: z.string().max(16).optional() }).strict()),
  envelope("diagnostics.openDirectory", z.object({}).strict()),
]);
export const bridgeEventSchema = z.discriminatedUnion("type", [
  envelope("app.command", z.object({ command: z.enum(["open-score", "toggle-playback"]) }).strict()),
  envelope("app.lifecycle", z.object({ state: z.enum(["suspend", "prepare-close"]) }).strict()),
  envelope("storage.warning", z.object({ code: z.literal("CORRUPT_PERSISTED_DATA"), category: z.enum(["sidecar", "resume"]) }).strict()),
]);
export type BridgeRequest = z.infer<typeof bridgeRequestSchema>;
export type BridgeEvent = z.infer<typeof bridgeEventSchema>;
export type Capabilities = z.infer<typeof capabilitiesSchema>;
export type BridgeError = z.infer<typeof bridgeErrorSchema>;
```

在同文件导出按 `BridgeRequest["type"]` 索引的 `bridgeResponseSchemas`：handshake 返回版本/hash/capabilities；`file.open` 返回 cancelled/opened 判别联合；`file.readBytes` 返回 `{fileName, bytes: z.instanceof(Uint8Array)}`；read 返回 optional payload；write/ack/diagnostics 返回严格空对象。

```ts
export const bridgeResponseSchemas = {
  "app.handshake": z.object({
    appVersion: z.string(),
    bridgeVersion: z.literal(BRIDGE_SCHEMA_VERSION),
    rendererBuildHash: id,
    capabilities: capabilitiesSchema,
  }).strict(),
  "file.open": z.discriminatedUnion("status", [
    z.object({ status: z.literal("cancelled") }).strict(),
    z.object({
      status: z.literal("opened"), fileToken: id, fileName: z.string().min(1), sizeBytes: z.number().int().nonnegative(),
    }).strict(),
  ]),
  "file.readBytes": z.object({ fileName: z.string().min(1), bytes: z.instanceof(Uint8Array) }).strict(),
  "sidecar.read": z.object({ payload: sidecarPayloadSchema.optional() }).strict(),
  "sidecar.write": z.object({}).strict(),
  "playbackResume.read": z.object({ resume: localPlaybackResumeSchema.optional() }).strict(),
  "playbackResume.write": z.object({}).strict(),
  "app.lifecycleAck": z.object({}).strict(),
  "diagnostics.write": z.object({}).strict(),
  "diagnostics.openDirectory": z.object({}).strict(),
} as const;
```

- [ ] **Step 4: 定义持久 payload schema 并推导类型**

`score/schemas.ts`、`playback/schemas.ts` 与 `storage/schemas.ts` 必须逐字段镜像现有类型，所有 object 使用 `.strict()`；速度限制 `0.25..2`、音量限制 `0..1`、时间戳使用 `z.iso.datetime()`，循环用 `.refine(loop => loop.start.tick < loop.end.tick)`。类型文件改为：

```ts
// packages/web-core/src/score/schemas.ts
import { z } from "zod";
export const scoreIdentitySchema = z.object({
  contentHash: z.string().min(16).max(128),
  format: z.enum(["gp", "midi"]),
  title: z.string().optional(), artist: z.string().optional(), durationMs: z.number().nonnegative().optional(),
  sourceHints: z.object({
    fileName: z.string().optional(), trackNames: z.array(z.string()).optional(), tempoSummary: z.string().optional(),
  }).strict().optional(),
}).strict();
```

```ts
// packages/web-core/src/storage/schemas.ts
import { z } from "zod";
import { scoreIdentitySchema } from "../score/schemas";
const timestamp = z.iso.datetime();
export const musicalPositionSchema = z.object({
  measureId: z.string(), measureIndex: z.number().int(), beatIndex: z.number().int(),
  tick: z.number().int().nonnegative(), cachedTimeMs: z.number().nonnegative(),
}).strict();
const loopRegionSchema = z.object({
  id: z.string(), label: z.string(), labelSource: z.enum(["generated", "user"]),
  start: musicalPositionSchema, end: musicalPositionSchema, snapMode: z.enum(["off", "beat", "measure"]),
  speedOverride: z.number().min(0.25).max(2).optional(), createdAt: timestamp, updatedAt: timestamp,
  deletedAt: timestamp.optional(),
}).strict().refine(value => value.start.tick < value.end.tick, "Loop start must precede end");
const playbackSchema = z.object({
  scoreSpeed: z.object({ value: z.number().min(0.25).max(2), updatedAt: timestamp }).strict(),
  loops: z.array(loopRegionSchema),
  visibility: z.object({ primaryTrackId: z.string().optional(), additionalTrackIds: z.array(z.string()), updatedAt: timestamp }).strict(),
  tracks: z.record(z.string(), z.object({
    muted: z.boolean(), volume: z.number().min(0).max(1), muteUpdatedAt: timestamp, volumeUpdatedAt: timestamp,
  }).strict()),
}).strict();
const quantizationSchema = z.object({ grid: z.enum(["1/8", "1/16", "1/32"]), swing: z.boolean() }).strict();
export const sidecarPayloadSchema = z.object({
  schemaVersion: z.literal("0.2.0"), identity: scoreIdentitySchema,
  practice: z.object({
    tempoOverride: z.number().optional(), transpose: z.number().optional(),
    loops: z.array(z.object({ id: z.string(), startTick: z.number(), endTick: z.number() }).strict()),
    sections: z.array(z.object({ id: z.string(), name: z.string(), startTick: z.number(), endTick: z.number() }).strict()),
    annotations: z.array(z.object({ id: z.string(), tick: z.number(), text: z.string(), updatedAt: timestamp }).strict()),
    playback: playbackSchema,
  }).strict(),
  tracks: z.record(z.string(), z.object({
    muted: z.boolean().optional(), solo: z.boolean().optional(), volume: z.number().min(0).max(1).optional(), instrument: z.string().optional(),
  }).strict()),
  midi: z.object({
    quantization: quantizationSchema,
    handAssignments: z.record(z.string(), z.enum(["left", "right", "unknown"])),
    measureCorrections: z.record(z.string(), z.object({
      measureId: z.string(), quantization: quantizationSchema.optional(),
      handAssignments: z.record(z.string(), z.enum(["left", "right", "unknown"])).optional(),
    }).strict()),
  }).strict().optional(),
}).strict();
export const localPlaybackResumeSchema = z.object({ position: musicalPositionSchema, updatedAt: timestamp }).strict();
```

```ts
import { z } from "zod";
import { scoreIdentitySchema } from "./schemas";
export type ScoreIdentity = z.infer<typeof scoreIdentitySchema>;
```

把现有单元测试中的短占位 hash 统一改为 64 位十六进制字符串，例如 `"a".repeat(64)`；产品 schema 不为测试保留非真实 hash 特例。

`decodeSidecar()` 保留 `0.1.0 → 0.2.0` 迁移，但迁移结果最终必须调用 `sidecarPayloadSchema.parse()`；`encodeSidecar()` 先 parse 再 stringify。删除重复手写 runtime validator。

- [ ] **Step 5: 重构 mock bridge 与调用方使用推导类型**

```ts
export interface RpcBridge {
  request(message: BridgeRequest): Promise<unknown>;
}
```

提供 `createBridgeRequest(type, correlationId, payload)` 和 `parseBridgeResponse(type, value)`，让 `BridgePlaybackPersistence`、`openFileThroughBridge`、`openGpThroughBridge` 与 MockNativeBridge 不再接受任意字符串 channel。Mock capabilities 固定为 Desktop GP Slice 的能力值，Browser 测试按需要显式覆盖。

- [ ] **Step 6: 安装 Zod 并运行完整验证**

Run: `pnpm --filter @tab-viewer/web-core add --save-exact zod@4.4.3 && pnpm check && pnpm demo:build`

Expected: 所有 schema、迁移、mock bridge 和 Browser 回归测试通过。

- [ ] **Step 7: 提交合约迁移**

```bash
git add packages/web-core packages/web-viewer apps/web-demo package.json pnpm-lock.yaml
git commit -m "refactor: derive bridge contracts from Zod schemas"
```

---

### Task 5: 对齐自动保存与宿主生命周期接口

**Files:**
- Modify: `packages/web-core/src/playback/types.ts`
- Modify: `packages/web-core/src/playback/playbackController.ts`
- Modify: `packages/web-core/src/playback/playbackController.test.ts`
- Modify: `packages/web-viewer/src/viewerApp.ts`
- Modify: `packages/web-viewer/src/viewerApp.test.ts`

**Interfaces:**
- Consumes: `PlaybackController.dispatch()` 与 `ViewerAppHandle`。
- Produces: `{ type: "pause" }` command、500 ms sidecar debounce、`pauseAndFlush()`。

- [ ] **Step 1: 写 500 ms 与显式暂停失败测试**

```ts
it("debounces sidecar writes for 500 ms", async () => {
  await controller.dispatch({ type: "set-score-speed", speed: 0.75 });
  schedule.advanceBy(499);
  expect(persistence.sidecarWrites).toHaveLength(0);
  schedule.advanceBy(1);
  await flushPromises();
  expect(persistence.sidecarWrites).toHaveLength(1);
});

it("pauses and flushes resume state", async () => {
  engine.emit({ type: "transport", state: "playing" });
  await controller.dispatch({ type: "pause" });
  expect(engine.playPauseCalls).toBe(1);
  expect(persistence.resumeWrites).toHaveLength(1);
});
```

- [ ] **Step 2: 运行测试确认当前 300 ms 与缺少 pause command**

Run: `npx vitest run packages/web-core/src/playback/playbackController.test.ts`

Expected: FAIL：499 ms 前已经写入，且 `pause` 不属于 `PlaybackCommand`。

- [ ] **Step 3: 实现最小领域变化**

```ts
// PlaybackCommand union
| { type: "pause" }
```

```ts
// PlaybackController.dispatch
case "pause":
  if (this.state.transport === "playing") this.options.engine.playPause();
  await this.queueResumeWrite();
  return;
```

把 `markSidecarDirty()` 的 schedule 延迟从 `300` 改为 `500`。`ViewerAppHandle.pauseAndFlush()` 调用 active Session 的 `controller.dispatch({type:"pause"})` 后执行 `controller.flush()`。

- [ ] **Step 4: 验证领域与 UI 生命周期**

Run: `pnpm check && pnpm demo:build`

Expected: 自动保存、显式暂停、destroy flush 与 Browser 回归全部通过。

- [ ] **Step 5: 提交生命周期能力**

```bash
git add packages/web-core packages/web-viewer
git commit -m "feat: align playback persistence lifecycle"
```

---

### Task 6: 建立安全的 Electron Shell 与内置资源协议

**Files:**
- Create: `apps/desktop-shell/package.json`
- Create: `apps/desktop-shell/tsconfig.json`
- Create: `apps/desktop-shell/index.html`
- Create: `apps/desktop-shell/rspack.config.mjs`
- Create: `apps/desktop-shell/forge.config.mjs`
- Create: `apps/desktop-shell/src/main/protocol.ts`
- Create: `apps/desktop-shell/src/main/main.ts`
- Create: `apps/desktop-shell/src/preload.ts`
- Create: `apps/desktop-shell/src/renderer.ts`
- Create: `apps/desktop-shell/src/main/protocol.test.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: `@tab-viewer/web-viewer` Renderer 入口与离线 alphaTab 资源。
- Produces: `resolveAppAsset(root, url)`、secure BrowserWindow、`desktop:dev/build/package` scripts。

- [ ] **Step 1: 写协议路径安全失败测试**

```ts
import { describe, expect, it } from "vitest";
import { resolveAppAsset } from "./protocol";

describe("resolveAppAsset", () => {
  it("resolves assets inside the renderer root", () => {
    expect(resolveAppAsset("/app/renderer", "tab-viewer://app/index.html"))
      .toBe("/app/renderer/index.html");
  });
  it("rejects traversal", () => {
    expect(() => resolveAppAsset("/app/renderer", "tab-viewer://app/%2e%2e/secret"))
      .toThrow("APP_PROTOCOL_PATH_OUTSIDE_ROOT");
  });
});
```

- [ ] **Step 2: 运行测试确认 Electron app 尚不存在**

Run: `npx vitest run apps/desktop-shell/src/main/protocol.test.ts`

Expected: FAIL，提示模块不存在。

- [ ] **Step 3: 创建 Desktop workspace 与精确依赖**

`apps/desktop-shell/package.json`：

```json
{
  "name": "@tab-viewer/desktop-shell",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "dist/main/main.cjs",
  "scripts": {
    "dev": "rspack build --watch",
    "build": "rspack build",
    "start": "electron .",
    "package": "pnpm build && electron-forge package",
    "make": "pnpm build && electron-forge make"
  },
  "dependencies": {
    "@tab-viewer/web-core": "0.1.0",
    "@tab-viewer/web-viewer": "0.1.0"
  },
  "devDependencies": {
    "@electron-forge/cli": "7.11.2",
    "@electron-forge/maker-squirrel": "7.11.2",
    "@electron-forge/maker-zip": "7.11.2",
    "electron": "43.1.0"
  }
}
```

根脚本增加 `desktop:build`、`desktop:start`、`desktop:package`，根 `tsconfig.json` 增加 desktop-shell reference。

- [ ] **Step 4: 实现只读协议路径解析**

```ts
// apps/desktop-shell/src/main/protocol.ts
import path from "node:path";
import { net, protocol } from "electron";
import { pathToFileURL } from "node:url";

export function resolveAppAsset(root: string, rawUrl: string): string {
  const url = new URL(rawUrl);
  if (url.protocol !== "tab-viewer:" || url.host !== "app") throw new Error("APP_PROTOCOL_INVALID_ORIGIN");
  const candidate = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
  const relative = path.relative(path.resolve(root), candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("APP_PROTOCOL_PATH_OUTSIDE_ROOT");
  return candidate;
}

export function registerAppProtocol(root: string): void {
  protocol.handle("tab-viewer", request => net.fetch(pathToFileURL(resolveAppAsset(root, request.url)).href));
}
```

在 `app.ready` 之前用 `protocol.registerSchemesAsPrivileged` 注册 `standard`、`secure`、`supportFetchAPI`、`stream`，所有值按设计显式设置且 `bypassCSP: false`。

- [ ] **Step 5: 创建严格隔离窗口和三目标 Rspack 构建**

Main 创建窗口时使用：

```ts
new BrowserWindow({
  width: 1280,
  height: 800,
  webPreferences: {
    preload: path.join(__dirname, "../preload/preload.cjs"),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
  },
});
```

阻止 `will-navigate` 和 `setWindowOpenHandler`，拒绝全部 permission request。`rspack.config.mjs` 导出 Main(`electron-main`)、Preload(`electron-preload`) 与 Renderer(`web`) 三个 config；Renderer 复制 alphaTab、字体、SoundFont、许可证并生成 contenthash 文件。`index.html` 使用 CSP：

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; media-src 'self'; worker-src 'self' blob:; img-src 'self' data:">
```

- [ ] **Step 6: 安装依赖并验证安全构建**

Run: `pnpm install && pnpm check && pnpm desktop:build`

Expected: 协议测试通过；产物包含 main/preload/renderer，且 Renderer build 不包含 test fixtures。

- [ ] **Step 7: 提交 Desktop Shell 基线**

```bash
git add apps/desktop-shell package.json pnpm-lock.yaml tsconfig.json
git commit -m "feat: add secure Electron desktop shell"
```

---

### Task 7: 接通严格校验的 Preload Bridge 与握手

**Files:**
- Create: `apps/desktop-shell/src/main/bridge.ts`
- Create: `apps/desktop-shell/src/main/bridge.test.ts`
- Modify: `apps/desktop-shell/src/preload.ts`
- Modify: `apps/desktop-shell/src/renderer.ts`
- Modify: `apps/desktop-shell/src/main/main.ts`
- Create: `apps/desktop-shell/src/global.d.ts`

**Interfaces:**
- Consumes: `bridgeRequestSchema`、`bridgeEventSchema`、`bridgeResponseSchemas`。
- Produces: 固定 IPC channel `tab-viewer:request`、`tab-viewer:event` 和 `window.tabViewerBridge`。

- [ ] **Step 1: 写发送者与 schema 双重校验失败测试**

```ts
it("rejects requests from a non-app sender", async () => {
  await expect(dispatchBridgeRequest({ senderUrl: "https://evil.example/", value: validHandshake }))
    .rejects.toMatchObject({ code: "INVALID_BRIDGE_SENDER" });
});

it("rejects unknown bridge messages before dispatch", async () => {
  await expect(dispatchBridgeRequest({ senderUrl: "tab-viewer://app/index.html", value: { type: "fs.read", payload: {} } }))
    .rejects.toMatchObject({ code: "INVALID_BRIDGE_MESSAGE" });
});
```

- [ ] **Step 2: 运行测试确认 dispatcher 不存在**

Run: `npx vitest run apps/desktop-shell/src/main/bridge.test.ts`

Expected: FAIL，提示 `dispatchBridgeRequest` 不存在。

- [ ] **Step 3: 实现固定 Preload API**

```ts
// apps/desktop-shell/src/preload.ts
import { contextBridge, ipcRenderer } from "electron";
import { bridgeEventSchema, bridgeRequestSchema } from "@tab-viewer/web-core";

contextBridge.exposeInMainWorld("tabViewerBridge", {
  request(value: unknown) {
    return ipcRenderer.invoke("tab-viewer:request", bridgeRequestSchema.parse(value));
  },
  subscribe(listener: (event: unknown) => void) {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) => listener(bridgeEventSchema.parse(value));
    ipcRenderer.on("tab-viewer:event", handler);
    return () => ipcRenderer.removeListener("tab-viewer:event", handler);
  },
});
```

- [ ] **Step 4: 实现 Main dispatcher 与精确握手**

`dispatchBridgeRequest()` 先用 `new URL(senderUrl)` 精确验证 protocol=`tab-viewer:`、host=`app`，再 parse 请求、按 `type` 调 handler、用对应 response schema parse 返回值。`app.handshake` 校验 Bridge schema、应用版本与由 Rspack `DefinePlugin` 注入的 Renderer build hash；任何不一致返回不可恢复 `BRIDGE_VERSION_MISMATCH`。

- [ ] **Step 5: Renderer 启动时握手且不得 mock 降级**

`renderer.ts` 检查 `window.tabViewerBridge`，发送 handshake，成功后创建 Electron ViewerHost 并挂载共享 Viewer；缺失或不匹配时只渲染启动级错误，不导入 `MockNativeBridge`。

- [ ] **Step 6: 验证 Bridge 暴露面**

Run: `pnpm check && pnpm desktop:build`

Expected: 测试确认只有 `request/subscribe`，未知 channel、未知 type、错误 sender 和版本漂移全部被拒绝。

- [ ] **Step 7: 提交 Bridge**

```bash
git add apps/desktop-shell packages/web-core
git commit -m "feat: connect validated Electron preload bridge"
```

---

### Task 8: 实现系统文件选择与一次性 token

**Files:**
- Create: `apps/desktop-shell/src/main/fileTokens.ts`
- Create: `apps/desktop-shell/src/main/fileTokens.test.ts`
- Create: `apps/desktop-shell/src/main/files.ts`
- Modify: `apps/desktop-shell/src/main/bridge.ts`
- Modify: `apps/desktop-shell/src/renderer.ts`
- Test: `apps/desktop-shell/src/main/files.test.ts`

**Interfaces:**
- Consumes: `file.open` 与 `file.readBytes` Bridge schema。
- Produces: `FileTokenStore.issue(path, metadata)`、`FileTokenStore.consume(token)`、`openGpFile()`。

- [ ] **Step 1: 写 token 单次、超限和超时失败测试**

```ts
it("consumes a token exactly once", () => {
  const store = new FileTokenStore({ now: () => 1000, ttlMs: 60_000 });
  const token = store.issue("/tmp/song.gp5", { fileName: "song.gp5", sizeBytes: 12 });
  expect(store.consume(token).fileName).toBe("song.gp5");
  expect(() => store.consume(token)).toThrow("FILE_TOKEN_INVALID");
});

it("rejects files larger than 64 MiB", () => {
  expect(() => assertReadableGp({ fileName: "huge.gp", sizeBytes: 64 * 1024 * 1024 + 1, isFile: true }))
    .toThrow("FILE_TOO_LARGE");
});
```

- [ ] **Step 2: 运行测试确认文件模块不存在**

Run: `npx vitest run apps/desktop-shell/src/main/fileTokens.test.ts apps/desktop-shell/src/main/files.test.ts`

Expected: FAIL，提示模块不存在。

- [ ] **Step 3: 实现 token store 与 GP 校验**

```ts
export const MAX_SCORE_BYTES = 64 * 1024 * 1024;
const GP_EXTENSIONS = new Set([".gp3", ".gp4", ".gp5", ".gpx", ".gp"]);

export class FileTokenStore {
  private entries = new Map<string, { path: string; fileName: string; sizeBytes: number; expiresAt: number }>();
  constructor(private readonly options = { now: () => Date.now(), ttlMs: 60_000 }) {}
  issue(path: string, metadata: { fileName: string; sizeBytes: number }): string {
    const token = crypto.randomUUID();
    this.entries.set(token, { path, ...metadata, expiresAt: this.options.now() + this.options.ttlMs });
    return token;
  }
  consume(token: string) {
    const entry = this.entries.get(token);
    this.entries.delete(token);
    if (!entry || entry.expiresAt < this.options.now()) throw new Error("FILE_TOKEN_INVALID");
    return entry;
  }
  clear(): void { this.entries.clear(); }
}
```

`assertReadableGp()` 要求普通文件、允许扩展名、`sizeBytes <= MAX_SCORE_BYTES`。`file.open` 使用 `dialog.showOpenDialog({properties:["openFile"], filters:[{name:"Guitar Pro", extensions:["gp3","gp4","gp5","gpx","gp"]}]})`；取消返回 `{status:"cancelled"}`。`file.readBytes` consume 后读取文件并返回 `{fileName, bytes:new Uint8Array(buffer)}`。

- [ ] **Step 4: Electron ViewerHost 使用两步打开流程**

Renderer host 的 `openScore()` 先请求 `file.open`；cancelled 返回 `undefined`；opened 再请求 `file.readBytes`。任何 BridgeError 映射为 Viewer 可恢复错误，真实路径永不进入 Renderer。

- [ ] **Step 5: 验证文件边界与 Browser 回归**

Run: `pnpm check && pnpm demo:build && pnpm desktop:build`

Expected: token 重用、超时、超限、非 GP 和取消路径均通过；两个宿主仍可构建。

- [ ] **Step 6: 提交文件能力**

```bash
git add apps/desktop-shell packages/web-viewer
git commit -m "feat: open GP files through one-time desktop tokens"
```

---

### Task 9: 实现原子 JSON 持久化、损坏隔离与本地日志

**Files:**
- Create: `apps/desktop-shell/src/main/storage.ts`
- Create: `apps/desktop-shell/src/main/storage.test.ts`
- Create: `apps/desktop-shell/src/main/diagnostics.ts`
- Create: `apps/desktop-shell/src/main/diagnostics.test.ts`
- Modify: `apps/desktop-shell/src/main/bridge.ts`
- Modify: `apps/desktop-shell/src/renderer.ts`

**Interfaces:**
- Consumes: `sidecarPayloadSchema`、`localPlaybackResumeSchema`、Bridge storage/diagnostics request。
- Produces: `JsonStore<T>.read/write()`、`DiagnosticLogger.write()`、真实 `BridgePlaybackPersistence`。

- [ ] **Step 1: 写原子写入与损坏隔离失败测试**

```ts
it("quarantines invalid JSON and returns no value", async () => {
  await mkdir(join(root, "sidecars"), { recursive: true });
  await writeFile(join(root, "sidecars", "abc.json"), "not-json", { recursive: false });
  const warnings: string[] = [];
  const store = new JsonStore(root, "sidecars", sidecarPayloadSchema, code => warnings.push(code));
  expect(await store.read("abc")).toBeUndefined();
  expect(warnings).toEqual(["CORRUPT_PERSISTED_DATA"]);
  expect((await readdir(join(root, "sidecars"))).some(name => name.includes(".corrupt"))).toBe(true);
});

it("serializes writes per identity", async () => {
  await Promise.all([store.write("abc", first), store.write("abc", second)]);
  expect(await store.read("abc")).toEqual(second);
});
```

- [ ] **Step 2: 运行测试确认 storage 不存在**

Run: `npx vitest run apps/desktop-shell/src/main/storage.test.ts`

Expected: FAIL，提示 `JsonStore` 不存在。

- [ ] **Step 3: 实现最小原子 store**

```ts
export class JsonStore<T> {
  private chains = new Map<string, Promise<void>>();
  constructor(
    private readonly userData: string,
    private readonly category: "sidecars" | "resume",
    private readonly schema: z.ZodType<T>,
    private readonly warn: (code: "CORRUPT_PERSISTED_DATA") => void,
  ) {}
  async read(contentHash: string): Promise<T | undefined> {
    const file = this.path(contentHash);
    try { return this.schema.parse(JSON.parse(await readFile(file, "utf8"))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      await rename(file, `${file}.${Date.now()}.corrupt`);
      this.warn("CORRUPT_PERSISTED_DATA");
      return undefined;
    }
  }
  write(contentHash: string, value: T): Promise<void> {
    const next = (this.chains.get(contentHash) ?? Promise.resolve()).then(async () => {
      const file = this.path(contentHash); const temp = `${file}.${crypto.randomUUID()}.tmp`;
      await mkdir(dirname(file), { recursive: true });
      await writeFile(temp, JSON.stringify(this.schema.parse(value), null, 2), { mode: 0o600 });
      await rename(temp, file);
    });
    this.chains.set(contentHash, next);
    return next.finally(() => { if (this.chains.get(contentHash) === next) this.chains.delete(contentHash); });
  }
  private path(contentHash: string): string {
    if (!/^[a-f0-9]{16,128}$/i.test(contentHash)) throw new Error("INVALID_CONTENT_HASH");
    return join(this.userData, this.category, `${contentHash}.json`);
  }
}
```

- [ ] **Step 4: 接入 sidecar/resume handlers 与警告事件**

Main 在 `app.getPath("userData")` 下创建 `sidecars/` 与 `resume/` store。读损坏数据时发送 `storage.warning`，Renderer 显示一次可恢复警告并继续默认状态。`BridgePlaybackPersistence` 通过已校验请求读写真实 store。

- [ ] **Step 5: 实现隐私化轮转日志**

`DiagnosticLogger` 只接受 `{code, durationMs?, contentHashPrefix?}`，单文件达到 1 MiB 时把 `desktop.log` 原子轮转为 `desktop.log.1`，只保留两个文件。`diagnostics.openDirectory` 使用 `shell.openPath(logDirectory)`；日志 schema 和测试必须拒绝 `path`、`fileName`、`payload` 等额外字段。

```ts
export class DiagnosticLogger {
  constructor(private readonly directory: string, private readonly maxBytes = 1024 * 1024) {}
  async write(value: unknown): Promise<void> {
    const event = diagnosticEventSchema.parse(value);
    await mkdir(this.directory, { recursive: true });
    const current = join(this.directory, "desktop.log");
    const previous = join(this.directory, "desktop.log.1");
    const size = await stat(current).then(info => info.size).catch(() => 0);
    if (size >= this.maxBytes) {
      await rm(previous, { force: true });
      await rename(current, previous);
    }
    await appendFile(current, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, { mode: 0o600 });
  }
}
```

- [ ] **Step 6: 验证持久化与日志**

Run: `pnpm check && pnpm desktop:build`

Expected: 原子写入、顺序、missing、corrupt、权限、日志轮转和敏感字段拒绝测试全部通过。

- [ ] **Step 7: 提交本地数据层**

```bash
git add apps/desktop-shell packages/web-core packages/web-viewer
git commit -m "feat: persist desktop practice state as atomic JSON"
```

---

### Task 10: 完成单实例、菜单、挂起和安全关闭生命周期

**Files:**
- Create: `apps/desktop-shell/src/main/lifecycle.ts`
- Create: `apps/desktop-shell/src/main/lifecycle.test.ts`
- Modify: `apps/desktop-shell/src/main/main.ts`
- Modify: `apps/desktop-shell/src/renderer.ts`
- Modify: `packages/web-viewer/src/viewerApp.ts`
- Test: `packages/web-viewer/src/viewerApp.test.ts`

**Interfaces:**
- Consumes: `app.command`、`app.lifecycle` event 与 `app.lifecycleAck` request。
- Produces: `DesktopLifecycleCoordinator`，保证 suspend/close 先 pause+flush 再继续。

- [ ] **Step 1: 写关闭等待与超时失败测试**

```ts
it("waits for prepare-close acknowledgement", async () => {
  const coordinator = new DesktopLifecycleCoordinator(sendEvent, { timeoutMs: 5000 });
  const closing = coordinator.prepareClose();
  expect(sendEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "app.lifecycle", payload: { state: "prepare-close" } }));
  coordinator.acknowledge("prepare-close");
  await expect(closing).resolves.toBe("acknowledged");
});
```

- [ ] **Step 2: 运行测试确认 coordinator 不存在**

Run: `npx vitest run apps/desktop-shell/src/main/lifecycle.test.ts`

Expected: FAIL，提示模块不存在。

- [ ] **Step 3: 实现单实例与窗口作用域 coordinator**

Main 在 `app.whenReady()` 前调用 `app.requestSingleInstanceLock()`；失败立即 `app.quit()`，`second-instance` 聚焦已有窗口。`DesktopLifecycleCoordinator` 对每个 state 只保留一个 pending promise，收到 ack 后释放，5 秒后返回 `timed-out` 并写稳定诊断码。

```ts
export class DesktopLifecycleCoordinator {
  private pending = new Map<"suspend" | "prepare-close", () => void>();
  constructor(
    private readonly send: (event: BridgeEvent) => void,
    private readonly options: { timeoutMs: number },
  ) {}
  async request(state: "suspend" | "prepare-close"): Promise<"acknowledged" | "timed-out"> {
    this.send(createBridgeEvent("app.lifecycle", { state }));
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.pending.delete(state); resolve("timed-out"); }, this.options.timeoutMs);
      this.pending.set(state, () => { clearTimeout(timer); this.pending.delete(state); resolve("acknowledged"); });
    });
  }
  acknowledge(state: "suspend" | "prepare-close"): void { this.pending.get(state)?.(); }
  prepareClose(): Promise<"acknowledged" | "timed-out"> { return this.request("prepare-close"); }
}
```

- [ ] **Step 4: 接入菜单与系统事件**

原生菜单只发送 typed event：Open 发送 `app.command/open-score`，播放/暂停发送 `app.command/toggle-playback`。`powerMonitor` 的 `suspend` 与 `lock-screen` 发送 lifecycle suspend；`resume`/`unlock-screen` 不自动播放。窗口 close 第一次 `preventDefault()`，等待 prepare-close ack 或超时后销毁并退出。

菜单另提供“打开日志目录”，只触发 `diagnostics.openDirectory`；菜单本身不能获得或展示日志路径。

- [ ] **Step 5: Renderer flush 后确认生命周期**

Renderer 收到 suspend 时调用 `ViewerAppHandle.pauseAndFlush()`，完成后请求 `app.lifecycleAck/suspend`；收到 prepare-close 时调用 `destroy()`，完成后请求 ack。窗口失焦和最小化不触发暂停。

- [ ] **Step 6: 验证生命周期**

Run: `pnpm check && pnpm desktop:build`

Expected: 单实例、菜单事件、suspend、无自动恢复、关闭 ack、超时降级与换谱 destroy 顺序测试全部通过。

- [ ] **Step 7: 提交桌面生命周期**

```bash
git add apps/desktop-shell packages/web-viewer
git commit -m "feat: coordinate desktop app and playback lifecycle"
```

---

### Task 11: 增加 Electron smoke、打包验证和验收文档

**Files:**
- Create: `apps/desktop-shell/playwright.config.ts`
- Create: `apps/desktop-shell/e2e/desktop.spec.ts`
- Create: `apps/desktop-shell/scripts/verify-package.mjs`
- Modify: `apps/desktop-shell/package.json`
- Modify: `apps/desktop-shell/forge.config.mjs`
- Modify: `package.json`
- Modify: `docs/architecture/gp-playback-practice-acceptance.md`
- Modify: `docs/architecture/implementation-foundation.md`

**Interfaces:**
- Consumes: 可启动 Desktop Shell、固定 fixture、Forge package。
- Produces: `pnpm desktop:test:e2e`、`desktop:package` 和 macOS/Windows 验收记录入口。

- [ ] **Step 1: 写启动与安全 smoke**

```ts
import { test, expect, _electron as electron } from "@playwright/test";

test("starts offline with an isolated renderer", async () => {
  const app = await electron.launch({ args: ["apps/desktop-shell"], offline: true });
  const window = await app.firstWindow();
  await expect(window.locator("#open-score")).toBeVisible();
  expect(await window.evaluate(() => ({
    require: typeof (globalThis as { require?: unknown }).require,
    process: typeof (globalThis as { process?: unknown }).process,
    api: Object.keys(window.tabViewerBridge).sort(),
  }))).toEqual({ require: "undefined", process: "undefined", api: ["request", "subscribe"] });
  await app.close();
});
```

- [ ] **Step 2: 运行 smoke 确认 Playwright 尚未安装**

Run: `pnpm desktop:test:e2e`

Expected: FAIL，提示缺少 `@playwright/test` 或脚本。

- [ ] **Step 3: 安装 Playwright 并补关键跨进程场景**

Run: `pnpm --filter @tab-viewer/desktop-shell add --save-dev --save-exact @playwright/test@1.61.1`

`apps/desktop-shell/package.json` 增加：

```json
"test:e2e": "playwright test -c playwright.config.ts"
```

根 `package.json` 增加：

```json
"desktop:test:e2e": "pnpm --filter @tab-viewer/desktop-shell test:e2e"
```

在同一 spec 中通过 `electronApp.evaluate(({dialog}), filePath => { dialog.showOpenDialog = async () => ({canceled:false,filePaths:[filePath]}); }, fixture)` 固定系统文件选择器，验证打开 GP、保存速度/循环、关闭、使用同一 userData 重启、重新选择后恢复。另测 `will-navigate`、`window.open`、未知 IPC 和网络请求被拒绝。

- [ ] **Step 4: 配置 Forge 产物与 package 验证器**

`forge.config.mjs` 使用 `asar: true`；macOS 只启用 maker-zip/arm64，Windows 只启用 maker-squirrel/x64。`verify-package.mjs` 解包或检查 Forge package，必须找到 Renderer、alphaTab、Bravura、`sonivox.sf3`、许可证和 CSP，并确认不存在 `MockNativeBridge` 字符串、`test-fixtures/` 与 `.map`。

- [ ] **Step 5: 运行最终自动化门槛**

Run: `pnpm fixtures:gp && pnpm check && pnpm demo:build && pnpm desktop:build && pnpm desktop:test:e2e && pnpm desktop:package`

Expected: 全部命令通过；当前平台生成对应架构的 Internal Acceptance Build；package 验证器通过。

- [ ] **Step 6: 执行并记录人工验收**

在 macOS arm64 包中验证：系统文件选择、GP5 与派生 GP、损坏文件、SoundFont、播放/停止/定位、变速、两个命名循环、轨道显示/静音/独奏/音量、最小化继续、休眠暂停、重启重新选文件恢复。Windows x64 使用同一矩阵复验。只把实际执行并观察成功的单元格更新为“通过”，失败项记录文件、平台、应用版本与稳定错误码。

- [ ] **Step 7: 更新实现说明并提交竖切**

```bash
git add apps/desktop-shell package.json pnpm-lock.yaml docs/architecture
git commit -m "test: verify Electron desktop GP slice"
```

---

## Final Verification

- [ ] Run: `pnpm fixtures:gp`
  - Expected: 原始 GP5 与派生现代 GP 均能解析，中文元数据保持不变。
- [ ] Run: `pnpm check`
  - Expected: TypeScript project references 和全部 Vitest 测试通过。
- [ ] Run: `pnpm demo:build`
  - Expected: Browser Demo 构建通过，离线 alphaTab 资产与许可证齐全。
- [ ] Run: `pnpm desktop:build`
  - Expected: Main、Preload、Renderer 三个目标构建通过。
- [ ] Run: `pnpm desktop:test:e2e`
  - Expected: 启动、隔离、文件打开、持久化恢复和安全 smoke 通过。
- [ ] Run: `pnpm desktop:package`
  - Expected: 当前平台内部验收包生成并通过资源/排除项校验。
- [ ] Run: `git diff --check && git status --short`
  - Expected: 无 whitespace 错误；只保留预期源文件改动和明确忽略的生成物。
