# Library 与 Viewer UX 优化设计

## 背景

HIK-5 的 Product UX review 使用真实 `Treasure.gp5` 覆盖了空 Library、导入、搜索、重新打开
Viewer、练习设置、删除取消、键盘焦点，以及 1280×720 与 390×844 两类视口。报告确认 Viewer
的谱面优先结构和固定 Transport 已经成立，但核心旅程仍被以下问题阻断：

1. 390px 窄视口下 Library 与 Viewer 的关键操作被裁切。
2. Library 卡片把一个可聚焦的 `role="button"` 与内部操作按钮嵌套，主动作语义错误。
3. 已有馆藏时，搜索无结果错误复用空馆藏状态。
4. Library 的桌面信息架构尚未达到排练目录的扫描效率。
5. Viewer 的低频导入入口与播放争夺主操作权重。

本文记录整体优化顺序，并定义 P0 的产品和工程设计。P1、P2 只固定目标与依赖，不在本文内提前
设计具体组件。

## 已确认方向

- 优化顺序为 `P0 核心可用性 → P1 信息架构与层级 → P2 产品假设验证`。
- Browser、Desktop 与 iPad 继续共享 `packages/web-viewer` 的 Library / Viewer UI，不复制页面。
- 390px 是 P0 必须完成核心旅程的最窄目标容器；620px 作为现有窄屏布局切换点，640px 仍需保证
  无溢出。
- P0 不修改 `LibraryScoreSummary`、Repository、Bridge、IndexedDB、SQLite 或播放领域命令。
- Library-backed Viewer 移除页内“导入曲谱”；没有 Library 能力的独立 Viewer 仍保留“打开乐谱”。
- P0 修复当前卡片的语义和窄屏操作，不提前完成 P1 的桌面目录行重构。
- P0 使用现有 `@base-ui/react`、`lucide-react`、semantic tokens 与容器查询，不新增依赖。
- 自动化覆盖 Accessibility tree、键盘和真实浏览器布局；VoiceOver / NVDA 真人测试作为发布前人工
  门禁，不在单元测试中伪造。

以上三项发布决策已于 2026-07-26 确认：390px 是正式最窄核心旅程宽度；Library-backed Viewer
在所有宽度移除页内导入；P0 独立发布，不等待 P1 目录行重构。

## 目标

P0 让已有本地曲谱的用户在 390px–1280px 容器内可靠完成以下旅程：

```text
进入 Library
→ 搜索或筛选曲谱
→ 明确打开目标曲谱
→ 在 Viewer 播放 / 暂停
→ 打开练习设置
→ 调整速度或进入 Loop / Track 设置
```

同时建立稳定的语义模型：

```text
Library Score
├── 主动作：打开曲谱
├── 独立动作：收藏
└── 管理菜单：导出 / 编辑 / 删除
```

成功不以“页面看起来更紧凑”为标准，而以无裁切、动作可区分、错误状态可恢复和自动化可验证为
标准。

## 非目标

- 不在 P0 把卡片网格改为桌面目录行；该项属于 P1。
- 不增加标签、文件夹、批量管理、分页、虚拟列表或卡片/列表切换。
- 不实现“继续练习”实验和遥测；该项属于 P1/P2。
- 不压缩全部导入成功反馈或清理所有英文装饰标题；该项属于 P1。
- 不修改谱面渲染、播放引擎、Loop 数据、Track 数据或练习持久化。
- 不改变 Viewer / Studio 路由和 `libraryScoreId` 身份语义。
- 不新增响应式 JavaScript 媒体查询作为布局事实源。

## 推荐优化顺序

### P0：核心可用性

1. 修复 Library 和 Viewer 在 390px–640px 的水平溢出。
2. 将 Library Score 主动作与收藏、管理动作改为同级交互。
3. 增加独立 No-results 状态和清除条件动作。
4. Library-backed Viewer 移除低频导入入口；窄屏 Transport 和 Zoom 形成明确控制优先级。

P0 是后续改版的发布门槛。P1 不应建立在错误语义或不可用窄屏布局之上。

### P1：信息架构与视觉层级

1. Library 默认改为紧凑排练目录行，突出标题、作者、最近练习位置和“继续/打开”。
2. 单文件全部成功使用短暂、紧凑的反馈；失败、重复和批量结果才保留展开汇总。
3. 清理中文界面中的重复英文 eyebrow 和分区标题。
4. 练习设置按“创建 Loop / 选择主轨道”等任务组织首层入口。

