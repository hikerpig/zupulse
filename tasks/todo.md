# P0 Task List: Library 与 Viewer 核心可用性

**Status:** Completed on 2026-07-26. The checklists below remain as the acceptance record; verified command evidence
is summarized in `tasks/plan.md` and PR #7.

## Task 1: 分离 Library Score 主动作与管理动作

**Description:** 保留当前卡片视觉，移除 `li[role="button"]`，建立独立打开按钮、收藏按钮和管理
Menu。Menu 承载导出、编辑和删除，并保持现有应用服务调用。

**Acceptance criteria:**

- [ ] `<li>` 不可聚焦且没有 click / key handlers。
- [ ] 每份曲谱只有一个“打开 {title}”主动作和一个“删除 {title}”动作。
- [ ] 收藏、Menu 与打开动作互为同级；Menu 支持方向键、Escape 和焦点恢复。

**Verification:**

- [ ] `pnpm vitest run packages/web-viewer/src/features/__tests__/SheetLibrary.test.tsx`
- [ ] 键盘 Tab → Enter / Space 可打开曲谱、收藏和操作 Menu。

**Dependencies:** None

**Files likely touched:**

- `packages/web-viewer/src/features/SheetLibrary.tsx`
- `packages/web-viewer/src/features/SheetLibrary.module.css`
- `packages/web-viewer/src/features/__tests__/SheetLibrary.test.tsx`
- `packages/app-i18n/src/locales/zh-CN.ts`
- `packages/app-i18n/src/locales/en-US.ts`

**Estimated scope:** Medium

## Task 2: 增加可恢复的 No-results 状态

**Description:** 显式区分空馆藏、搜索无结果和收藏无结果，并提供清除搜索或清除全部筛选动作。

**Acceptance criteria:**

- [ ] 空馆藏仍显示“导入第一份曲谱”。
- [ ] 已有馆藏的 No-results 显示条件、`0 / N` 上下文和恢复动作，不显示导入空态。
- [ ] 清除全部筛选不重置排序。

**Verification:**

- [ ] `pnpm vitest run packages/web-viewer/src/features/__tests__/SheetLibrary.test.tsx`
- [ ] `pnpm check:i18n`

**Dependencies:** None

**Files likely touched:**

- `packages/web-viewer/src/features/SheetLibrary.tsx`
- `packages/web-viewer/src/features/__tests__/SheetLibrary.test.tsx`
- `packages/app-i18n/src/locales/zh-CN.ts`
- `packages/app-i18n/src/locales/en-US.ts`

**Estimated scope:** Medium

## Task 3: 修复 Library 窄屏布局

**Description:** 使用 Library 局部 container-query 规则把 context actions 和 filters 重排为两行，
保证 390px 可导入、搜索、筛选和排序。

**Acceptance criteria:**

- [ ] 390px、620px、640px 无页面级水平溢出。
- [ ] 导入按钮不出现竖排文字；搜索独占一行；收藏和排序完整可见。
- [ ] 1280px 布局不回归。

**Verification:**

- [ ] `pnpm demo:build`
- [ ] Browser bounding-box 检查覆盖顶部、筛选区和 Score actions。

**Dependencies:** Task 1

**Files likely touched:**

- `packages/web-viewer/src/features/SheetLibrary.module.css`
- `apps/web-demo/e2e/library.spec.ts`

**Estimated scope:** Small

## Checkpoint A: Library

- [ ] Tasks 1–3 的最小测试通过。
- [ ] 390×844 可完成搜索 → 清除 → 打开 Score。
- [ ] Accessibility tree 不再合并主动作与管理动作。

## Task 4: 调整 Viewer 顶部主次层级

**Description:** Library-backed Viewer 移除页内导入按钮；standalone Viewer 保留打开文件。窄屏
和弦分析使用紧凑入口并保留 accessible name。

**Acceptance criteria:**

- [ ] Library-backed Viewer 不显示“导入曲谱”。
- [ ] standalone Viewer 仍显示“打开乐谱”并调用现有 application service。
- [ ] 390px 标题、状态与和弦入口不产生水平溢出。

**Verification:**

- [ ] `pnpm vitest run packages/web-viewer/src/app/__tests__/App.test.tsx`
- [ ] `pnpm demo:build`

**Dependencies:** None

**Files likely touched:**

- `packages/web-viewer/src/app/pages/ViewerPage.tsx`
- `packages/web-viewer/src/app/pages/PageShell.module.css`
- `packages/web-viewer/src/app/__tests__/App.test.tsx`

**Estimated scope:** Medium

## Task 5: 建立窄屏 Transport 优先级与练习面板焦点

