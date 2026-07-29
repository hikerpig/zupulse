---
status: implemented
---

# Viewer / Studio 谱面可读性与宽度模式设计

## 背景

HIK-6 聚焦 Viewer 与 Studio 的谱面阅读效率。当前共享 `ScoreViewer` 已提供 `− / 百分比 / +`、
窄屏 Popover 和双指缩放，但实际使用仍有三个问题：

1. 谱面、工具栏字号和间距偏大，单位视口内的有效信息不足。
2. Viewer 在宽屏中把谱面铺满整个工作区，阅读长谱表时视线移动距离过大。
3. Studio 的缩放控件只更新百分比，不更新 alphaTab 谱面。

第三项已有明确代码证据：Viewer runtime 在 `createDefaultOpenSession` 中读取
`data-score-zoom` 并注册 `attachScoreZoomCommit`；Studio runtime 调用
`createViewerAlphaTabSettings(scrollElement)` 时没有传入当前缩放，也没有注册或清理同一事件监听。
因此本轮先修复 runtime 接线，再调整视觉规格，不能把“按钮看起来可点击”当作缩放已完成。

本设计以 Viewer 约 8/10、Studio 约 9/10 的高密度工作台为目标。谱面保持最亮、最安静，新增控制
必须服从 `DESIGN.md` 的乐谱优先、单一滚动宿主和紧凑但不拥挤原则。

## 已确认方向与工程假设

- Browser、Desktop 与 iPad 继续共享 `packages/web-viewer` 的 React UI，不复制宿主实现。
- Viewer 与 Studio 共用缩放范围、步长、宽度模式、文案和持久化规则。
- 默认“舒适宽度”的上限为 `960px`；它是剩余谱面工作区内的阅读面上限，不是整个窗口宽度。
- 桌面端记住宽度模式；窄屏固定适应可用宽度，不显示没有实际价值的全宽切换。
- 缩放范围调整为 `50%–200%`，步长 `10%`，默认 `100%`。现有 `75%` 下限随本轮规格更新。
- 缩放继续通过 alphaTab `display.scale` 和 `updateSettings()` 触发重排，不用 CSS transform 作为最终状态。
- 不新增依赖，不改变 Library、Playback、Practice Sidecar、Harmony Analysis Document、Bridge 或数据库。
- 本轮不引入遥测框架；`960px` 是经本地真实谱面验收确认的产品默认值。

## 目标

让用户在 Viewer 与 Studio 中得到一致、可感知且可恢复的谱面阅读控制：

```text
打开谱面
→ 默认进入居中的舒适阅读宽度
→ 使用 − / + / 100% / 快捷键调整谱面密度
→ 必要时切换全宽
→ 缩放或切换宽度后继续从原播放位置、选区或视口锚点阅读
```

成功以真实 alphaTab 重排、稳定阅读锚点和可自动化验证的布局为准，不以百分比文案或按钮按压反馈
为准。

## 非目标

- 不实现浏览器全屏、打印分页、横向长卷、谱表虚拟化或新的 Score Navigation Mode。
- 不修改乐谱内容、作者换行、空谱表隐藏或 alphaTab 排版算法。
- 不新增“适应宽度”第三种持久模式；首版只有持续的“舒适宽度 / 全宽”二态。
- 不在移动端显示宽度切换，也不把移动端双指缩放替换为按钮操作。
- 不让宽度切换改变缩放值、播放位置、Loop、Page Turn 模式或 Harmony Selection。
- 不以 toast 作为关键状态事实；按钮的 pressed state、Tooltip 和可读名称必须独立表达当前模式。

## 交互设计

### 1. 舒适宽度与全宽

桌面端首次打开 Viewer 或 Studio 时使用 `comfortable`：

- 阅读面在剩余谱面工作区水平居中。
- `max-width: 960px`，可用宽度不足时退化为 `width: 100%`。
- 工作区两侧至少保留现有 frame padding；不为达到留白制造横向滚动。
- 约从 `1440px` 可用谱面宽度开始明显出现居中留白；超宽屏仍保持上限。

`full` 使用剩余谱面工作区的全部宽度。切换按钮属于“视图模式”，不得命名为“全屏”：

| 当前状态      | 按钮动作名称   | `aria-pressed` | 结果                    |
| ------------- | -------------- | -------------- | ----------------------- |
| `comfortable` | `切换为全宽`   | `false`        | 阅读面占满剩余工作区    |
| `full`        | `恢复舒适宽度` | `true`         | 阅读面回到 960px 并居中 |

