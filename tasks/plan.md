# Implementation Plan: 受约束的 Tailwind CSS 样式系统与渐进迁移

## Overview

在不改变 Zupulse 产品视觉、交互行为和宿主边界的前提下，为 `packages/web-viewer` 引入 Tailwind CSS
作为受约束的 utility layer。`DESIGN.md`、`packages/web-viewer/src/styles/tokens.css` 和 Base UI
继续分别拥有产品设计契约、运行时语义 token 与可访问性交互行为；Tailwind 只负责把允许的语义
token 投影为可组合 utility，并逐组件替换重复的布局、间距、排版和状态 CSS。

迁移采用可回退的垂直切片。Tailwind 不接管 alphaTab 生成 DOM、运行时音乐可视化、复杂 splitter、
scrollbar、关键帧动画或必须依赖动态 CSS variables 的样式。完成标准不是删除全部 CSS Modules，
而是每个组件只有一个明确的样式所有者，公共控件通过基础组件复用，新增 UI 默认使用受治理的
Tailwind 语义 utility。

## Goals

- 建立 `Base UI behavior → Zupulse UI primitives → Tailwind semantic utilities → runtime tokens`
  的稳定分层。
- 减少 feature CSS 中重复的 layout、spacing、typography、control state 与 responsive rules。
- 让不符合 DESIGN 的颜色、圆角、阴影、间距和未定义 CSS variable 能在 CI 中被发现。
- 保持 Browser、Desktop 与 iPad 三个宿主共享同一份 React UI 和样式入口。
- 迁移期间保持每个提交可构建、可测试、可回退，不并行维护同一组件的两套样式所有权。

## Non-goals

- 不重设计 Library、Viewer 或 Studio 的信息架构和视觉语言。
- 不用 Tailwind 替换 Base UI，也不把业务 feature 直接耦合到第三方 component anatomy。
- 不强制把 alphaTab、Canvas/SVG、高频播放光标、splitter、scrollbar 或复杂动画改写为 utility。
- 不引入 shadcn/ui、完整视觉组件库、CSS-in-JS、Storybook 或第二套主题运行时。
- 不在迁移中修改 `web-core`、Bridge、Repository、播放领域状态或路由契约。
- 不以 CSS 行数归零为目标；保留专用 CSS 是目标架构的一部分。

## Sources of Truth

1. Runtime components, `packages/web-viewer/src/styles/tokens.css`, tests, builds and reproducible visual results.
2. `DESIGN.md`.
3. `.design_library/zupulse-te-braun-theme`.
4. Current feature contracts and current architecture documents.

Tailwind configuration MUST NOT become a competing product-theme source of truth.

## Target Architecture

```text
DESIGN.md + theme library
          │
          ▼
packages/web-viewer/src/styles/tokens.css
  semantic runtime variables + light/dark values
          │
          ▼
Tailwind theme projection
  semantic utilities only; no default product palette
          │
          ▼
packages/web-viewer/src/components/ui
  Button / IconButton / Field / Panel / Status / Overlay
          │
          ├── Base UI: behavior, ARIA, focus, portal, positioning
          └── Tailwind: layout, visual states, responsive composition
          │
          ▼
app / pages / features
```

专用 CSS 边界：

```text
styles/vendors/alphaTab.css
ScoreViewer complex score/runtime styles
Slider geometry when Base UI CSS variables are clearer
studio split workspace and pointer geometry
scrollbar, keyframes, host safe-area calculations
runtime music visualization and data-driven CSS variables
```

## Architecture Decisions

### 1. Introduce Tailwind through a dedicated global pipeline

- 优先验证 Tailwind v4 的 dedicated webpack loader 能否由当前 Rspack pipeline 正确执行。
- 若 Rspack 对 loader 的兼容性、CSS Modules 或 source maps 不满足要求，使用
  `postcss-loader + @tailwindcss/postcss` 作为明确 fallback。
- 只能选择一条生产 pipeline；不得长期同时保留两种集成方式。
- source detection 使用显式 base path / `@source`，只扫描 `packages/web-viewer/src` 及确有 utility
  class 的共享源码，避免 monorepo cwd 和 ignored workspace 导致构建漂移。

### 2. Disable Preflight

现有 `common.css` 已拥有 reset、button、input、focus 和共享 accessibility styles。生产入口只加载
Tailwind theme/utilities，不加载 Preflight，避免三个宿主发生全局视觉回归。

