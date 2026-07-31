# Implementation Plan: web-viewer 大型 TSX 组件拆分

## Overview

本计划在不改变 Library、Viewer、Studio 现有用户行为、领域语义和视觉结果的前提下，拆分
`PlaybackWorkspace.tsx`、`StudioPage.tsx` 与 `SheetLibrary.tsx`。拆分同时解决两类问题：

1. 以 route、feature、presentation component 和 runtime adapter 建立稳定职责边界，降低单文件修改
   的回归范围。
2. 把 React 订阅与 memoization 放到真正消费状态的子树，并通过 route lazy loading 建立真实的
   bundle 边界；不把“移动代码到更多文件”误当作性能优化。

这是一次 behavior-preserving refactor。播放命令、Practice Sidecar、Library Repository、Harmony
Analysis Document、Bridge、alphaTab runtime、i18n 文案和 CSS 视觉规则均不在本计划中重新设计。

## Scope

### In scope

- 拆分 `packages/web-viewer/src/features/PlaybackWorkspace.tsx`。
- 拆分 `packages/web-viewer/src/app/pages/StudioPage.tsx`。
- 拆分 `packages/web-viewer/src/features/SheetLibrary.tsx`。
- 将三者的测试按用户行为和职责边界拆分。
- 下沉 React external-store 订阅，避免无关 snapshot 更新扩大渲染范围。
- 为 Library、Viewer、Studio route 建立可验证的 lazy chunk。
- 迁移直接读取旧 TSX 文件源码的结构性测试，使其指向新的样式所有者。

### Out of scope

- 不修改 `PlaybackController`、Loop、Count-in、Piano Hand、Track Mixer 或持久化语义。
- 不修改 Library 导入、去重、删除、导出和 metadata 的领域契约。
- 不修改 Harmony analysis、Correction、CAS、preview runtime 或 MusicXML 导出语义。
- 不引入新的全局状态库、虚拟列表库或 `use-sync-external-store` 依赖。
- 不在结构拆分中迁移 Tailwind、重写 CSS declarations 或重设计页面。
- 不以统一行数上限机械拆分仍然内聚的 leaf component。

## Sources of Truth

1. Runtime code、Zod schemas、Repository constraints。
2. 当前测试、build 与 E2E。
3. Current Feature Contracts：
   - `docs/features/contracts/viewer-playback-navigation.md`
   - `docs/features/contracts/sheet-library.md`
   - `docs/features/contracts/harmony-analysis.md`
4. `docs/architecture/react-application-system.md`
5. `DESIGN.md`

## Sequencing with the active Tailwind plan

现有 `tasks/plan.md` / `tasks/todo.md` 正在执行 Tailwind 迁移，并且以下未完成任务与本计划重叠：

- Task 9c：Playback Transport。
- Task 11b：Sheet Library。
- Task 11c / 11d：Studio command 与 Harmony range。
- Task 11e：Playback Workspace 剩余区域。

执行顺序必须是：

1. 保留已经完成的 Tailwind primitive 和 guardrail 工作。
2. 暂停上述尚未开始或尚未完成的重叠 slice。
3. 先完成本结构拆分并通过 behavior-preserving verification。
4. 再把 Tailwind slice 的目标路径更新到新组件，继续样式迁移。

不得在同一个提交中同时进行组件搬迁和大规模样式迁移，否则视觉回归、行为回归和 selector 回归无法
独立定位。

## Architecture Decisions

### 1. 保留薄兼容入口，内部按 feature folder 组织

旧入口先保留为薄 re-export，避免一次性修改 package 内全部 import 和潜在 workspace consumer：

```text
features/PlaybackWorkspace.tsx  -> re-export ./playback-workspace/playback-workspace
features/SheetLibrary.tsx       -> re-export ./sheet-library/sheet-library
app/pages/StudioPage.tsx        -> 保留 route component，内部组合 harmony-studio feature
```

兼容入口不得继续持有 JSX、状态或业务 helper。确认 repo 内没有外部 consumer 后，可在独立 cleanup
中移除 `index.ts` 对 `SheetLibrary` 的非必要公共导出。

新文件和新目录遵循 `docs/conventions/file-naming.md`：source module 与目录使用 `kebab-case`。现有
PascalCase 兼容入口不在结构迁移提交中顺手改名；需要移除或重命名时使用独立 mechanical commit。

### 2. Feature 目录按职责组织，不按语法建立 catch-all 目录

