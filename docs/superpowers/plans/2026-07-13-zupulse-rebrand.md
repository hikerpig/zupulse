# Zupulse Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将活动产品、代码和当前文档中的 Tab Viewer 品牌统一改为 `Zupulse / 逐拍`，并接受所有内部标识的 Breaking Change。

**Architecture:** 这是一次纯命名变更，不改变领域接口和业务数据流。先改 workspace 包身份，再改 Electron/Browser 运行时标识，最后更新品牌文案与当前设计资料；每一阶段独立验证，旧数据库和旧内部 API 不提供兼容层。

**Tech Stack:** TypeScript、pnpm workspace、React、Electron、IndexedDB、Vitest、Playwright、Zod

## Global Constraints

- 英文产品名统一为 `Zupulse`，中文品牌统一为“逐拍”，双语场景使用“Zupulse 逐拍”。
- npm scope 统一为 `@zupulse/*`；Electron 协议为 `zupulse://`；IPC channel 为 `zupulse:*`；Renderer Bridge 为 `window.zupulseBridge`。
- Browser 数据库和临时目录等内部名称使用 `zupulse-*`，不迁移旧数据，不提供兼容别名。
- 不改变领域模型、Bridge 消息结构、视觉语言或业务行为，不新增依赖。
- 保留历史 ADR、历史实施计划和 Git 历史中的旧名称。
- 不触碰已有的无关删除和未跟踪文件；提交时逐项指定本计划修改的文件。

---

### Task 1: Workspace 包身份与依赖引用

**Files:**

- Modify: `package.json`
- Modify: `packages/web-core/package.json`
- Modify: `packages/web-viewer/package.json`
- Modify: `apps/web-demo/package.json`
- Modify: `apps/desktop-shell/package.json`
- Modify: 所有活动源码与测试中导入 `@tab-viewer/*` 的 `.ts`、`.tsx` 文件
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces: workspace 包 `@zupulse/web-core`、`@zupulse/web-viewer`、`@zupulse/web-demo`、`@zupulse/desktop-shell`

- [ ] **Step 1: 更新包身份、脚本筛选器和源码导入**

使用 `apply_patch` 将根包名改为 `zupulse`，将所有活动 `package.json` 的 `@tab-viewer/` 改为 `@zupulse/`，并将活动源码、测试中的导入统一改为：

```ts
import type { ViewerHost } from "@zupulse/web-viewer";
import type { LibraryScoreId } from "@zupulse/web-core";
```

根脚本使用新的筛选器，例如：

```json
"demo:build": "pnpm --filter @zupulse/web-demo build",
"desktop:build": "pnpm --filter @zupulse/desktop-shell build"
```

- [ ] **Step 2: 重新生成 workspace 锁文件引用**

Run: `pnpm install --lockfile-only`

Expected: 成功退出，`pnpm-lock.yaml` 的 importer 依赖只引用 `@zupulse/*`。

- [ ] **Step 3: 验证包解析和类型检查**

Run: `pnpm typecheck`

Expected: PASS，不出现 `Cannot find module '@zupulse/...'`。

- [ ] **Step 4: 提交包身份变更**

```bash
git add package.json pnpm-lock.yaml packages/web-core/package.json packages/web-viewer/package.json apps/web-demo/package.json apps/desktop-shell/package.json packages apps
git commit -m "refactor: rename workspace packages to Zupulse"
```

提交前用 `git diff --cached --name-only` 排除与本任务无关的既有改动。

### Task 2: Electron 协议、IPC 与 Bridge Breaking Change

**Files:**

- Modify: `apps/desktop-shell/src/global.d.ts`
- Modify: `apps/desktop-shell/src/preload.ts`
- Modify: `apps/desktop-shell/src/renderer.ts`
- Modify: `apps/desktop-shell/src/main/main.ts`
- Modify: `apps/desktop-shell/src/main/protocol.ts`
- Modify: `apps/desktop-shell/src/main/bridge.ts`
- Modify: `apps/desktop-shell/src/main/__tests__/bridge.test.ts`
- Modify: `apps/desktop-shell/src/main/__tests__/protocol.test.ts`
- Modify: `apps/desktop-shell/e2e/desktop.spec.ts`