### 3. Keep runtime tokens authoritative

- `tokens.css` 保留 light/dark 语义值。
- Tailwind `@theme inline` 只为已批准 token 建立 utility aliases。
- 清空或不暴露 Tailwind 默认 color、font、radius、shadow 和 breakpoint namespaces。
- spacing、typography、control size 与 motion scale 先在运行时 token/设计契约中定义，再投影为
  Tailwind utility。
- dynamic Base UI variables、safe-area `env()` 与运行时坐标允许使用 CSS 或受说明的 arbitrary value；
  静态审美值不允许绕过 token。

建议的 utility vocabulary：

```text
bg-app / bg-surface / bg-surface-muted / bg-elevated / bg-control
text-foreground / text-muted / text-subtle / text-accent / text-danger
border-border / border-strong
rounded-control / rounded-panel / rounded-overlay
shadow-panel / shadow-overlay
font-ui / font-technical
```

名称表达语义职责，不暴露 `slate-*`、`indigo-*` 或原始 theme-library color scale。

### 4. Base UI remains the interaction layer

- Base UI owns keyboard navigation, ARIA, focus management, portal, collision handling and component state.
- UI primitives wrap Base UI parts and centralize Tailwind classes.
- Feature code consumes project primitives instead of repeating full Base UI anatomy when a primitive already exists.
- Base UI `data-*` attributes are the preferred state hooks.
- Base UI positioning inline styles and CSS variables MUST NOT be overridden by conflicting positioning/transform
  utilities.
- 使用 `render` callback 时通过 Base UI `mergeProps` 保留 event handlers、className 与 style。

### 5. CSS Modules and Tailwind have explicit ownership

- 一个组件迁移前由其 CSS Module 拥有样式；迁移完成后删除已被 utility 替代的 selectors。
- 同一 property/state 不在 CSS Module 与 Tailwind class 中重复声明。
- 不在 CSS Modules 中大量使用 `@apply`；module 直接消费 runtime CSS variables。
- 公共 visual primitive 进入 `components/ui`，业务布局留在 feature。

### 6. Governance is enforced in code

扩展 `check:design` 或增加同一入口下的检查：

- 所有非动态 `var(--*)` 引用必须有定义或显式 allowlist。
- 非 token/vendor 文件禁止 raw hex、rgb/hsl/oklch product colors。
- JSX/TSX 禁止默认 palette、未批准 radius/shadow/font utilities。
- 禁止 Tailwind arbitrary color；静态 arbitrary spacing/radius/shadow 默认禁止。
- 动态 class 只能通过完整静态字符串映射表达，避免 Tailwind scanner 无法发现的拼接。
- DESIGN 允许的 exception 必须以小而明确的 allowlist 记录，不能使用宽泛目录豁免。

使用 `prettier-plugin-tailwindcss` 统一 utility 顺序。初期不引入 `class-variance-authority`；
variant 使用 typed static maps。只有基础组件确实需要 consumer override 冲突解析时，才评估
`tailwind-merge`。

## Migration Strategy

### Phase 0: Baseline and decision record

记录迁移前基线：

- CSS file count、LOC、重复 declaration、raw values 与 undefined token references。
- Browser/Desktop/iPad production build time 和主要 CSS asset size。
- Library、Viewer、Studio 在 light/dark、desktop/narrow 的可重复截图。
- keyboard focus、disabled、selected、loading、empty、error 等现有状态证据。

新增 ADR `0065-use-constrained-tailwind-utilities-for-shared-viewer-ui.md`，只取代 ADR 0039 中
“暂不引入 Tailwind”的样式决策，不取代 React、Base UI、Router、Zustand 或应用生命周期决策。
同步 `docs/adr/README.md`、`docs/architecture/react-application-system.md` 和 `DESIGN.md`。

### Phase 1: Build integration spike

只建立编译链和一个无视觉影响的 fixture/canary，不迁移产品页面。

验证：

- development 与 production source maps/CSS Modules 正常。
- Tailwind utility 在 Browser、Desktop、iPad 均生成且无重复。
- 未加载 Preflight。
- production source detection 不依赖调用命令的 cwd。
- alphaTab vendor CSS cascade 与已有 CSS layer 顺序不变。

#### Go / No-Go checkpoint

满足下列条件才继续：

