# HIK-5 P1：Library 与 Viewer 信息架构

## Goal

在不改变 Library / Playback 领域模型的前提下，把 Library 改为真实、紧凑的排练目录，并把
导入反馈和练习设置重组为符合用户任务优先级的界面。

## Non-goals

- 不实现 P2 遥测、A/B 或用户研究。
- 不增加卡片/列表切换、标签、文件夹、批量管理或云同步。
- 不改变 Library Score 身份、Viewer 路由、Loop / Track 命令或持久化格式。

## Canonical context

- `DESIGN.md`
- `docs/features/contracts/sheet-library.md`
- `docs/superpowers/specs/2026-07-26-library-viewer-ux-optimization-design.md`
- `docs/superpowers/specs/2026-07-26-library-viewer-p1-information-architecture-design.md`
- `packages/web-core/src/library/schemas.ts`
- `packages/web-viewer/src/features/SheetLibrary.tsx`
- `packages/web-viewer/src/features/PlaybackWorkspace.tsx`
- `apps/desktop-shell/src/main/main.ts`
- `apps/desktop-shell/src/main/library/DesktopLibraryStore.ts`

## Execution order

| Stage | Task                           | Size | Depends on | Deliverable                                         |
| ----- | ------------------------------ | ---- | ---------- | --------------------------------------------------- |
| 1     | P1-01 Desktop 练习摘要对齐     | M    | —          | Desktop `list()` 从当前 JsonStore 汇总真实 practice |
| 2     | P1-02 Library 紧凑排练目录行   | M    | P1-01      | 单列目录、真实继续/打开、390px 同 DOM 回流          |
| 3A    | P1-03 渐进式导入反馈           | S    | P1-02      | 单文件纯新增 4 秒收起，异常/批量保留                |
| 3B    | P1-04 练习设置任务化与中文清理 | L    | P1-02      | overview / loop / tracks 任务流与焦点模型           |
| 4     | P1-05 跨宿主验收与契约更新     | M    | P1-01…04   | Browser/Desktop 证据和 Current Contract             |

Stage 3A 与 3B 可以并行；其余严格按顺序。每个 Task 独立提交，并在相邻测试先红后绿。

## Scope

### P1-01 Desktop 练习摘要对齐

- 修改 `DesktopLibraryStore` 的依赖注入与 `list()` 汇总。
- 复用 Main 当前实际使用的校验型 sidecar / resume `JsonStore`，不读取未使用的 SQLite 表。
- 增加 sidecar-only、resume-only、两者齐全和缺失数据测试。
- 保持 Bridge schema、Renderer 隔离和 `exactOptionalPropertyTypes` 不变。

### P1-02 Library 紧凑排练目录行

- 将 `SheetLibrary` 卡片网格改为单列目录行。
- 仅在 `lastPosition` 存在时显示“继续练习”；小节号使用 `measureIndex + 1`。
- 无摘要时不再声称“尚未练习”；格式、时长和日期降为辅助信息。
- 保留 P0 的 sibling controls、管理菜单、No-results 和容器查询。

### P1-03 渐进式导入反馈

- 为单文件、完成、纯 `created` 结果增加 compact variant。
- 4 秒自动调用既有 `dismissImportSummary()`；测试使用 fake timers 并验证 cleanup。
- 运行中、批量、existing、failed、cancelled 保留完整且可展开的汇总。

### P1-04 练习设置任务化与中文清理

- 引入 drawer 内部 `overview | loop | tracks` 展示状态，不写入领域或 URL。
- 复用现有 dispatch command；Loop 快捷入口直接进入 loop task。
- 覆盖正常、disabled/loading、音频错误、返回、Escape 与焦点恢复。
- 删除中文重复 eyebrow，把 Loop / Tracks / Session 改为任务文案和紧凑摘要。

### P1-05 跨宿主验收与契约更新

- 跑组件、i18n、Browser E2E、Desktop build/E2E 与 `verify:fast`。
- 人工检查 Light / Dark、390 / 620 / 1280、键盘和发布前读屏门禁。
- 根据已验证行为更新 Sheet Library Current Feature Contract，删除已经关闭的 Desktop 摘要差距。

## Acceptance criteria

- [ ] Desktop 与 Browser 对已有 Resume / Loop 输出同语义 `LibraryPracticeSummary`。
- [ ] 1280px Library 默认是紧凑单列目录；390px 无水平溢出。
- [ ] “继续练习”只对应真实恢复位置，用户可见小节号一基化。
- [ ] P0 的打开、收藏、菜单、No-results 和键盘语义无回退。
- [ ] 单文件纯新增反馈自动收起，所有异常与批量结果保持可追溯。
- [ ] 练习抽屉首层按任务组织，Escape / 返回 / 焦点恢复稳定。
- [ ] 中文界面移除目标区域的重复英文装饰标题。
- [ ] Current Feature Contract 与最终代码和自动化证据一致。

## Verification

- 最小测试：
  - `pnpm vitest run apps/desktop-shell/src/main/library/__tests__/DesktopLibraryStore.test.ts`
  - `pnpm vitest run packages/web-viewer/src/features/__tests__/SheetLibrary.test.tsx`
  - `pnpm vitest run packages/web-viewer/src/features/__tests__/PlaybackWorkspace.test.tsx`
- 文案：`pnpm check:i18n`
- Browser：`pnpm demo:test:e2e`
- Desktop：`pnpm desktop:build && pnpm desktop:test:e2e`
- 完成门禁：`pnpm verify:fast`
- 提交前：`pnpm format:check && git diff --check`

## Open decisions

无阻塞决策。P1 使用以下默认结论：

- Desktop 摘要先对齐，再发布“继续练习”目录行。
- 不新增 practice availability schema；只根据真实可选字段决定文案。
- 不保留默认卡片视图，也不新增视图切换。
- P1 不引入遥测；效果验证留给 P2。