`features/<feature>/` 使用“flat by default，达到复杂度后按职责分组”的结构：

```text
features/<feature>/
  index.ts                         # 可选；只导出 feature public surface
  <feature>.tsx                    # connected composition entry
  <connected-part>.tsx             # 少量状态连接型 orchestration
  components/                      # props-only 或局部 UI state 的 leaf components
  adapters/                        # React 到 application/session/browser port 的适配
  model/                           # 纯 types、selector、projection、view model
  runtime/                         # 非 React 的命令式 scheduler / DOM runtime
  <semantic-cluster>/              # panels 等具有产品语义的内部子域
  __tests__/                       # 按行为边界测试
  <feature>.module.css             # feature-level 样式 owner；不机械一组件一文件
```

目录只在确有内容时创建，不生成空的 `components/`、`adapters/`、`model/` 或 `runtime/`：

- feature 总体不超过约 8 个 source files 且职责清楚时保持扁平。
- 同一职责出现至少 2 个文件，或单个文件代表重要架构边界时，建立对应目录。
- `components/` 只收纳 presentation leaf；读取 application/session external store 的 connected
  component 留在 feature root 或产品语义子目录。
- `panels/` 等目录表达用户任务集，不使用 `misc/`、`common/`、`shared/`。

明确禁止：

- 不建立全局 `src/hooks/`，也不为每个 feature 机械建立 `hooks/`。
- 不建立 feature-local `utils/`、`types/`、`services/`、`repositories/` catch-all。
- Feature 不直接实现 Repository、Bridge、IndexedDB、Electron 或文件系统 data layer。
- Feature A 不 deep-import Feature B 的内部文件；真正跨 feature 的 UI primitive 提升到
  `src/components`，领域能力提升到 `web-core` 或 application/session port。

#### 数据 hooks 的归属

所谓“数据层 hooks”在 `web-viewer` 中不是新的数据所有者，而是 React adapter：

| Hook 类型                                  | 目录                  | 约束                                             |
| ------------------------------------------ | --------------------- | ------------------------------------------------ |
| `useSyncExternalStore` snapshot / selector | `adapters/`           | 只连接 `ViewerApplication`、session 或既有 store |
| application command callback adapter       | `adapters/`           | 不重新实现 command/domain rule                   |
| Browser lifecycle、timer、keyboard adapter | `adapters/`           | 只在 feature 确实拥有该生命周期时存在            |
| 纯 projection / selector                   | `model/`，不用 hook   | 保持无 React、可直接单测                         |
| 单个 component 的 local UI state           | 留在 owning component | 不为了复用假象抽 hook                            |
| 非 React RAF / imperative scheduler        | `runtime/`            | 不放入 `hooks/`                                  |

例如：

- `use-playback-selector.ts` 属于 `adapters/`。
- `use-studio-snapshot.ts`、`use-studio-lifecycle.ts` 属于 `adapters/`。
- Studio ranges/selection derivation 应是 `model/studio-page-model.ts` 的纯函数，而不是
  `useStudioPageModel`。
- `use-debounced-query.ts` 因为适配 timer 与 React lifecycle，属于 Sheet Library 的 `adapters/`；
  filter/sort/stats 仍属于 `model/`。

Feature 内部依赖方向保持单向：

```text
route
  -> feature entry / connected orchestration
       -> adapters -> ViewerApplication / session / host ports
       -> model
       -> components -> model + components/ui
       -> runtime
```

`index.ts` 只形成 public surface；feature 内部禁止通过自己的 barrel 回导，避免循环依赖和扩大 lazy
chunk。

### 3. Route 只负责生命周期与 feature 组合

- `StudioPage` 只读取 route param、连接 Studio snapshot、安装 route lifecycle，并组合
  `StudioWorkspace`。
- `LibraryPage` 连接 application library snapshot，并把明确的 callbacks 传给 `SheetLibrary`。
- `ViewerPage` 继续绑定 alphaTab DOM 和 route 生命周期；`PlaybackWorkspace` 只负责播放工作区。
- 领域判断继续位于 `ViewerApplication` / session / `web-core`，不能被抽进 React leaf component。

### 4. 高频状态和低频状态使用不同渲染边界

`PlaybackWorkspace` 顶层不再订阅完整 playback snapshot：