- `pnpm demo:build`、`pnpm desktop:build`、`pnpm ipad:web:build` 全部通过。
- CSS Modules class hashing 与现有测试不变。
- light/dark 与现有页面截图无非预期差异。
- 增量构建和 production build 无不可接受回退；以基线为准，超过 15% 必须解释并重新选择 pipeline。

失败时移除 Tailwind spike，保留 token/check 改进计划，不进入页面迁移。

### Phase 2: Token projection and guardrails

先修复当前 undefined semantic tokens，再建立 Tailwind theme projection。补齐 DESIGN 已声明但运行时
未系统化的 spacing、typography、control size 与 motion tokens。扩展 `check:design` 并新增测试，
保证默认 palette 和 arbitrary aesthetic values 无法静默进入。

此阶段不应改变产品视觉；token 替换必须 value-equivalent。

### Phase 3: UI primitives

按真实复用顺序实现或收拢：

1. `Button` 与 `IconButton`
2. `Field` / `TextField` / `Select` shared visual contract
3. `Panel` / `Toolbar` / `Status`
4. `Overlay` primitives around Base UI Popover/Menu/Dialog

每个 primitive 覆盖 rest、hover、active、focus-visible、disabled；适用时覆盖 loading、selected、
open/closed、starting/ending style 和 error。组件只接受展示 props，不读取 Host、store、route 或
领域 controller。

### Phase 4: Representative vertical slices

依次迁移三个高代表性切片：

1. **App Header / Toolbar**：验证普通布局、Button、Popover、responsive 和 light/dark。
2. **ContextPopup + Library Menu/Dialog**：验证 Base UI portal、positioner、focus restore、
   highlighted/disabled/danger states 与 overlay tokens。
3. **Playback Transport + one practice/track section**：验证高密度工作台、container query、
   selected/playing/muted/disabled 和动态 CSS variable 边界。

每个切片单独提交；组件迁移完成时删除该组件已失去所有权的 CSS selectors。

#### Pilot review checkpoint

- 三个切片无 DESIGN、accessibility 或行为回归。
- 被迁移组件的自有 CSS declarations 减少至少 25%，且 JSX class 可读性可接受。
- 没有新增 raw product color、undefined token 或 arbitrary aesthetic value。
- Browser/Desktop/iPad 构建通过；相关 component tests 与至少一个真实浏览器旅程通过。
- 团队确认 primitive API 与 utility vocabulary 后才扩大迁移。

### Phase 5: Incremental application migration

按风险从低到高：

1. App shell 与 PageShell 共享布局。
2. Sheet Library controls、rows、empty/error/dialog states。
3. Studio command bar、forms、status、harmony range list。
4. Playback Workspace 中剩余 controls、loop 和 track sections。
5. ScoreViewer chrome 中适合 utility 的部分。

Score surface、alphaTab DOM、splitter geometry、Slider geometry、scrollbar 和复杂 animation 在每次迁移时
重新判断；没有净收益就保留 CSS Module。

### Phase 6: Cleanup and operating model

- 删除 orphan selectors、未使用 CSS Modules 和临时 canary。
- 生成最终 CSS ownership map，记录保留专用 CSS 的原因。
- 比较迁移前后 CSS asset、build time、CSS LOC 和重复规则。
- 更新 ADR、architecture、DESIGN maintenance boundary。
- 只有 observable feature behavior 发生变化时才更新 Feature Contract；纯视觉等价迁移不机械修改。
- 删除完成的 `tasks/plan.md` 和 `tasks/todo.md`，把耐久约束保留在 Current ADR、architecture、
  `DESIGN.md` 与自动化门禁中。

## Task Breakdown

### Task 1: Capture the style-system baseline

**Description:** 建立可重复的迁移前性能、产物、代码规模与视觉基线，并分类当前 undefined CSS
variables 为 defect、Base UI runtime variable 或 component-local variable。

**Acceptance criteria:**

- [ ] 基线包含 CSS LOC/asset size、三宿主 build time 和代表性视觉状态。
- [ ] 所有 undefined variable 都被分类；真实 defect 有后续修复任务。
- [ ] 基线命令和输出位置可重复使用。

**Verification:**

- [ ] `pnpm check:design`
- [ ] `pnpm vitest run packages/web-viewer/src/__tests__/styles.test.ts`
- [ ] Browser/Desktop/iPad 当前 build 成功。

**Dependencies:** None

**Files likely touched:**

- `tasks/`
- optional baseline artifact under an existing ignored artifacts directory

**Estimated scope:** S