**Interfaces:**

- Produces: `window.zupulseBridge.request(value)`、`window.zupulseBridge.subscribe(listener)`
- Produces: `zupulse://app/index.html`、`zupulse:request`、`zupulse:event`

- [ ] **Step 1: 先更新协议与 Bridge 测试期望**

将测试中的调用改为：

```ts
expect(resolveAppAsset("/app/renderer", "zupulse://app/index.html")).toBe("/app/renderer/index.html");

const exposed = await page.evaluate(() => ({
  api: Object.keys(window.zupulseBridge ?? {}).sort(),
}));
```

- [ ] **Step 2: 运行针对性测试并确认旧实现失败**

Run: `pnpm vitest run apps/desktop-shell/src/main/__tests__/protocol.test.ts apps/desktop-shell/src/main/__tests__/bridge.test.ts`

Expected: FAIL，错误指向旧 `tab-viewer://` 协议仍被校验或旧 Bridge 名称仍被使用。

- [ ] **Step 3: 更新运行时协议、IPC 和全局 Bridge**

用 `apply_patch` 统一实现以下常量值和调用：

```ts
protocol.registerSchemesAsPrivileged([{ scheme: "zupulse", privileges }]);
void window.loadURL("zupulse://app/index.html");
ipcMain.handle("zupulse:request", handler);
mainWindow.webContents.send("zupulse:event", event);
contextBridge.exposeInMainWorld("zupulseBridge", bridge);
```

`global.d.ts`、Renderer 和 E2E 只声明或访问 `zupulseBridge`，不保留 `tabViewerBridge` 别名。URL 来源校验只接受 `zupulse:`。

- [ ] **Step 4: 运行 Desktop 单测**

Run: `pnpm vitest run apps/desktop-shell/src/main/__tests__`

Expected: PASS。

- [ ] **Step 5: 提交运行时边界更名**

```bash
git add apps/desktop-shell/src apps/desktop-shell/e2e/desktop.spec.ts
git commit -m "refactor: rename desktop bridge and protocol"
```

### Task 3: 持久化名称、临时目录与产品文案

**Files:**

- Modify: `apps/web-demo/src/library/BrowserSheetLibraryRepository.ts`
- Modify: `apps/web-demo/src/main.ts`
- Modify: `apps/web-demo/src/__tests__/main.test.ts`
- Modify: `apps/web-demo/index.html`
- Modify: `apps/desktop-shell/index.html`
- Modify: `apps/desktop-shell/e2e/desktop.spec.ts`
- Modify: `apps/desktop-shell/scripts/verify-package.mjs`
- Modify: Desktop 测试中使用 `tab-viewer-*` 临时目录前缀的文件

**Interfaces:**

- Produces: IndexedDB 名称 `zupulse-library`
- Produces: 可见应用名称 `Zupulse`，中文辅助品牌“逐拍”

- [ ] **Step 1: 更新名称测试**

将 Demo 名称断言改为：

```ts
expect(DEMO_APP_NAME).toBe("Zupulse");
```

- [ ] **Step 2: 运行名称测试并确认失败**

Run: `pnpm vitest run apps/web-demo/src/__tests__/main.test.ts`

Expected: FAIL，实际值仍为 `Tab Viewer Demo`。

- [ ] **Step 3: 更新产品名和内部存储标识**

用 `apply_patch` 设置：

```ts
export const DEMO_APP_NAME = "Zupulse";
const DATABASE = "zupulse-library";
```

HTML title 使用 `Zupulse`；需要说明中文品牌的当前产品说明写作 `Zupulse 逐拍`。所有测试、诊断、打包校验和 E2E 临时目录前缀改为 `zupulse-*`，不读取旧数据库。

- [ ] **Step 4: 运行应用测试**

Run: `pnpm vitest run apps/web-demo apps/desktop-shell`

Expected: PASS。

- [ ] **Step 5: 提交存储和文案变更**