```text
PlaybackWorkspace shell
├── PlaybackTransport          订阅 position / transport / audio / tempo / loop summary
├── Score surface              不因 drawer state 或 playback presentation JSX 重建
└── PracticeDrawer             仅打开时挂载
    ├── Overview               订阅概览字段
    ├── RhythmPanel            订阅 rhythm / soundFont / transport
    ├── PianoHandsPanel        订阅 pianoPractice
    ├── LoopPanel              订阅 loop state
    └── TracksPanel            订阅 track state
```

提供 feature-local `usePlaybackSelector`：

- 必须基于 `useSyncExternalStore`，不能通过 `useEffect + useState` 复制 controller state。
- selector 结果相等时返回前一引用，避免无关 position snapshot 触发低频 panel。
- 默认使用 `Object.is`；结构化 selector 必须提供明确 equality，不做深层 JSON 比较。
- 不缓存领域事实，不改变 command dispatch 和 snapshot 的 source of truth。

关闭的 Practice Drawer 不订阅 playback。打开后只有当前 task panel 与必要的 drawer header/summary
订阅相关字段。

### 5. Presentation derivation 使用纯 `.ts` module

以下逻辑不继续埋在大型 TSX 中：

- Playback label、loop/track summary、seek preview scheduler。
- Library filter、sort、stats、date/duration formatting。
- Studio range selection、status label、issue presentation。

纯 module 只能做 UI projection，不得复制 Repository、PlaybackController 或 Harmony domain rule。

### 6. 组件以状态所有者而不是视觉碎片拆分

不创建只有一层 `<div>` 的无意义组件。一个 component 至少满足其一：

- 拥有独立 local interaction state。
- 消费独立 external-store slice。
- 构成可独立测试的用户任务。
- 是 route / overlay / list-row 等天然生命周期边界。

### 7. Route lazy loading 是独立性能阶段

物理文件拆分完成并验证后，再调整 `App.tsx`：

- `HomePage` 与 App shell 可保持同步加载。
- Library、Viewer、Studio 使用 React Router lazy route。
- `LibraryPage` 不再静态 import `ViewerPage`；无 Library host 的 fallback 由 router 在 lazy factory 中选择。
- wildcard Viewer not-found route 也使用 Viewer chunk。
- Studio capability unavailable route 不得加载 Harmony Studio feature。

生产 build 必须证明存在独立 async chunks；不能只通过源码中出现 `import()` 判定完成。

## Target Structure

### Playback Workspace

```text
packages/web-viewer/src/features/
  PlaybackWorkspace.tsx                         # compatibility re-export only
  playback-workspace/
    playback-workspace.tsx                      # shell, drawer open/focus ownership
    playback-transport.tsx                      # connected transport + shortcut
    score-navigation-controls.tsx               # connected navigation and popup
    practice-drawer.tsx                         # drawer task navigation and focus
    adapters/
      use-playback-selector.ts                  # external-store selector adapter
    components/
      bpm-control.tsx                           # props-only BPM popover
      disabled-playback-transport.tsx
      disabled-practice-drawer.tsx
    model/
      playback-presenter.ts                     # labels and summaries
    runtime/
      seek-preview-scheduler.ts                 # RAF latest-only helper
    panels/
      practice-overview.tsx
      rhythm-practice-panel.tsx
      piano-hands-practice-panel.tsx
      loop-practice-panel.tsx
      tracks-practice-panel.tsx
    playback-workspace.module.css               # initially declaration-equivalent
    __tests__/
      playback-transport.test.tsx
      practice-drawer.test.tsx
      loop-practice-panel.test.tsx
      tracks-practice-panel.test.tsx
      use-playback-selector.test.tsx
      seek-preview-scheduler.test.ts
      test-fixtures.ts
```

#### State ownership

| State                                  | Owner                                                             |
| -------------------------------------- | ----------------------------------------------------------------- |
| `drawerOpen`、toggle focus restoration | `PlaybackWorkspace`                                               |
| `practiceView`、back navigation        | `PracticeDrawer`                                                  |
| playback truth                         | `ViewerSessionHandle.playback`                                    |
| navigation mode preference             | existing `appStore`                                               |
| BPM popover open/input draft           | Base UI / `BpmControl` local state                                |
| seek preview RAF                       | `seek-preview-scheduler.ts` instance owned by `PlaybackTransport` |

#### Stable component contracts

```ts
type PlaybackWorkspaceProps = {
  session: ViewerSessionHandle | undefined;
  children: ReactNode;
};

type PlaybackTransportProps = {
  playback: ViewerSessionHandle["playback"];
  navigation: ViewerSessionHandle["navigation"];
  practiceOpen: boolean;
  onPracticeOpenChange(open: boolean): void;
};

type PracticeDrawerProps = {
  playback: NonNullable<ViewerSessionHandle["playback"]>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  onClose(): void;
};
```

