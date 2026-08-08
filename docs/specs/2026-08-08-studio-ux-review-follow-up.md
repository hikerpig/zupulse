---
status: approved
---

# Studio UX Review 跟进设计

## 背景

2026-08-08 的 Browser 实测确认 Studio 桌面主流程可用，但存在两个布局阻断和两类高频认知摩擦：

- `390 × 844` 下，乐谱自然高度把分析区推到视口外，而 route viewport 禁止页面滚动，分析区不可达。
- `1280 × 568` 下，右侧 editor 内容高于主工作区，但 editor 没有滚动宿主，底部操作被裁切。
- 初次进入包含未解决片段的分析文档时默认显示全部结果，用户需要主动发现待确认筛选。
- 中文界面的结构化和弦选项暴露 `major`、`add` 等内部枚举，并混入无必要的英文装饰标题。

运行时代码、测试、`DESIGN.md` 和 `docs/features/contracts/harmony-analysis.md` 高于本文。

## 目标

1. 窄屏 Studio 同时保留可访问的乐谱预览与分析工作区，各自具有明确滚动边界。
2. 任意支持的桌面高度下，右侧 editor 的全部操作都可通过滚动到达。
3. 存在未解决片段时，首次进入工作区直接聚焦待确认结果；没有未解决片段时仍显示全部。
4. 中文界面不暴露内部和弦枚举，也不使用无索引价值的英文 kicker。

## 非目标

- 不改变 Harmony Analysis Document、Correction、算法、预览或导出语义。
- 不新增依赖、全局状态、路由参数或持久化偏好。
- 不增加批量确认、自动接受或新的快捷键。
- 不重设计 Viewer、Library 或 App Header。

## 方案

### 响应式布局

- `> 960px` 保持当前可拖动左右分栏。
- `<= 960px` 改为固定工作区内的上下两行；乐谱与分析 pane 各自滚动，分隔条隐藏。
- 不让乐谱按完整自然高度撑开 route，也不把滚动责任转移给被锁定的 App 根容器。
- 右侧 range editor 在桌面和窄屏都声明 `min-height: 0` 与 `overflow: auto`。

### 默认任务聚焦

- `HarmonyRangeWorkspace` 首次挂载时：有 unresolved range 则默认使用 `unresolved` filter，否则使用 `all`。
- 用户后续选择筛选后不再被数据更新自动改写。
- 当前选择不符合筛选时，沿用现有“临时显示选中项”行为。

### 本地化与视觉层级

- 内部 `ChordKind` 与 degree operation value 保持不变，仅本地化 option label。
- 删除主分析区、片段区、编辑器和浮层里重复标题含义的 kicker；保留真实标题和语义状态。
- 和弦符号、N.C.、用户曲名及 BPM 等标准内容不翻译。

## 验收标准

1. `390 × 844` 下，乐谱预览和“和弦分析”区域都在 Studio 固定工作区中可达，页面不产生约万像素高的乐谱 pane。
2. `1280 × 568` 下，右侧 editor 的 `scrollHeight > clientHeight` 时可以垂直滚动，底部操作不被永久裁切。
3. 含 unresolved range 的文档首次显示待确认列表；无 unresolved range 时显示全部列表。
4. 筛选、列表方向键、Enter 进入 editor、Escape 返回列表的现有行为保持。
5. 中文结构化构建器显示面向用户的和弦类型与度数操作名称；英文界面显示自然英文标签。
6. Light/Dark 共用现有 semantic tokens，不新增颜色、阴影、依赖或第二滚动实现。

## 验证

```bash
pnpm vitest run packages/web-viewer/src/__tests__/styles.test.ts packages/web-viewer/src/features/harmony-studio
pnpm check:i18n
pnpm demo:test:e2e -- --grep "Studio"
pnpm verify:fast
pnpm format:check
git diff --check
```