P1 可使用现有 `LibraryScoreSummary.practice` 数据，但 Desktop 练习摘要差距必须如实显示，不能伪造
“继续”位置。

### P2：产品假设验证

1. 比较“继续练习”与泛化整行打开对复访和打开耗时的影响。
2. 验证任务化练习入口是否缩短第一次有效 Loop / Track 配置时间。
3. 验证导入汇总的主要价值来自失败、重复还是成功确认。

没有稳定遥测基础设施时，先使用 5–8 位目标用户的任务测试，不为 P0 临时引入埋点框架。

## P0 详细设计

### 1. Library 顶部与筛选区

宽容器保持当前左右结构。route viewport 的 unnamed `@container (max-width: 620px)` 下：

- `libraryContextBar` 只做 Library 局部覆盖，改为两行，不修改共享 `PageShell.contextBar` 的全局
  结构。
- 标题与说明占第一行；导入动作在第二行横向排列并允许安全换行。
- 搜索框独占筛选区第一行。
- 收藏筛选和排序位于第二行；排序仍使用原生 `select`。
- 所有区域使用 `min-width: 0`，不得通过页面水平滚动暴露被裁切内容。

390px 下的结构为：

```text
┌──────────────────────────────┐
│ 曲谱库                       │
│ 你的本地排练目录             │
│ [导入曲谱] [批量导入]        │
├──────────────────────────────┤
│ [搜索曲名或艺术家……]         │
│ [☆ 收藏]       [排序：活动⌄] │
└──────────────────────────────┘
```

### 2. Library Score 交互语义

`<li>` 只作为列表项，不再拥有 `role="button"`、`tabIndex`、`onClick` 或 `onKeyDown`。卡片内部拆成
独立交互：

```tsx
<li className={styles.libraryRow}>
  <button className={styles.libraryOpenAction} type="button" onClick={() => onOpen(score.id)}>
    <strong>{score.title}</strong>
    <span>{score.artist}</span>
  </button>
  <button type="button" aria-label={favoriteLabel} aria-pressed={score.isFavorite}>
    <Star aria-hidden="true" />
  </button>
  <LibraryScoreMenu score={score} />
</li>
```

- 主按钮的 accessible name 以“打开 {title}”表达动作，不拼入收藏、导出、编辑和删除名称。
- 收藏继续使用 `aria-pressed`。
- 导出、编辑、删除进入“更多操作”Menu；触发器使用 `aria-haspopup="menu"` 和
  `aria-expanded`。
- Menu 使用现有 `@base-ui/react` primitive，打开后聚焦首项，方向键移动，Escape 关闭并恢复到
  触发器。删除项具有危险语义样式，但不使用珊瑚主按钮。
- 删除仍进入已有永久删除确认，不从 Viewer 新增删除入口。
- 桌面与窄屏使用同一 DOM 语义，不通过两套可聚焦控件做视觉切换。

### 3. Empty 与 No-results 状态

状态判定必须互斥：

```ts
const hasQuery = query.trim().length > 0;
const isEmptyLibrary = !loading && scores.length === 0;
const hasNoResults = !loading && scores.length > 0 && visible.length === 0;
```

- `isEmptyLibrary`：保留“导入第一份曲谱”。
- `hasNoResults && hasQuery`：显示“没有匹配「{query}」的曲谱”。
- `hasNoResults && favoritesOnly && !hasQuery`：显示“收藏中还没有曲谱”。
- No-results 显示 `0 / {scores.length}`，保留搜索和筛选控件。
- “清除搜索”只清空 `query`；“清除全部筛选”同时清空 `query` 和 `favoritesOnly`，不重置排序。
- No-results 不显示导入动作，避免暗示馆藏丢失。

新增文案进入 `@zupulse/app-i18n` 的 `library` namespace，中英文 catalog 保持同构。

### 4. Viewer 顶部层级

- Library-backed Viewer 不渲染 `open-score` 按钮；导入只从 Library 或全局入口发起。
- 没有 Library 能力时保留“打开乐谱”，维持独立 Viewer 当前行为。
- 窄屏下标题允许省略；和弦分析改为图标入口，但必须保留完整 accessible name。
- 不隐藏当前 status message；状态文本在必要时占独立行或安全收缩。
- 播放按钮继续是 Viewer 唯一实心主操作。

### 5. 窄屏 Transport

宽屏保持当前顺序。`max-width: 620px` 下：

```text
┌────────────────────────────────────┐
│ [播放] [停止] [Loop] 0:00/4:12 [状态] [设置] │
└─────────────── progress ───────────┘
```