Disabled playback 使用显式 `DisabledPlaybackTransport` / `DisabledPracticeDrawer` presentation，不再由一个
接受多个 setter/ref 的大型 helper function 生成整棵重复 JSX。

### Sheet Library

```text
packages/web-viewer/src/features/
  SheetLibrary.tsx                              # compatibility re-export only
  sheet-library/
    sheet-library.tsx                           # coordinator and dialog selection state
    adapters/
      use-debounced-query.ts                    # React + timer adapter
    components/
      library-toolbar.tsx                       # query/favorite/sort controls
      library-score-list.tsx                    # memoized list boundary
      library-score-row.tsx                     # one score and its menu
      library-empty-state.tsx                   # empty/filter-empty/error states
      edit-score-dialog.tsx
      delete-score-dialog.tsx
      import-summary.tsx
      library-skeleton.tsx
      highlight-text.tsx
    model/
      library-view-model.ts                     # filter/sort/stats/format
    sheet-library.module.css                    # initially declaration-equivalent
    __tests__/
      import-summary.test.tsx
      library-score-row.test.tsx
      edit-score-dialog.test.tsx
      delete-score-dialog.test.tsx
      library-view-model.test.ts
      sheet-library-rendering.test.tsx
      test-fixtures.ts
```

#### State ownership

| State                                   | Owner                               |
| --------------------------------------- | ----------------------------------- |
| raw search input、favorite filter、sort | `SheetLibrary`                      |
| debounced search value                  | `useDebouncedQuery`                 |
| visible list、stats                     | `library-view-model.ts` + `useMemo` |
| editing/deleting score                  | `SheetLibrary` coordinator          |
| row menu open/highlight                 | Base UI Menu                        |
| dialog form draft                       | native form inside dialog           |
| import summary timeout                  | `ImportSummary`                     |

#### Rendering boundary

- `LibraryScoreList` 使用 `memo`。
- `visibleScores` 只依赖 debounced query、filter、sort、locale 和 input scores。
- 用户输入但 debounce 尚未提交时，现有 score rows 不应重新 render。
- `LibraryScoreRow` 接收稳定 callbacks；禁止为了 memo 每次创建新的 `actions` object。
- 暂不引入 virtualization；只有真实数据规模和 profiling 证明 DOM 数量成为瓶颈时再评估。

`SheetLibrary` 现有 props 在兼容阶段保持不变。内部逐步把 `ViewerApplication` 调用适配成窄 callbacks；
最终 leaf component 不接收完整 `ViewerApplication`。

### Studio

```text
packages/web-viewer/src/
  app/pages/
    StudioPage.tsx                              # route param + lifecycle + composition
    __tests__/
      studio-page-lifecycle.test.tsx
      studio-page-routing.test.tsx
  features/harmony-studio/
    studio-workspace.tsx                        # split workspace and state surfaces
    adapters/
      use-studio-snapshot.ts                    # selected application snapshot
      use-studio-lifecycle.ts                   # open/save shortcut/beforeunload
    components/
      studio-analysis-panel.tsx                 # loading/error/document branch
      studio-command-bar.tsx                    # status/history/save/export
      studio-settings-popup.tsx
      studio-preview-popup.tsx
      studio-segment-inspector.tsx              # editor + segment actions
    model/
      studio-page-model.ts                      # ranges/selection derivation
      studio-page-presenter.ts                  # labels/issues/range equality
    harmony-studio.module.css                   # declaration-equivalent relocation
    __tests__/
      studio-workspace.test.tsx
      studio-command-bar.test.tsx
      studio-settings-popup.test.tsx
      studio-preview-popup.test.tsx
      studio-segment-inspector.test.tsx
      studio-page-model.test.ts
      test-fixtures.ts
```

#### State ownership

| State                                  | Owner                                             |
| -------------------------------------- | ------------------------------------------------- |
| `libraryScoreId`                       | React Router                                      |
| Studio document/runtime state          | `ViewerApplication`                               |
| Studio-only snapshot subscription      | `useStudioSnapshot`                               |
| split / preview enabled preference     | route composition using existing preference codec |
| settings/preview popup open            | corresponding command/popup component             |
| export status                          | `StudioCommandBar`                                |
| fallback selection key                 | `StudioWorkspace` orchestration                   |
| `Cmd/Ctrl+S`、beforeunload、openStudio | `useStudioLifecycle`                              |