### Task 2: Record the Tailwind architecture decision

**Description:** 新增 ADR 0065，局部取代 ADR 0039 的 Tailwind defer decision，并更新当前架构和
DESIGN maintenance boundary。

**Acceptance criteria:**

- [ ] ADR 明确 source of truth、Preflight、Base UI、CSS Modules 与专用 CSS 边界。
- [ ] ADR index 与 0039 的局部 supersession 关系无歧义。
- [ ] DESIGN 明确 Tailwind 不是产品主题事实源。

**Verification:**

- [ ] `pnpm check:context`
- [ ] `pnpm check:arch`
- [ ] `pnpm check:design`
- [ ] `pnpm check:docs`

**Dependencies:** Task 1

**Files likely touched:**

- `docs/adr/0065-use-constrained-tailwind-utilities-for-shared-viewer-ui.md`
- `docs/adr/README.md`
- `docs/adr/0039-use-react-for-shared-viewer-application-shell.md`
- `docs/architecture/react-application-system.md`
- `DESIGN.md`

**Estimated scope:** M

### Task 3: Prove the Rspack/Tailwind pipeline

**Description:** 安装 Tailwind 与单一候选 loader，显式配置 source detection，在不迁移产品组件的
情况下证明三个宿主均可编译。

**Acceptance criteria:**

- [ ] production pipeline 只使用一种 Tailwind integration。
- [ ] Preflight 不进入产物；CSS Modules 和 layer order 保持。
- [ ] source detection 对 monorepo cwd 稳定。

**Verification:**

- [ ] `pnpm demo:build`
- [ ] `pnpm desktop:build`
- [ ] `pnpm ipad:web:build`
- [ ] 比较 baseline build time/CSS asset。

**Dependencies:** Task 2

**Files likely touched:**

- `package.json`
- `pnpm-lock.yaml`
- `packages/web-viewer/package.json`
- `tools/builder/rspack.mjs`
- `packages/web-viewer/src/styles.css`

**Estimated scope:** M

### Task 4: Create the semantic Tailwind theme projection

**Description:** 从 runtime tokens 建立 Tailwind `@theme inline` 投影，清空默认视觉 namespace，并
修复当前真实 token drift。

**Acceptance criteria:**

- [ ] Tailwind utilities 只暴露批准的 semantic visual tokens。
- [ ] light/dark 继续由 `:root[data-theme]` 切换，无重复主题状态。
- [ ] 当前真实 undefined semantic token references 清零。

**Verification:**

- [ ] token projection unit/source test。
- [ ] `pnpm check:design`
- [ ] light/dark computed-style smoke test。

**Dependencies:** Task 3

**Files likely touched:**

- `packages/web-viewer/src/styles/tokens.css`
- `packages/web-viewer/src/styles/tailwind-theme.css`
- `.design_library/zupulse-te-braun-theme/runtime-token-map.json`
- `packages/web-viewer/src/__tests__/styles.test.ts`

**Estimated scope:** M

### Task 5: Strengthen design-system checks

**Description:** 让 CI 检查 undefined variables、raw product colors、禁止的 Tailwind visual
utilities、arbitrary aesthetic values 与动态 class 拼接。

**Acceptance criteria:**

- [ ] 已知违规 fixture 产生稳定、可定位的错误。
- [ ] Base UI runtime variables 和 host-safe dynamic values 使用窄 allowlist。
- [ ] 正常 runtime CSS、vendor CSS 与合法 semantic classes 通过。

**Verification:**

- [ ] `pnpm vitest run scripts/__tests__/repositoryChecks.test.ts`
- [ ] `pnpm check:design`

**Dependencies:** Task 4

**Files likely touched:**

- `scripts/repository-checks.mjs`
- `scripts/__tests__/repositoryChecks.test.ts`
- `package.json`

**Estimated scope:** M

### Task 6: Add Tailwind class formatting

**Description:** 配置 Tailwind Prettier plugin，统一 static class ordering，不进行无关全仓格式化。

**Acceptance criteria:**

- [ ] 新增 Tailwind classes 由项目现有 `format:check` 稳定排序。
- [ ] CSS Module className 和 Base UI function className 不被破坏。
- [ ] 没有为 class composition 提前引入不必要 runtime dependency。

**Verification:**

- [ ] `pnpm format:check`
- [ ] formatter fixture/idempotence check。

**Dependencies:** Task 3

**Files likely touched:**

