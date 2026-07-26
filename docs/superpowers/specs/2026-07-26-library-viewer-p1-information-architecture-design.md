# Library 与 Viewer P1 信息架构设计

## 背景

HIK-5 的 P0 已在 `981b274` 合入 `main`，完成了 390px 核心旅程、Library 主动作语义、
No-results 恢复、Library-backed Viewer 导入入口降级，以及窄屏 Transport / Zoom。P1 不再处理
核心可用性，而是把已经可用的界面重组为更适合长期练习的工作台。

本设计基于原始 Product UX report、P0 后运行时代码、`DESIGN.md` 和当前 Sheet Library Feature
Contract。目标表面的设计刻度保持为：Library `Visual Density 6/10`，Viewer `8/10`，整体
`Design Variance 4/10`、`Motion Intensity 3/10`。

## 事实核对与约束

### 已有能力

- `SheetLibrary` 已有独立的打开、收藏和管理菜单语义，P1 必须保留该 sibling control 模型。
- `LibraryScoreSummary.practice` 已包含 `hasLoop`、可选 `lastPracticedAt` 和可选
  `lastPosition`；Browser 会从 Practice Sidecar 与 Local Playback Resume 汇总这些字段。
- Viewer 打开 Library Score 后已经读取 Local Playback Resume，因此“继续练习”只需要表达真实
  的恢复能力，不需要新增路由或播放命令。
- 导入汇总已经区分 `created`、`existing`、`failed`、`cancelled` 和 `running`，P1 只调整反馈层级。
- 练习抽屉已经具备速度、Loop、轨道和当前设置的领域命令，P1 不修改播放领域模型。

### 当前差距

- Desktop 当前的练习 sidecar / resume 由 Main 中的校验型 `JsonStore` 持久化，
  `DesktopLibraryStore.list()` 却固定返回 `practice: { hasLoop: false }`。迁移中虽仍存在同名
  SQLite 表，当前 Bridge 写入路径并不使用这些表。P1 不得基于这些未使用表实现汇总。
- 当前 Library 把 `measureIndex` 直接展示给用户，而领域值是零基索引。目录行必须统一以
  `measureIndex + 1` 呈现人类可读小节号。
- 缺少 `lastPosition` 只能证明没有可展示的恢复位置，不能证明“从未练习”。在 Desktop 摘要补齐
  前，界面不得把缺失数据写成“尚未练习”或伪造“继续”。
- 练习抽屉在正常和 disabled/loading 分支中存在重复结构。任务化时要同时覆盖两条渲染路径，
  避免加载态继续保留旧信息架构。

## P1 目标

1. Library 默认成为紧凑排练目录，在一屏内更快扫描标题、作者、练习位置与下一动作。
2. Browser 与 Desktop 对真实练习摘要保持一致；只有存在恢复位置时才使用“继续练习”。
3. 单文件全成功反馈不再长期推开馆藏，异常和批量结果仍可追溯。
4. 练习设置首层按用户任务组织，而不是把 Loop、Tracks、Session 领域对象平铺。
5. 中文界面移除重复英文 eyebrow 和装饰标题。

## 非目标

- 不增加卡片/列表切换、标签、文件夹、歌单、批量管理、分页或虚拟列表。
- 不改变 `LibraryScoreSummary` schema、Bridge schema、Library Score 身份或 Viewer 路由。
- 不新增遥测、A/B 框架或自动判断用户意图；这些属于 P2。
- 不修改 Loop、Track、Resume 的领域命令或持久化格式。
- 不把练习摘要同步到 Browser、Desktop 或账号之间。
- 不清理与 Library / Viewer P1 无关的英文文案。

## 推荐实现顺序

```text
P1-01 Desktop 练习摘要对齐
          │
          ▼
P1-02 Library 排练目录行
          │
          ├──────────────┐
          ▼              ▼
P1-03 导入反馈层级   P1-04 练习设置任务化与中文清理
          └──────────────┬──────────────┘
                         ▼
                 P1-05 跨宿主验收与契约更新
```

`P1-01` 是目录行“继续练习”文案的真实性门槛。`P1-03` 与 `P1-04` 在目录行稳定后可并行，
最后统一做 Browser/Desktop、桌面/窄屏和键盘回归。

## 详细事项拆解

### P1-01：Desktop 练习摘要对齐

**结果**：Desktop Library 能从当前实际使用的 `JsonStore` 汇总与 Browser 同语义的
`LibraryPracticeSummary`。

**实现边界**：

- 给 `DesktopLibraryStore` 注入只读的 sidecar / resume reader，或注入等价的
  `readPracticeSummary(libraryScoreId)` 依赖；Repository 不直接依赖文件路径或 Electron。