`useStudioSnapshot` 的 `getSnapshot` 只返回当前 Studio slice；Library import 或其他 application snapshot
变化在 Studio slice 引用未改变时不得重渲染 Studio workspace。

`StudioWorkspace` 与 leaf components 接收 presentation model 和窄 callbacks，不读取 Browser storage、
route param 或 window lifecycle。

## Test Strategy

### Preserve user-facing integration coverage

- 保留每个 feature 至少一个从入口 component 到用户可见结果的集成测试。
- 现有 accessibility role/name 断言继续有效。
- 不把所有测试改成 implementation-detail shallow tests。

### Add boundary-specific coverage

Playback：

- position-only snapshot 不重渲染 Rhythm、Hands、Loop、Tracks panel。
- 关闭 Practice Drawer 后 unsubscribe。
- Escape、back、close 与 trigger focus restoration 不变。
- seek preview 每帧 latest-only，commit 取消 pending frame。

Library：

- debounce 未提交前 score rows 不重渲染。
- filter/sort 提交后 visible list 正确。
- row menu 到 edit/delete dialog 的 final focus 恢复不变。
- import summary 的 running/error/cancel/dismiss timer 不变。

Studio：

- unrelated Library snapshot update 不重渲染 Studio workspace。
- save shortcut 与 beforeunload 只在对应 document state 生效。
- settings、preview、selection、segment commands 保持原行为。
- storage unavailable、loading、analysis error、conflict、save failure 均保留可访问状态。

### Update structural style tests

`packages/web-viewer/src/__tests__/styles.test.ts` 当前直接读取旧 TSX path 并匹配 class string。拆分时：

- CSS contract 继续读取 CSS owner。
- Library sort class 断言改读 `components/library-toolbar.tsx`。
- Playback CSS import 断言改读新的 workspace/transport owner。
- 不把 facade re-export 当作样式事实源。

## Implementation Phases

### Phase 0: Baseline and contract lock

记录三类基线：

- 当前 focused tests 和 `pnpm check` 结果。
- Browser/Desktop production JS assets 与 route chunk 情况。
- React Profiler 或 deterministic render-probe：Playback position、Library typing、Studio unrelated snapshot。

基线只新增测试/记录，不改变生产行为。

### Phase 1: Playback structural split

1. 搬迁纯 helper、scheduler、BPM 和 navigation controls。
2. 拆分 transport 与 disabled presentation。
3. 拆分 Practice Drawer 与五个 task panel。
4. 保持旧入口为 re-export，并拆分测试。

Checkpoint：所有 Playback focused tests、Viewer App integration tests 和 style tests 通过。

### Phase 2: Playback subscription split

1. 实现并测试 `usePlaybackSelector`。
2. shell 移除完整 playback subscription。
3. Transport 与当前 Practice panel 分别订阅。
4. 对比 Phase 0 render probe。

Checkpoint：用户行为不变，position-only update 不触发低频 panel render。

### Phase 3: Sheet Library split

1. 提取 pure view model、toolbar、list/row。
2. 提取 dialogs、empty/skeleton/import summary。
3. 建立 memoized list/row boundary。
4. 拆分测试并修正 style source ownership。

Checkpoint：Library focused tests、App Library journey 和 render probe 通过。

### Phase 4: Studio split

1. 提取 presenter、selected snapshot 与 lifecycle hooks。
2. 提取 command bar、settings 和 preview。
3. 提取 analysis panel、segment inspector 与 workspace。
4. 拆分 Studio tests。

Checkpoint：Studio focused tests、App Studio journey、save/unload/conflict coverage 和 render probe 通过。

### Phase 5: Route chunks

1. 把 router construction 从 `App.tsx` 提取到 `app/router.tsx`。
2. Library、Viewer、Studio 与 wildcard Viewer 使用 lazy route。
3. 移除 `LibraryPage -> ViewerPage` 静态依赖。
4. 确认 Studio unavailable capability 不加载 Studio feature。
5. 生产 build 对比 initial asset 与 async chunks。

Checkpoint：Browser/Desktop/iPad build 通过，直接访问和 route navigation 都能加载对应 workspace。

### Phase 6: Cleanup and durable documentation