- 第一优先级：播放、停止、Loop。
- 第二优先级：当前时间 / 总时长。
- 第三优先级：音频异常状态、练习设置。
- BPM / 速度不在窄屏 Transport 常驻，进入练习面板；它仍调用现有
  `set-score-speed` command，不创建新的播放状态。
- 练习设置触发器在极窄宽度使用 `SlidersHorizontal` 图标和完整 `aria-label`。
- SoundFont loading / error 不能挤走核心按钮；窄屏显示紧凑状态，retry 放入练习面板。
- 进度 Slider 继续横跨 Transport 顶边，不新增第二个水平滚动容器。
- enabled 与 disabled Transport 必须共享响应式结构或共同 helper，避免两套布局继续漂移。

练习面板保持非模态 complementary region。打开时聚焦关闭按钮，Escape 关闭，关闭后焦点回到设置
触发器；不强制把焦点圈定在面板内。

### 6. 谱面缩放

- 宽屏保留减小、百分比、放大三个直接控件。
- 窄屏只常驻一个“调整谱面缩放”图标按钮。
- 点击后使用现有 `@base-ui/react` Popover 展示减小、百分比、放大；不复用语义为 modal dialog
  的 `ContextPopup`。
- 按钮、Popover 与双指缩放继续提交同一个 `zupulse:score-zoom-commit` 事件。
- Popover 支持 Escape 和焦点恢复，且不得超出 390px 视口。

## 交互与数据状态矩阵

| 表面           | 必须覆盖的状态                                                                            |
| -------------- | ----------------------------------------------------------------------------------------- |
| Library        | loading、empty、populated、query no-results、favorites no-results、error                  |
| Library Score  | default、hover、focus、favorite、menu open、editing、delete confirm                       |
| Viewer header  | standalone、Library-backed、session loading、session ended、Harmony available/unavailable |
| Transport      | disabled、loading audio、ready、playing、paused、loop on/off、audio error                 |
| Practice panel | closed、open、Escape close、focus restore、content overflow                               |
| Zoom           | default、min、max、Popover open、keyboard、pinch commit                                   |
| Theme / locale | Light、Dark、zh-CN、en-US                                                                 |

## 技术栈与项目结构

- React 19、TypeScript、React Router、CSS Modules、container queries。
- `@base-ui/react` 提供 Menu / Popover 行为；`lucide-react` 提供图标。
- `@testing-library/react`、`user-event`、Vitest 覆盖组件行为。
- Playwright 覆盖真实 Browser 布局与核心旅程。

主要落点：

```text
packages/web-viewer/src/features/SheetLibrary.tsx
packages/web-viewer/src/features/SheetLibrary.module.css
packages/web-viewer/src/features/__tests__/SheetLibrary.test.tsx
packages/web-viewer/src/app/pages/ViewerPage.tsx
packages/web-viewer/src/app/pages/PageShell.module.css
packages/web-viewer/src/features/PlaybackWorkspace.tsx
packages/web-viewer/src/features/PlaybackWorkspace.module.css
packages/web-viewer/src/features/__tests__/PlaybackWorkspace.test.tsx
packages/web-viewer/src/components/ScoreViewer.tsx
packages/web-viewer/src/components/ScoreViewer.module.css
packages/web-viewer/src/components/__tests__/ScoreViewer.test.tsx
packages/app-i18n/src/locales/zh-CN.ts
packages/app-i18n/src/locales/en-US.ts
apps/web-demo/e2e/library.spec.ts
docs/features/contracts/sheet-library.md
```

## 命令

```bash
# 最小组件测试
pnpm vitest run packages/web-viewer/src/features/__tests__/SheetLibrary.test.tsx
pnpm vitest run packages/web-viewer/src/features/__tests__/PlaybackWorkspace.test.tsx
pnpm vitest run packages/web-viewer/src/components/__tests__/ScoreViewer.test.tsx

# i18n、类型与快速门禁
pnpm check:i18n
pnpm verify:fast

# Browser build 与真实旅程
pnpm demo:build
pnpm demo:test:e2e

# 共享 UI 的宿主回归
pnpm desktop:build
pnpm desktop:test:e2e

# 提交前
pnpm format:check
git diff --check
```

## 代码风格

- 使用 named export、双引号、语义 HTML 和 CSS Modules。
- 可选字段不存在时省略，不传 `undefined`。
- 用户可见文案只进入 `@zupulse/app-i18n`。
- UI 测试按 role / accessible name 查询，不断言内部组件名。
- 布局使用 route viewport 的 unnamed `@container` 与 semantic tokens，不直接消费 theme library
  原始色阶。使用 unnamed query 可避免 CSS Modules 分别哈希跨模块 container name。