- `list()` 对每个 ready Library Score 读取已校验的 Sidecar 与 Resume：
  - `hasLoop = sidecar.practice.playback.loops.length > 0`
  - Resume 存在时写入 `lastPracticedAt = resume.updatedAt` 与 `lastPosition = resume.position`
  - Resume 缺失时省略可选字段，不传 `undefined`
- 不读取迁移中未被当前写入路径使用的 SQLite sidecar / resume 表，不新增 migration 或 Bridge API。
- 单项摘要缺失表示没有可展示数据；持久化读取失败沿用现有 storage warning / failure 语义，
  不伪造成空摘要。

**主要文件**：

- `apps/desktop-shell/src/main/main.ts`
- `apps/desktop-shell/src/main/library/DesktopLibraryStore.ts`
- `apps/desktop-shell/src/main/library/__tests__/DesktopLibraryStore.test.ts`
- 必要时补充 `apps/desktop-shell/e2e/desktop.spec.ts`

**估算**：M。依赖：无。

### P1-02：Library 紧凑排练目录行

**结果**：默认列表从卡片网格改为单列目录；主列用于标题/作者，状态列用于真实练习摘要，末端提供
明确的“继续练习”或“打开”动作。

**信息优先级**：

1. 标题与作者。
2. 有恢复位置时显示“上次练到第 N 小节”和相对练习时间；有 Loop 时使用低权重状态提示。
3. 存在 `lastPosition` 时主动作命名为“继续练习”，否则为“打开”。
4. 格式和时长降为辅助元数据；收藏与更多菜单保持同级独立控件。
5. 不再把缺失摘要写成“尚未练习”；没有练习事实时只保留中性的打开动作。

**布局与交互**：

- `>= 620px` 使用单列高密度目录行，不保留默认卡片视图。
- `390px–619px` 使用相同 DOM，把状态和动作折为两行；不得恢复水平滚动或隐藏主动作。
- `<li>` 不获得 button 语义；打开/继续、收藏和菜单仍是 sibling controls。
- hover 只加强边界/表面，不移动整行；focus-visible、菜单焦点恢复和危险操作层级沿用 P0。
- Light / Dark 使用现有 semantic tokens，不新增主题原始色或依赖。

**主要文件**：

- `packages/web-viewer/src/features/SheetLibrary.tsx`
- `packages/web-viewer/src/features/SheetLibrary.module.css`
- `packages/web-viewer/src/features/__tests__/SheetLibrary.test.tsx`
- `packages/app-i18n/src/locales/{zh-CN,en-US}.ts`
- `apps/web-demo/e2e/library.spec.ts`

**估算**：M。依赖：P1-01。

### P1-03：渐进式导入反馈

**结果**：完成的单文件纯新增结果显示紧凑 inline status，并在 4 秒后自动收起；所有需要用户判断
或追溯的结果继续显示完整汇总。

**分类规则**：

- 紧凑反馈仅适用于：`running === false`、`total === 1`、唯一结果为 `created`、
  `cancelled === 0`。
- 以下任一情况使用完整汇总：运行中、`total > 1`、`existing`、`failed` 或
  `cancelled > 0`。
- 完整汇总继续保留逐项结果；失败详情默认展开，重复与批量成功可由用户展开。
- 紧凑反馈使用 `role="status"` / polite live region，并保留立即关闭入口。计时器在 summary
  变化或组件卸载时清理，禁止遗留异步更新。

**主要文件**：

- `packages/web-viewer/src/features/SheetLibrary.tsx`
- `packages/web-viewer/src/features/SheetLibrary.module.css`
- `packages/web-viewer/src/features/__tests__/SheetLibrary.test.tsx`
- `packages/web-viewer/src/app/__tests__/ViewerApplication.test.ts`
- `packages/app-i18n/src/locales/{zh-CN,en-US}.ts`

**估算**：S。依赖：P1-02 的布局插槽稳定。

### P1-04：练习设置任务化与中文清理

**结果**：练习抽屉首层显示用户要完成的任务，进入二级工作区后复用现有命令；中文界面不再显示
重复的 `Practice`、`Loop`、`Tracks`、`Session` 装饰标题。

**首层任务**：

- “设置循环区间”：显示当前 Loop 状态；进入后提供 A/B、吸附、保存和已存 Loop 管理。
- “选择主轨道”：显示当前主轨道；进入后提供主轨道、附加显示、静音、独奏和音量。
- “调整速度”：保留当前 BPM / 百分比入口，并继续提供音频失败重试。
- 当前轨道数、速度与 Loop 状态作为紧凑摘要，不再单独占用 `Session` section。

**状态与焦点**：

- 内部使用 `overview | loop | tracks` 展示状态，不增加 URL 或领域状态。
- Transport 的“设置循环区间”在没有已存区间时直接打开 `loop` 任务；普通“练习设置”进入
  `overview`。