```bash
git add apps/web-demo apps/desktop-shell
git commit -m "refactor: adopt Zupulse runtime identity"
```

### Task 4: 当前文档与设计系统命名

**Files:**

- Modify: `AGENTS.md`
- Modify: `CONTEXT.md`
- Modify: `docs/architecture/implementation-foundation.md`
- Rename: `.design_library/tab-viewer-te-braun-theme/` → `.design_library/zupulse-te-braun-theme/`（只移动当前存在且受版本控制的文件）
- Modify: `.design_library/zupulse-te-braun-theme/README.md`
- Modify: `.design_library/zupulse-te-braun-theme/SKILL.md`
- Modify: `.design_library/zupulse-te-braun-theme/colors_and_type.css`
- Modify: `.design_library/zupulse-te-braun-theme/css.json`
- Modify: `.design_library/zupulse-te-braun-theme/library-consumption.json`
- Modify: `.design_library/zupulse-te-braun-theme/specs/component-semantics.json`
- Modify: `.design_library/zupulse-te-braun-theme/specs/component-semantics.md`

**Interfaces:**

- Produces: 设计 token 前缀 `--zupulse-*`，设计技能名 `zupulse-design`

- [ ] **Step 1: 更新当前维护文档**

使用 `apply_patch` 将当前上下文标题改为 `Zupulse agent context` 和 `# Zupulse 逐拍`，正文产品名统一为 `Zupulse`；架构包引用统一为 `@zupulse/*`。不修改 `docs/adr/**` 和既有 `docs/superpowers/plans/**`。

- [ ] **Step 2: 移动并更新设计系统**

仅移动当前工作树中实际存在的设计系统文件，保留用户已经删除的参考图片状态；随后将内容统一为：

```css
--zupulse-primary-500: #f26b4f;
--zupulse-neutral-500: #7a7a7a;
```

JSON、Markdown 与技能元数据中的库名使用 `zupulse-te-braun-theme`，技能名使用 `zupulse-design`。不调整任何色值或语义映射。

- [ ] **Step 3: 检查活动文件中的旧品牌残留**

Run:

```bash
rg -n -i --hidden \
  --glob '!node_modules' --glob '!dist' --glob '!.git/**' \
  --glob '!docs/adr/**' --glob '!docs/superpowers/plans/**' \
  --glob '!docs/superpowers/specs/**' --glob '!.design_library/.tmp/**' \
  --glob '!tab-viewer-studio-visual-exploration/**' \
  'tab[- ]viewer|tabviewer' .
```

Expected: 无输出；若仅命中明确保留的历史或用户未跟踪产物，将路径加入报告而不是修改。

- [ ] **Step 4: 提交当前文档和设计系统更名**

```bash
git add AGENTS.md CONTEXT.md docs/architecture/implementation-foundation.md .design_library/zupulse-te-braun-theme
git add -u .design_library/tab-viewer-te-braun-theme
git commit -m "docs: rebrand current project as Zupulse"
```

提交前确认没有暂存用户已删除的参考图片。

### Task 5: 全量验证

**Files:**

- Verify only: 全仓活动代码与配置

**Interfaces:**

- Consumes: Tasks 1–4 产生的全部 Zupulse 标识

- [ ] **Step 1: 运行全量类型与单测**

Run: `pnpm check`

Expected: PASS。

- [ ] **Step 2: 构建 Browser**

Run: `pnpm demo:build`

Expected: PASS，资源验证成功。

- [ ] **Step 3: 构建 Desktop**

Run: `pnpm desktop:build`

Expected: PASS，Electron main、preload、renderer 均成功产出。

- [ ] **Step 4: 运行格式检查**

Run: `pnpm format:check`

Expected: PASS；若失败，只格式化本计划修改的文件，未触及文件的历史格式债务记录在交付说明中。

- [ ] **Step 5: 检查最终差异**

Run: `git status --short && git diff --check HEAD~4..HEAD`

Expected: 无空白错误；既有用户删除和未跟踪文件仍保持原状态，未被提交。