按钮使用 `lucide-react` 的横向扩展/收拢语义图标。宽容器直接显示在谱面视图控制组；空间不足时进入现有
Popover。`max-width: 620px` 的容器固定 `comfortable` 的适应屏幕结果，不显示切换入口，也不覆盖
用户在桌面端保存的偏好。

Studio 的宽度以可拖动分栏左侧的剩余宽度计算，不以窗口计算。分隔条移动后阅读面重新居中；当左栏
本身小于 `960px` 时两种模式可以视觉相同，但偏好和值不得被重置。

### 2. 缩放控件

桌面宽容器保留一个紧凑控制组：

```text
[−] [100%] [+]
```

- `− / +` 每次改变 `10%`，范围 `50%–200%`，到边界后禁用。
- 百分比是按钮，不再只是 `output`；点击恢复 `100%`，Tooltip 和 accessible name 为“重置缩放”。
- 每次操作只提交一次 zoom commit；百分比、禁用态和真实 alphaTab 重排必须来自同一 committed 值。
- `Ctrl/Cmd +`、`Ctrl/Cmd -`、`Ctrl/Cmd 0` 分别放大、缩小和复位；表单输入和系统浏览器快捷键不被
  无条件劫持。
- 双指移动期间只做轻量预览，手势结束提交一次；单指仍交给唯一的谱面滚动宿主。
- 触控设备维持至少 `44×44px` 命中区；精确指针的视觉按钮可收敛到 `32px`，但焦点环和可读名称
  不得缩减。

容器较窄时只显示现有“调整谱面缩放”图标，由 Popover 提供相同的减小、复位和放大动作。Viewer
与 Studio 不得渲染两套行为不同的缩放组件。

### 3. 缩放与重排锚点

缩放和宽度变化会触发 alphaTab 重排。重排前后按以下优先级恢复位置：

1. 播放中或存在播放头时，以当前播放谱表行为锚点。
2. Studio 存在 Harmony Selection 时，以选中区间所在谱表行为锚点。
3. 其他情况使用视口中心最近的完整谱表行。
4. bounds 暂不可用时才回退到当前相对滚动比例。

Page Turn 必须继续由现有 `ScoreNavigationCoordinator` 在 render generation 完成后重建 Screen Score
Page，不能由缩放控件直接写页码。旧 generation 的回调不得覆盖最新宽度或缩放结果。

### 4. 密度调整

本轮同时收敛界面 chrome，但不通过缩小乐谱内容伪造高密度：

- Viewer Transport 桌面视觉高度目标从当前 `52px` 收敛到约 `44px`。
- 常规桌面图标按钮视觉尺寸 `32px`，图标 `16px`；触控/窄屏保持至少 `44px` 命中区。
- 控制组内部间距 `4px`，组间 `8–12px`。
- UI 辅助文字以 `13–14px` 为主，次要状态与数值为 `12px`；高频数值继续使用 tabular numerals。
- Score frame padding 使用现有语义 token 对齐，桌面目标 `6–8px`，窄屏 `4px`。
- alphaTab 字体资源由 Viewer 与 Studio 共用同一配置，并在真实 fixture 验收后整体下调一档：
  标题 `32→28px`、副标题 `20→18px`，歌词、谱号标注、指法、方向和编号谱等常用字体下调
  `1–2px`；不得由宿主各自覆盖出不同的谱面密度。

低频设置继续进入现有 Popover / ContextPopup。Viewer 首层只保留播放、速度、导航、Loop、缩放和
宽度模式；Studio 的编辑主操作不因加入视图控制而移动或失焦。

## 状态与持久化

新增 `ScoreWidthMode = "comfortable" | "full"` 到 App Store，使用独立设备偏好键
`zupulse-score-width-mode`。读取失败或值非法时回退 `comfortable`。

缩放继续使用 `zupulse-score-zoom`，但状态提交收敛为单一 helper：

```ts
export function commitScoreZoom(zoom: number): number {
  const committed = clampScoreZoom(zoom);
  persistScoreZoom(committed);
  return committed;
}
```

React store 负责可观察 UI 偏好，Viewer / Studio runtime 负责把 committed 值应用到各自当前 alphaTab
实例。不得用仅更新 React store 的测试替代 runtime 测试。

### Runtime 接线

- `createDefaultOpenSession` 保持读取 `data-score-zoom`、注册 `attachScoreZoomCommit` 并在 destroy
  清理。