- `package.json`
- `pnpm-lock.yaml`
- Prettier configuration file

**Estimated scope:** S

### Task 7: Introduce Button and IconButton primitives

**Description:** 用 semantic Tailwind classes 封装原生 button visual contract，统一 size、tone、
focus、disabled、loading 和 pressed states。

**Acceptance criteria:**

- [ ] primary/secondary/ghost/danger 与 icon-only variants 符合 DESIGN hierarchy。
- [ ] accessible name、disabled、focus-visible、pressed/loading states 有用户视角测试。
- [ ] primitive 不读取 route/store/host/domain state。

**Verification:**

- [ ] `pnpm vitest run packages/web-viewer/src/components/ui`
- [ ] light/dark component visual check。

**Dependencies:** Tasks 4, 5, 6

**Files likely touched:**

- `packages/web-viewer/src/components/ui/button.tsx`
- `packages/web-viewer/src/components/ui/icon-button.tsx`
- `packages/web-viewer/src/components/ui/__tests__/button.test.tsx`
- `packages/web-viewer/src/components/ui/__tests__/icon-button.test.tsx`

**Estimated scope:** M

### Task 8: Introduce Field, Panel, Status and Overlay primitives

**Description:** 分成独立小提交收拢表单视觉、连续工作台容器、状态表达，以及 Base UI
Popover/Menu/Dialog 的共享 visual shell。

**Acceptance criteria:**

- [ ] 每个 primitive 只表达通用展示与交互 contract。
- [ ] Overlay 覆盖 focus enter/restore、Escape、overflow、starting/ending styles。
- [ ] Panel 不把所有区域重新包装成卡片。

**Verification:**

- [ ] 各 primitive 的最小 component test。
- [ ] keyboard-only overlay journey。
- [ ] `pnpm check:design`

**Dependencies:** Task 7

**Files likely touched:** 每个小提交限制在对应 primitive、test 与必要 token，单次不超过 5 个文件。

**Estimated scope:** 分解为 3–4 个 S/M tasks

### Task 9: Migrate the three pilot slices

**Description:** 依次迁移 App Header、ContextPopup/Library overlay、Playback Transport 的代表性
部分，每个切片独立完成、验证和删除旧 selector。

**Acceptance criteria:**

- [ ] 每个组件只有一个 style owner。
- [ ] 三个切片覆盖普通布局、Base UI overlay 与高密度 responsive workspace。
- [ ] pilot metrics 满足 review checkpoint。

**Verification:**

- [ ] 对应 component tests。
- [ ] Browser real-browser journey。
- [ ] Browser/Desktop/iPad build。
- [ ] light/dark、desktop/narrow screenshot comparison。

**Dependencies:** Task 8

**Files likely touched:** 每个切片单独估算并限制在 3–5 个源文件/测试文件。

**Estimated scope:** 分解为 3 个 M tasks

### Task 10: Run the pilot decision gate

**Description:** 用基线数据评估净复杂度、构建成本、视觉一致性和 JSX 可读性，决定继续、调整或
停止扩大迁移。

**Acceptance criteria:**

- [ ] 结论基于记录的 metrics 和可重复视觉证据。
- [ ] 不满足门槛时记录原因并停止页面扩迁。
- [ ] 满足门槛时冻结 utility vocabulary 和 primitive API v1。

**Verification:**

- [ ] `pnpm verify:fast`
- [ ] `pnpm demo:build`
- [ ] `pnpm desktop:build`
- [ ] `pnpm ipad:web:build`

**Dependencies:** Task 9

**Files likely touched:**

- `tasks/`
- ADR/architecture only if the pilot changes the agreed boundary

**Estimated scope:** S

### Task 11: Migrate remaining application slices

**Description:** 按 Phase 5 顺序逐组件迁移；每个任务只处理一个垂直 UI slice，并在同一任务删除
失去所有权的 selectors。

**Acceptance criteria:**

- [ ] 每个 slice 保持 observable behavior 与 DESIGN contract。
- [ ] 专用 CSS 的保留是显式选择，不是未完成状态。
- [ ] 没有长期双重 style ownership。

**Verification:**

- [ ] 最小相关 tests。
- [ ] 每 2–3 个 slice 运行一次 `pnpm verify:fast`。
- [ ] 高风险 Viewer/Studio slice 运行对应 E2E 和 visual checks。

**Dependencies:** Task 10 Go decision