## 测试策略

### 组件测试

- Library 主动作、收藏和 Menu 是三个可区分的交互。
- “删除 Treasure”只命中 Menu 中的一个动作。
- Enter / Space 打开主动作；Menu 支持键盘和 Escape。
- 空馆藏、搜索无结果、收藏无结果与清除条件互斥。
- Library-backed Viewer 不显示导入；standalone Viewer 仍显示打开。
- Transport 的核心 accessible controls 在 ready / disabled / error 状态一致。
- 练习面板和 Zoom Popover 支持 Escape 与焦点恢复。

### Browser E2E

使用 `Treasure.gp5` 在 390×844、620px、640px 和 1280×720 验证：

- `document.documentElement.scrollWidth <= document.documentElement.clientWidth`。
- Library 导入、搜索、清除搜索、打开 Viewer 的旅程可完成。
- Viewer 播放/暂停、打开练习设置和调整速度可完成。
- 顶部、Transport、Zoom 与面板的关键控件 bounding box 均位于视口内。
- 控制台无 error。

### 宿主回归

共享 UI 改动至少执行 Desktop build 与关键 E2E smoke。iPad 使用相同容器布局，若本机工具链可用则
执行 `pnpm ipad:web:build`；本轮不修改 Swift。

## 边界

### Always

- 先写用户视角失败测试，再实现对应垂直切片。
- 每个切片验证 Light、Dark、桌面、窄屏和键盘相关状态。
- 保持 `libraryScoreId`、Repository / Gateway、播放命令和持久化不变量。
- 行为验证完成后更新 Sheet Library Feature Contract。

### Ask first

- 修改 Repository / Bridge / playback schema。
- 新增依赖、全局 breakpoint 或基础 token。
- 取消 390px 支持或改变 P0 的主旅程。
- 把 P1 目录行重构、导入反馈或遥测提前并入 P0。

### Never

- 用水平滚动掩盖核心控件溢出。
- 用嵌套交互或点击事件模拟语义控件。
- 复制 Browser / Desktop / iPad 页面。
- 只靠颜色或图标表达动作和状态。
- 为响应式布局读取 `window.innerWidth` 并建立第二套 React 状态。

## P0 成功标准

- 390×844、620px、640px、1280×720 下 Library 与 Viewer 无页面级水平溢出。
- 390px 可完成搜索、打开 Viewer、播放/暂停、打开练习设置和调整速度。
- Library Score 主动作、收藏和管理 Menu 在 DOM 与 Accessibility tree 中互为同级。
- 搜索无结果明确显示搜索上下文、馆藏总数和一键恢复动作。
- Library-backed Viewer 不再显示“导入曲谱”，播放是唯一实心主操作。
- Transport 和 Zoom 的窄屏控制全部位于视口内，并支持键盘、Escape 和焦点恢复。
- 组件测试、`pnpm check:i18n`、`pnpm verify:fast`、Browser build / E2E 和 Desktop build / smoke
  通过。
- Current Feature Contract 在行为验证后同步更新，不把目标状态提前写成当前事实。

## 风险与缓解

| 风险                                        | 影响 | 缓解                                                                  |
| ------------------------------------------- | ---- | --------------------------------------------------------------------- |
| 共享 CSS 修改影响 Studio 或 App Header      | 高   | Library 使用局部 class；Viewer header 只做窄范围覆盖；真实路由回归    |
| enabled / disabled Transport 响应式结构漂移 | 高   | 抽取共同 presentation helper；同一测试矩阵覆盖两种状态                |
| Menu / Popover 焦点行为不完整               | 高   | 使用现有 Base UI primitive；role/name + user-event + Browser 键盘验证 |
| 390px 适配靠隐藏过多信息                    | 中   | 固定控制优先级；低频能力移入设置但不删除                              |
| P0 与 P1 卡片重构重复劳动                   | 中   | P0 只固定语义组件边界，P1 复用主动作与 Menu，不绑定卡片结构           |
| Desktop 缺少练习摘要导致未来“继续”不一致    | 中   | P0 不实现“继续”；P1 设计前先解决或明确平台差异                        |

## 已确认实施决策

1. 390px 是 Browser / Split View 的正式最窄核心旅程宽度。
2. Library-backed Viewer 在所有宽度移除页内“导入曲谱”，不只在窄屏隐藏。
3. P0 完成后独立发布，再进入 P1 目录行工作。