**Description:** 抽取 enabled / disabled Transport 的共同展示结构；窄屏隐藏常驻 BPM，将速度和
retry 放到练习面板，保留播放、停止、Loop、时间、状态和设置。

**Acceptance criteria:**

- [ ] 390px ready / disabled / audio error 三种状态的核心控件均完整可见。
- [ ] 窄屏从练习面板可修改速度，仍发送现有 `set-score-speed` command。
- [ ] 面板打开聚焦关闭按钮，Escape 关闭并恢复设置触发器焦点。

**Verification:**

- [ ] `pnpm vitest run packages/web-viewer/src/features/__tests__/PlaybackWorkspace.test.tsx`
- [ ] Browser 键盘与 bounding-box 检查。

**Dependencies:** Task 4

**Files likely touched:**

- `packages/web-viewer/src/features/PlaybackWorkspace.tsx`
- `packages/web-viewer/src/features/PlaybackWorkspace.module.css`
- `packages/web-viewer/src/features/__tests__/PlaybackWorkspace.test.tsx`

**Estimated scope:** Medium

## Task 6: 将窄屏谱面缩放收进 Popover

**Description:** 宽屏保留三个直接缩放控件；窄屏显示一个 Popover trigger，内部复用减小、百分比和
放大动作。

**Acceptance criteria:**

- [ ] 390px 只有一个常驻 Zoom trigger，Popover 完整位于视口内。
- [ ] 按钮与 pinch 都继续提交同一个 zoom commit 事件。
- [ ] Popover 支持键盘、Escape 和焦点恢复。

**Verification:**

- [ ] `pnpm vitest run packages/web-viewer/src/components/__tests__/ScoreViewer.test.tsx`
- [ ] Browser 检查最小/最大 zoom 和 390px Popover。

**Dependencies:** None

**Files likely touched:**

- `packages/web-viewer/src/components/ScoreViewer.tsx`
- `packages/web-viewer/src/components/ScoreViewer.module.css`
- `packages/web-viewer/src/components/__tests__/ScoreViewer.test.tsx`

**Estimated scope:** Medium

## Checkpoint B: Viewer

- [ ] Tasks 4–6 的最小测试通过。
- [ ] 390×844 可完成播放/暂停 → 打开设置 → 调整速度 → 打开 Zoom。
- [ ] enabled / disabled / error Transport 无裁切。

## Task 7: 增加真实 Browser 响应式旅程

**Description:** 使用 `Treasure.gp5` 把 Library 与 Viewer P0 串成真实 Playwright 旅程，并在四类
宽度验证无水平溢出和关键控件边界。

**Acceptance criteria:**

- [ ] 390×844、620px、640px、1280×720 均满足 `scrollWidth <= clientWidth`。
- [ ] 390px 完成搜索、恢复、打开、播放、设置和速度调整。
- [ ] 关键控件 bounding box 在视口内，控制台无 error。

**Verification:**

- [ ] `pnpm demo:test:e2e`

**Dependencies:** Tasks 2, 3, 5, 6

**Files likely touched:**

- `apps/web-demo/e2e/library.spec.ts`

**Estimated scope:** Small

## Task 8: 共享宿主验证与当前文档收口

**Description:** 完成全量门禁和 Desktop smoke；只有行为证据成立后，更新 Sheet Library Feature
Contract 的当前行为、已知差距和 evidence map。

**Acceptance criteria:**

- [ ] 快速门禁、Browser build / E2E、Desktop build / smoke 通过。
- [ ] Feature Contract 描述已验证行为，不把 P1/P2 目标写成当前事实。
- [ ] 文档 impact、format 与 diff checks 通过。

**Verification:**

- [ ] `pnpm verify:fast`
- [ ] `pnpm demo:build`
- [ ] `pnpm demo:test:e2e`
- [ ] `pnpm desktop:build`
- [ ] `pnpm desktop:test:e2e`
- [ ] `pnpm docs:impact`
- [ ] `pnpm format:check`
- [ ] `git diff --check`

**Dependencies:** Task 7

**Files likely touched:**

- `docs/features/contracts/sheet-library.md`
- `docs/architecture/viewer-keyboard-and-transport-controls.md`
- `docs/superpowers/specs/2026-07-26-library-viewer-ux-optimization-design.md`

**Estimated scope:** Small

## Checkpoint C: Ready for Review

- [ ] 所有 P0 success criteria 已满足。
- [ ] 没有 Repository / Bridge / playback schema 变化。
- [ ] 没有引入依赖或第二套宿主 UI。
- [ ] PR 包含测试证据和 390px / 1280px 视觉证据。