**Files likely touched:** 每个 slice 3–5 个文件；禁止创建单个 XL migration task。

**Estimated scope:** 多个 M tasks

### Task 12: Cleanup and finalize the operating model

**Description:** 删除 orphan styles/canary，记录专用 CSS ownership，更新耐久文档并执行完整门禁。

**Acceptance criteria:**

- [ ] 无 unused migrated selectors、临时 canary 或双重 pipeline。
- [ ] Current ADR、architecture、DESIGN 与运行时实现一致。
- [ ] 迁移前后指标和保留 CSS 理由可追溯。

**Verification:**

- [ ] `pnpm format:check`
- [ ] `git diff --check`
- [ ] `pnpm verify`
- [ ] 风险需要时运行 `pnpm verify:e2e`

**Dependencies:** Task 11

**Files likely touched:**

- style entry and remaining modules
- `docs/adr/`
- `docs/architecture/react-application-system.md`
- `DESIGN.md`
- affected Feature Contracts only when observable behavior changed

**Estimated scope:** M

## Checkpoints

### Checkpoint A: Architecture and build spike

- [ ] ADR reviewed.
- [ ] One Tailwind pipeline selected.
- [ ] Three host builds pass.
- [ ] No Preflight or visual regression.
- [ ] Build-cost gate passes.

### Checkpoint B: Tokens and governance

- [ ] Semantic utility vocabulary frozen for pilot.
- [ ] Undefined semantic variables are zero.
- [ ] CI rejects raw/default/arbitrary visual drift.
- [ ] Light/dark token projection verified.

### Checkpoint C: Primitive layer

- [ ] Base UI behavior and Tailwind visuals have clear ownership.
- [ ] Button/Field/Panel/Status/Overlay states are covered.
- [ ] Feature code can consume primitives without third-party anatomy leakage.

### Checkpoint D: Pilot Go / No-Go

- [ ] Three representative slices complete.
- [ ] CSS declaration reduction target met.
- [ ] JSX remains readable.
- [ ] Visual, accessibility and three-host builds pass.
- [ ] Human review approves wider migration.

### Checkpoint E: Complete

- [ ] Remaining migration is intentionally complete, including documented retained CSS.
- [ ] Full verification passes.
- [ ] Durable constraints moved into Current docs and checks.
- [ ] One-time plan/task records removed.

## Risks and Mitigations

| Risk                                          | Impact | Mitigation                                                                                          |
| --------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| Rspack loader incompatibility                 | High   | Phase 1 fail-fast spike; one documented PostCSS fallback; no page migration before gate             |
| Preflight changes global controls             | High   | Do not import Preflight; assert compiled output and screenshot baseline                             |
| Default Tailwind theme violates DESIGN        | High   | Clear visual namespaces; semantic aliases only; CI rejects default palette/radius/shadow            |
| CSS Modules and utilities fight cascade       | High   | One style owner per property/state; migrate by component; delete selectors in same slice            |
| Base UI positioner is overridden              | High   | Reserve positioning/transform ownership for Base UI; test portal/collision/animation states         |
| JSX class strings become unreadable           | Medium | UI primitives, typed variant maps, Prettier ordering; pilot readability gate                        |
| Dynamic classes are not generated             | Medium | Static complete class maps; explicit source paths; CI fixture for production builds                 |
| Theme breaks in portals                       | Medium | Keep theme variables on `:root[data-theme]`; portal light/dark tests                                |
| Build time or CSS asset regresses             | Medium | Baseline metrics and 15% investigation threshold                                                    |
| Migration becomes a visual redesign           | High   | Value-equivalent token changes; screenshot comparison; separate any redesign into another task      |
| Migration never finishes                      | Medium | Vertical slices, 2–3 task checkpoints, explicit retained-CSS ownership map                          |
| Utility framework becomes new source of truth | High   | ADR/DESIGN state runtime token authority; theme projection contains aliases, not independent values |

## Open Decisions

These are decision gates, not prerequisites for starting Task 1:

1. Does `@tailwindcss/webpack` behave correctly under the repository's Rspack version? Phase 1 decides.
2. Which exact static sizing exceptions belong in tokens versus specialized CSS? Phase 2 classifies from real use.
3. Does consumer `className` override require conflict-aware merging? Add `tailwind-merge` only after a primitive proves
   the need.
4. After the three pilot slices, does the measured reduction justify migrating Studio and Playback wholesale?
   Checkpoint D decides.