- 删除 facade 中除 re-export 外的所有实现。
- repo-wide `rg` 确认无旧内部 deep import。
- 删除 orphan selectors/imports/test fixtures。
- 如果仅结构与性能变化且用户行为不变，不机械更新 Feature Contract。
- 更新 `react-application-system.md` 的实现路径，仅记录与现状不一致的耐久结构。
- 更新 Tailwind active task paths，然后恢复 Tailwind slice。
- 本计划完成并把耐久结果提升到 architecture/check 后，删除本任务包。

## Acceptance Criteria

### Architecture

- 三个原大型 TSX 不再混合 route、external store、presentation 和多个用户任务。
- leaf components 不直接读取不属于自己的 route/window/storage/application state。
- `web-core`、Repository、Bridge 和 alphaTab 边界不变。
- 不新增全局 `utils/` 或无领域归属的 `hooks/` 目录。

### Behavior

- Current Feature Contracts 中的 Library、Viewer 和 Studio 行为全部保持。
- 所有现有 i18n key 和可访问名称保持，除非测试证明原实现有 defect 且另行立项。
- focus、Escape、keyboard shortcut、loading、empty、error、disabled、conflict、unsaved 状态不退化。

### Performance

- Playback position-only update 不渲染非当前低频 Practice panel。
- Library debounce 未提交时不重渲染现有 score rows。
- Studio slice 未改变时，其他 application snapshot 更新不渲染 Studio workspace。
- production build 出现独立 Library、Viewer、Studio async chunks。
- initial JS 不得因重构无解释增长；以 Phase 0 production build 为基线记录变化。

### Maintainability

- route component 只负责 route/lifecycle/composition。
- feature data hooks 位于 `adapters/`，纯 projection 位于 `model/`，非 React 命令式逻辑位于
  `runtime/`；不新增泛化 `hooks/` 或 `utils/`。
- 新 source module 与目录使用 `kebab-case`，测试 stem 与 source 一致。
- feature 内部依赖不经自身 barrel 回导，不 deep-import 其他 feature 的内部文件。
- 纯 projection 和 scheduler 位于 `.ts`。
- 测试按用户行为域拆分，共享 fixtures 不包含领域实现副本。
- 新文件遵循 named export、double quotes、exact optional property rules。

## Verification

每个 phase 完成后先运行最小相关检查；最终至少运行：

```text
pnpm vitest run packages/web-viewer/src/features/playback-workspace
pnpm vitest run packages/web-viewer/src/features/sheet-library
pnpm vitest run packages/web-viewer/src/features/harmony-studio
pnpm vitest run packages/web-viewer/src/app
pnpm check:arch
pnpm check:design
pnpm check:i18n
pnpm check
pnpm format:check
git diff --check
pnpm demo:build
pnpm desktop:build
pnpm ipad:web:build
```

由于 route chunk、focus 和播放工作区属于跨组件高风险变化，最终还应运行与 Library → Viewer →
Studio、Practice Drawer、Loop/Track controls 对应的 Browser/Desktop E2E；如果无法运行，必须明确报告
未验证范围，不能把任务标记完成。

## Risks and Mitigations

| Risk                                          | Impact | Mitigation                                                                    |
| --------------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| 与进行中的 Tailwind slice 修改同一文件        | 高     | 先结构拆分、后样式迁移；提交保持单一目的                                      |
| selector 返回新 object 导致循环或失去优化     | 高     | 缓存 selector result；为 equality 与 unsubscribe 写 focused tests             |
| selector 遗漏字段造成 UI stale                | 高     | 每个 panel 明确列出 consumed fields；command 后以用户可见断言验证             |
| Drawer / Dialog 搬迁破坏焦点恢复              | 高     | trigger/close/finalFocus owner 明确；保留键盘集成测试                         |
| route lazy 改变直达链接或 capability fallback | 高     | lazy route 单独 phase；覆盖 direct route、not-found 和 unavailable capability |
| CSS Module 搬迁引发 cascade 变化              | 中     | declarations 原样搬迁；不与 Tailwind migration 合并                           |
| package barrel 重新拉入 lazy module           | 中     | production stats 验证实际 chunk；检查 `index.ts` 公共导出                     |
| 测试拆分复制过多 fixture                      | 中     | 每个 feature 一个 typed fixture module；不复制 controller/domain logic        |

## Open Questions

没有阻塞性产品问题。实现前只需由维护者确认执行顺序：是否同意暂停当前 Tailwind Task 9c，先完成
Playback 结构拆分。若不同意，则必须先完成并冻结 9c，再开始本计划，不能并行修改同一 component。