- `createStudioScoreRuntime` 必须同样读取 `data-score-zoom`，将初值传给
  `createViewerAlphaTabSettings`，注册同一 commit listener，并在成功、初始化失败和 destroy 三条
  路径完整清理。
- `attachScoreZoomCommit` 在应用设置前捕获阅读锚点，在最新 render generation 后恢复锚点。
- 宽度模式改变可用布局宽度后，由同一 render / navigation 生命周期重建，不创建第二个 resize
  协调器。

若实现过程中发现 `document` 级事件会让并存或切换中的 runtime 同时消费提交，应先把现有事件收窄
为 session-scoped runtime port，再继续 UI；不得靠查询全局 `#alpha-tab` 或忽略旧 listener 掩盖竞态。

## 交互与数据状态矩阵

| 表面          | 必须覆盖的状态                                                                      |
| ------------- | ----------------------------------------------------------------------------------- |
| 宽度模式      | comfortable、full、非法持久值、窄屏强制适应、Studio 分栏小于 960px                  |
| Zoom          | default、min、max、reset、Popover、keyboard、pinch preview、pinch commit            |
| Runtime       | Viewer ready/destroy、Studio ready/destroy、初始化失败、快速路由切换、旧 generation |
| Navigation    | Following、Detached、Page Turn、播放头锚点、无 bounds 回退                          |
| Studio        | 无选择、Harmony Selection、分隔条拖动、预览重渲染、编辑焦点                         |
| Theme / input | Light、Dark、精确指针、触控、`prefers-reduced-motion`、zh-CN、en-US                 |

## 技术栈与项目结构

- React 19、TypeScript、Zustand、CSS Modules、container queries。
- alphaTab 1.8.4 `display.scale`、`updateSettings()` 与 render/bounds 事件。
- `@base-ui/react` Popover、`lucide-react` 图标、`@zupulse/app-i18n` 文案。
- Vitest、Testing Library 与 Playwright。

主要落点：

```text
packages/web-viewer/src/app/appStore.tsx
packages/web-viewer/src/app/__tests__/appStore.test.ts
packages/web-viewer/src/components/ScoreViewer.tsx
packages/web-viewer/src/components/ScoreViewer.module.css
packages/web-viewer/src/components/__tests__/ScoreViewer.test.tsx
packages/web-viewer/src/scoreZoom.ts
packages/web-viewer/src/viewerApp.tsx
packages/web-viewer/src/__tests__/viewerApp.test.ts
packages/web-viewer/src/studio-score-runtime.ts
packages/web-viewer/src/__tests__/studio-score-runtime.test.ts
packages/web-viewer/src/score-navigation/*
packages/app-i18n/src/locales/zh-CN.ts
packages/app-i18n/src/locales/en-US.ts
apps/web-demo/e2e/library.spec.ts
docs/features/contracts/viewer-playback-navigation.md
DESIGN.md
```

实现只应修改实际需要的文件；以上是证据与候选落点，不是要求一次性触碰全部路径。

## 代码风格

- 使用 named export、双引号、语义 HTML、CSS Modules 和运行时 semantic tokens。
- 可选字段不存在时省略，不传 `undefined`。
- 用户可见文案进入 `@zupulse/app-i18n`，测试按 role / accessible name 观察结果。
- alphaTab 对象只留在 runtime/adapter 边界；React 组件只提交应用级值。

```ts
export type ScoreWidthMode = "comfortable" | "full";

export function readScoreWidthMode(value: string | null): ScoreWidthMode {
  return value === "full" ? "full" : "comfortable";
}
```

## 测试策略

### 单元与组件

- App Store：默认值、合法持久值、非法值回退、Zoom `50%–200%` clamp。
- ScoreViewer：减小、放大、复位、边界禁用、快捷键、Popover 焦点恢复、pinch 单次提交。
- Viewer runtime：初始 zoom、真实 `settings.display.scale` 更新、一次 `updateSettings()`、destroy 清理。
- Studio runtime：与 Viewer 相同的初始值、事件消费和三条清理路径，直接覆盖本 issue 的已知缺口。
- Navigation：重排后按 staff-system anchor 恢复；bounds 缺失时才按滚动比例回退。
- CSS contract：阅读面 `max-width`、居中、全宽覆盖、唯一 scroll host 和容器查询。

### 真实浏览器

使用真实 GP fixture 在 `1280×720`、`1440×900`、`1920×1080`、`2560×1440` 与 `390×844` 覆盖：