- 进入任务后焦点落到任务标题或第一个可操作控件；返回首层不关闭抽屉；Escape 关闭抽屉并恢复
  到原触发器。
- disabled/loading 分支使用同一信息架构，控件禁用并保留原因，不复制旧的 section 列表。
- 删除 Library 页重复 kicker；`en-US` 保留必要英文产品文案，`zh-CN` 区域标题全部使用中文。

**主要文件**：

- `packages/web-viewer/src/features/PlaybackWorkspace.tsx`
- `packages/web-viewer/src/features/PlaybackWorkspace.module.css`
- `packages/web-viewer/src/features/__tests__/PlaybackWorkspace.test.tsx`
- `packages/app-i18n/src/locales/{zh-CN,en-US}.ts`
- `apps/web-demo/e2e/library.spec.ts`

**估算**：L。依赖：P1-02；可与 P1-03 并行。

### P1-05：跨宿主验收与契约更新

**结果**：P1 的真实行为、自动化证据和 Current Feature Contract 一致。

**验收范围**：

- Library：无练习摘要、有 Resume、有 Loop、无作者、长标题、收藏、菜单、单/批量导入、
  existing、failed、390px、620px、1280px。
- Viewer：overview / loop / tracks、disabled/loading、音频失败、Escape、焦点恢复、390px 和桌面。
- Browser：真实导入后返回 Library，目录行显示实际 Resume；单文件反馈自动收起。
- Desktop：写入 sidecar / resume 后返回 Library，显示同语义练习摘要；Renderer 仍看不到绝对路径。
- 人工检查 Light / Dark、键盘 Tab 顺序，以及 VoiceOver / NVDA 发布前门禁。
- 更新 `docs/features/contracts/sheet-library.md` 的平台矩阵、当前行为、已知差距和证据地图；
  只有在实现与测试完成后移除 Desktop 摘要差距。

**估算**：M。依赖：P1-01 至 P1-04。

## 验收标准

- Library 在 1280px 默认呈现单列紧凑目录，在 390px 无水平溢出且所有主动作可见。
- 只有存在真实 `lastPosition` 的条目使用“继续练习”，用户可见小节号按一基展示。
- Browser 与 Desktop 的已有 Resume / Loop 在 Library 中表达一致；缺失摘要不被标为“尚未练习”。
- 单文件纯新增完成反馈在 4 秒后收起；批量、重复、失败、取消和运行中汇总不自动消失。
- 中文 Library / 练习设置不再出现重复的 `Library`、`Practice`、`Loop`、`Tracks`、`Session`
  装饰标题。
- 练习抽屉可从首层进入 Loop / Track 任务，Escape 和返回操作的焦点行为稳定。
- P0 的打开、收藏、管理菜单、No-results、390px Transport / Zoom 行为不回退。

## 验证命令

```bash
pnpm vitest run packages/web-viewer/src/features/__tests__/SheetLibrary.test.tsx
pnpm vitest run packages/web-viewer/src/features/__tests__/PlaybackWorkspace.test.tsx
pnpm vitest run apps/desktop-shell/src/main/library/__tests__/DesktopLibraryStore.test.ts
pnpm check:i18n
pnpm demo:test:e2e
pnpm desktop:build
pnpm desktop:test:e2e
pnpm verify:fast
git diff --check
```

## 风险与缓解

| 风险                                 | 影响                     | 缓解                                             |
| ------------------------------------ | ------------------------ | ------------------------------------------------ |
| Desktop 汇总误读未使用的 SQLite 表   | 显示过期或永远为空的数据 | 只从当前 Bridge 使用的校验型 `JsonStore` 读取    |
| “继续练习”成为没有语义差异的营销文案 | 用户预期与恢复结果不一致 | 仅在 `lastPosition` 存在且 Viewer 已能恢复时使用 |
| 目录行在窄屏重新拥挤                 | 回退 P0 核心旅程         | 同 DOM 分行，390/620/1280 三档 E2E 验证          |
| 自动收起隐藏异常                     | 用户无法追溯失败/重复    | 只有单文件纯新增自动收起，其余永久保留到主动关闭 |
| 任务化抽屉复制领域逻辑               | 命令和持久化分叉         | 只改展示状态并复用现有 dispatch command          |
| 并行任务修改同一 UI 文件             | 合并冲突与状态漂移       | P1-02 先稳定结构，P1-03 / P1-04 再并行           |

## P2 交接

P1 完成后再验证“继续练习”、渐进式导入反馈和任务化入口是否改善真实任务。没有稳定遥测基础设施
时，优先邀请 5–8 位目标用户完成定时任务，不在 P1 引入临时埋点框架。
