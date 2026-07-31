# Tailwind CSS 样式系统迁移任务

## Phase 0: Baseline and decision

- [x] Task 1: 记录 CSS、构建、产物、token 与视觉基线
- [x] Task 2: 新增 ADR 0065，并同步 ADR index、ADR 0039、architecture 与 DESIGN

### Checkpoint A: Architecture approved

- [x] 新决策只取代 ADR 0039 的 Tailwind defer clause
- [x] runtime tokens、Base UI、Tailwind 与专用 CSS 的所有权清楚
- [ ] 人工审阅并批准进入构建 PoC

## Phase 1: Build pipeline

- [x] Task 3: 验证 Rspack + Tailwind 单一 production pipeline
- [x] Task 6: 配置 Tailwind class formatting

### Checkpoint B: Build Go / No-Go

- [x] Browser build 通过
- [x] Desktop build 通过
- [x] iPad web assets build 通过
- [x] Preflight 未进入产物
- [x] CSS Modules、source maps、layer order 正常
- [x] build time 回退未超过未解释的 15%

## Phase 2: Tokens and governance

- [x] Task 4: 建立 semantic Tailwind theme projection
- [x] Task 4: 修复真实 undefined semantic token references
- [x] Task 5: 检查 undefined CSS variables
- [x] Task 5: 禁止 raw/default/arbitrary visual drift
- [x] Task 5: 验证 explicit source detection 与 static class maps

### Checkpoint C: Design-system guardrails

- [ ] semantic utility vocabulary 已冻结用于 pilot
- [x] light/dark computed styles 正确
- [x] CI 能拒绝违规 fixture
- [x] Base UI/runtime variable exceptions 使用窄 allowlist

## Phase 3: UI primitives

- [x] Task 7: `Button`
- [x] Task 7: `IconButton`
- [x] Task 8a: `Field` / `TextField` / `Select`
- [x] Task 8b: `Panel` / `Status`
- [x] Task 8b: `Toolbar`
- [x] Task 8c: Base UI `Overlay` primitives

### Checkpoint D: Primitive layer

- [ ] rest/hover/active/focus-visible/disabled states 通过
- [ ] loading/selected/error/open/closed states 按组件覆盖
- [x] keyboard、focus enter/restore 与 Escape 通过
- [ ] primitives 不读取 route/store/host/domain state

## Phase 4: Pilot slices

- [x] Task 9a: App Header / Toolbar
- [x] Task 9b: ContextPopup + Library Menu/Dialog
- [ ] Task 9c: Playback Transport + one practice/track section（目标：
      `features/playback-workspace/playback-transport.tsx` 与 `panels/`）
- [ ] Task 10: 运行 pilot metrics 与 Go/No-Go review

### Checkpoint E: Pilot review

- [ ] 三个切片没有双重 style ownership
- [ ] 被迁移组件的 CSS declarations 至少减少 25%
- [ ] JSX class 可读性通过人工审阅
- [ ] light/dark、desktop/narrow 视觉等价
- [ ] Browser/Desktop/iPad build 通过
- [ ] 相关 component test 与真实浏览器旅程通过
- [ ] 人工批准扩大迁移

## Phase 5: Incremental migration

- [ ] Task 11a: App shell 与 PageShell
- [ ] Task 11b: Sheet Library（目标：`features/sheet-library/components/`）
- [ ] Task 11c: Studio command/forms/status（目标：`features/harmony-studio/components/`）
- [ ] Task 11d: Harmony range list（目标：`features/harmony-studio/components/studio-workspace.tsx`）
- [ ] Task 11e: Playback Workspace 剩余 controls/loop/tracks（目标：
      `features/playback-workspace/components/`、`panels/` 与 `practice-drawer.tsx`）
- [ ] Task 11f: ScoreViewer chrome 中有净收益的部分
- [ ] 每 2–3 个 slice 运行 `pnpm verify:fast`
- [ ] 显式记录保留的专用 CSS 及理由

## Phase 6: Cleanup

- [ ] Task 12: 删除 orphan selectors、unused modules 与 canary
- [ ] Task 12: 比较迁移前后 CSS asset/build time/LOC/duplication
- [ ] Task 12: 更新 ADR、architecture 与 DESIGN
- [ ] 仅在 observable behavior 改变时更新 Feature Contracts
- [ ] `pnpm format:check`
- [ ] `git diff --check`
- [ ] `pnpm verify`
- [ ] 风险需要时运行 `pnpm verify:e2e`
- [ ] 将耐久约束移入 Current docs/checks 后删除本计划与 todo