1. Viewer 首次打开的舒适宽度和水平居中。
2. 全宽切换、刷新恢复和窄屏隐藏。
3. `− / + / 100% / Ctrl/Cmd 0` 均造成可观测的 alphaTab bounds 变化。
4. Viewer 与 Studio 使用同一步长和范围。
5. Studio 分栏调整后宽度以左栏计算。
6. 缩放后播放头、Page Turn 和 Harmony Selection 保持在合理视口位置。

视觉验收必须检查 Light、Dark 和真实乐谱，不用 empty state 的盒模型代替谱面结论。

## 命令

```bash
# 最小测试
pnpm vitest run packages/web-viewer/src/app/__tests__/appStore.test.ts
pnpm vitest run packages/web-viewer/src/components/__tests__/ScoreViewer.test.tsx
pnpm vitest run packages/web-viewer/src/__tests__/viewerApp.test.ts
pnpm vitest run packages/web-viewer/src/__tests__/studio-score-runtime.test.ts
pnpm vitest run packages/web-viewer/src/score-navigation

# 文案、设计与快速门禁
pnpm check:i18n
pnpm check:design
pnpm verify:fast

# Browser / Desktop build 与真实旅程
pnpm demo:build
pnpm demo:test:e2e
pnpm desktop:build
pnpm desktop:test:e2e

# 提交前
pnpm format:check
git diff --check
```

## 实施顺序

1. 先写 runtime 失败测试，补齐 Studio 初始 zoom、commit 和 cleanup，使两端真实重排。
2. 增加 width mode 偏好、持久化与组件测试，再实现舒适宽度 / 全宽布局。
3. 加入 reset 和快捷键，统一按钮、Popover、pinch 的单一 commit 路径。
4. 用现有 navigation generation 实现 staff-system anchor 恢复，并覆盖 Page Turn / Studio Selection。
5. 收敛 desktop chrome 密度，完成多视口、双主题和真实 fixture 视觉验收。
6. 验证后更新 Current Feature Contract 与 `DESIGN.md` 的长期宽度和密度规则。

每一步先跑最小测试；步骤 1–4 完成后跑 `pnpm verify:fast`，最终再跑与宿主风险相称的 build / E2E。

## 边界

- **始终执行**：测试先行；Viewer / Studio 同构；维持唯一谱面滚动宿主；真实 alphaTab 重排验证；
  键盘、焦点、窄屏和清理路径覆盖；行为验证后更新 Current 文档。
- **需要先询问**：新增依赖；改变 alphaTab 版本；修改持久化 schema、Bridge、导航 ADR；删除或缩减
  已确认的宽度/缩放验收标准。
- **绝不执行**：用 CSS transform 作为 committed zoom；持久化滚动位置或 Page Turn 页码；把
  alphaTab runtime 放入 React store；用全局 DOM 查询掩盖 session 生命周期；删除失败测试来通过门禁。

## 验收标准

1. `1920px` 与 `2560px` Viewer 首次打开时，阅读面不超过 `960px` 且在可用谱面工作区居中。
2. 桌面端可一键切换舒适宽度 / 全宽，刷新后保持；`620px` 以下不显示切换且无横向溢出。
3. Viewer 与 Studio 的 `− / + / 复位 / 快捷键 / pinch` 都更新百分比并触发真实 alphaTab 重排。
4. 缩放范围为 `50%–200%`、步长 `10%`，边界禁用态、持久值和运行时 scale 始终一致。
5. Studio 不再出现“数值变化但谱面不动”；初始化失败、销毁和快速路由切换后没有残留 listener。
6. 宽度或缩放变化后，播放位置、Page Turn 书面锚点、Loop overlay、Harmony Selection 和编辑焦点
   不丢失；旧 render generation 不覆盖新状态。
7. Studio 宽度以上一层分栏的剩余空间计算，分隔条变化不会重置宽度模式或缩放。
8. desktop chrome 更紧凑，但键盘焦点清晰，触控命中区不小于 `44×44px`，Light / Dark 信息层级同构。
9. Viewer / Studio 共用同一文案、图标语义、持久化规则和 runtime commit 契约。
10. 相关最小测试、`pnpm verify:fast`、Browser/Desktop build 和选定真实 E2E 均通过。

## 文档决策

本轮不新增 ADR。舒适宽度阈值、工具栏密度和二态视图模式都可局部替换，并遵循现有 alphaTab、
App Store 与 Score Navigation 边界。实现验证后更新
`docs/features/contracts/viewer-playback-navigation.md` 的 zoom / resize 行为和 `DESIGN.md` 的长期谱面
宽度规则；在此之前本文只描述 HIK-6 的目标状态，不覆盖当前运行时事实。
