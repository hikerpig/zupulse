# Library P1 信息架构优化设计

## 背景

P0 已完成核心可用性（390px 无溢出、主动作/收藏/菜单语义分离、空状态互斥、Library-backed Viewer 移除导入入口）。当前 Library 仍是"能用的列表"，但距离"好用的排练目录"还有以下差距：

1. 三列布局切断了"标题 ↔ 练习位置"的语义关联，扫描效率低。
2. 主动作文案与标题争夺视觉权重，主次不分明。
3. 搜索/筛选不吸顶，长列表滚下后无法快速再筛选。
4. 编辑入口用固定右下角浮层，与删除模式不一致。
5. Format 标签信息太弱，但它决定 Studio 可用性。

本文定义 P1 的产品和工程设计。

## 已确认方向

- 继续共享 `packages/web-viewer` 的 Library UI，不复制页面。
- 390px–620px–1280px 三档视口均需覆盖。
- 使用现有 `@base-ui/react`、`lucide-react`、semantic tokens 与 container queries，不新增依赖。
- 排序仍使用原生 `select`（P3 再升级）。
- 不修改 `LibraryScoreSummary`、Repository、Bridge 或播放领域命令。

## 目标

让 Library 从"列表"升级为"排练目录"：

```text
核心旅程：
进入 Library → 一眼定位目标曲谱 → 确认练习状态 → 打开或继续练习

信息架构目标：
- 标题为绝对视觉焦点
- 练习状态与标题强关联
- 搜索/筛选始终可达
- 编辑与删除模式一致
- Format 能力可见
```

## 非目标

- 不增加标签、文件夹、批量管理、分页、虚拟列表。
- 不实现"继续练习"实验和遥测。
- 不修改谱面渲染、播放引擎、Loop 数据或练习持久化。
- 不把排序改为 base-ui Select（留到 P3）。

## P1 详细设计

### 1. 行结构重构：三列 → 两列

把练习状态从独立列并入标题的 meta 行，让"哪首曲子"和"练到哪了"在视觉上紧密关联。

**宽屏结构（>620px）：**

```text
┌─────────────────────────────────────────────────────────────────────┐
│ ■ [标题] · [作者]                                                    │
│ [练习chip] · [格式色条] · [导入日期] · [时长]         [★] [⋮]         │
├─────────────────────────────────────────────────────────────────────┤
```

**窄屏结构（≤620px）：**

```text
┌──────────────────────────────────┐
│ ■ [标题] · [作者]                │
│ [练习chip] · [格式] · [日期] [⋮] │
├──────────────────────────────────┤
```

**HTML 语义：**

```tsx
<li key={score.id} className={styles.libraryRow}>
  <button className={styles.libraryOpenAction} type="button" onClick={() => onOpen(score.id)}>
    <span className={styles.libraryIdentity}>
      <span className={`${styles.libraryFormatBar} ${score.format === "musicxml" ? styles.libraryFormatMusicxml : ""}`} aria-hidden="true" />
      <div className={styles.libraryTitleRow}>
        <strong>{score.title}</strong>
        {score.artist ? <span className={styles.libraryArtist}>{score.artist}</span> : null}
      </div>
      <span className={styles.libraryMeta}>
        {score.practice.lastPosition || score.practice.hasLoop ? (
          <span className={`${styles.libraryPracticeChip} ${score.practice.hasLoop ? styles.libraryPracticeChipLoop : styles.libraryPracticeChipActive}`}>
            <span className={styles.libraryPracticeDot} aria-hidden="true" />
            {score.practice.lastPosition ? (
              t("practicePosition", { measure: score.practice.lastPosition.measureIndex + 1 })
            ) : t("savedLoop")}
            {score.practice.hasLoop && score.practice.lastPosition ? t("loopSuffix") : ""}
          </span>
        ) : null}
        <span>{score.format.toUpperCase()}</span>
        <span>{formatRelativeDate(score.importedAt, locale, {...})}</span>
        {score.durationMs ? <span>{formatDuration(score.durationMs)}</span> : null}
      </span>
    </span>
    <ArrowRight className={styles.libraryActionIndicator} aria-hidden="true" />
  </button>
  <div className={styles.libraryRowActions}>
    <IconButton ...>
      <Star ... />
    </IconButton>
    <MenuRoot>...</MenuRoot>
  </div>
</li>
```

**关键点：**

- `grid-template-columns: minmax(0, 1fr) auto`，两列结构。
- 行高压到 `60px`，hover 时略微增高到 `64px` 展示完整 meta。
- Format 用行首 4px 色条 + 文字标签双重编码。
- 练习状态用 chip（圆点 + 文本），放在 meta 行最前面。

### 2. 主动作 CTA：去掉冗余文案，改用 hover 箭头

**问题：** 当前主动作按钮右侧又渲染了一遍"继续/打开"文本，与标题争夺视觉权重。

**方案：**

- 去掉 `libraryPrimaryAction` 文本。
- 在按钮右侧放置 `ArrowRight` 图标，常态下 `opacity: 0.3`，hover/focus 时 `opacity: 1` + 轻微位移。
- `aria-label` 保持"打开/继续 {title}"不变。

**交互状态：**

```text
常态：[标题 · 作者] · [meta...]      → (faint)
hover：[标题 · 作者] · [meta...]      → (solid, shift right 4px)
focus：[标题 · 作者] · [meta...]      → (solid, outline ring)
```

### 3. 搜索/筛选区吸顶

**问题：** 当前 `libraryControls` 是普通流式区块，长列表滚动后无法快速再筛选。

**方案：**

- `libraryContextBar` + `libraryControls` 一起做成 sticky top。
- 使用 `position: sticky; top: 0; z-index: var(--z-index-surface-raised)`。
- 背景保留 backdrop-filter blur，确保滚动内容可见。
- `.libraryList` 内部滚动，不触发页面级滚动。

**注意：** 吸顶区域高度可能变化（导入按钮在窄屏换行），需确保 `top: 0` 能正确吸附。

### 4. 编辑入口改为 Dialog

**问题：** 当前编辑用固定右下角浮层，与删除模式不一致，窄屏易误操作。

**方案：**

- 删除 `libraryEditor` 的 fixed 定位样式。
- 编辑改为与删除一致的 `DialogRoot` / `DialogPortal` 模式。
- Dialog 打开后聚焦首项（title 输入框），Escape 关闭并恢复焦点到触发按钮。
- Dialog 包含：标题输入、作者输入、保存按钮、取消按钮。

**一致性：**

```text
编辑流程：点击"编辑" → Dialog 打开 → 编辑 → 保存/取消 → Dialog 关闭
删除流程：点击"删除" → Dialog 打开 → 确认 → 删除/取消 → Dialog 关闭
```

### 5. 当前打开曲谱的回写指示

**问题：** 用户从 Viewer 点导航回 Library 时，无法快速定位刚才在看的曲谱。

**方案：**

- 在 `LibraryPage` 中解析当前路由的 `libraryScoreId`。
- 把 `currentScoreId` 传给 `SheetLibrary`。
- 匹配的行添加左侧 2px accent 色条 + `aria-current="true"`。
- 视觉上用 `border-left: 2px solid var(--accent-primary)` 表达"当前活跃"。

**实现路径：**

```tsx
// LibraryPage.tsx
const currentScoreId = pathname.match(/^\/(?:viewer|studio)\/([^/]+)$/)?.[1];

// SheetLibrary.tsx
export function SheetLibrary({ ..., currentScoreId }: { ...; currentScoreId?: string }) {
  // 在渲染行时判断
  const isCurrent = score.id === currentScoreId;
}
```

### 6. Stats Bar 信息密度提升

**问题：** 当前只显示 `0 / 12`，空间利用率低。

**方案：**

- 显示更丰富的摘要：`{total} 首曲谱 · {withLoop} 个 Loop · {lastPracticed}`。
- `lastPracticed` 取最近一次练习的相对时间（如"2 小时前"）。
- 保持 monospace 字体和 tertiary 颜色，不喧宾夺主。

**文案示例：**

```text
12 首曲谱 · 3 个 Loop · 最近练习 2 小时前
```

## 交互与数据状态矩阵

| 表面          | 必须覆盖的状态                                                               |
| ------------- | ---------------------------------------------------------------------------- |
| Library       | loading、empty、populated、query no-results、favorites no-results、error     |
| Library Score | default、hover、focus、favorite、current、menu open、editing、delete confirm |
| Controls      | sticky、scrolled、search active、favorites active、sort active               |

## 技术栈与项目结构

- React 19、TypeScript、React Router、CSS Modules、container queries。
- `@base-ui/react` 提供 Dialog 行为；`lucide-react` 提供图标。
- `@testing-library/react`、`user-event`、Vitest 覆盖组件行为。

主要落点：

```text
packages/web-viewer/src/features/SheetLibrary.tsx
packages/web-viewer/src/features/SheetLibrary.module.css
packages/web-viewer/src/features/__tests__/SheetLibrary.test.tsx
packages/web-viewer/src/app/pages/LibraryPage.tsx
packages/app-i18n/src/locales/zh-CN.ts
packages/app-i18n/src/locales/en-US.ts
docs/features/contracts/sheet-library.md
```

## 命令

```bash
pnpm vitest run packages/web-viewer/src/features/__tests__/SheetLibrary.test.tsx
pnpm check:i18n
pnpm verify:fast
pnpm demo:build
pnpm demo:test:e2e
```

## 代码风格

- 使用 named export、双引号、语义 HTML 和 CSS Modules。
- 用户可见文案只进入 `@zupulse/app-i18n`。
- UI 测试按 role / accessible name 查询，不断言内部组件名。
- 布局使用 route viewport 的 unnamed `@container` 与 semantic tokens。

## 测试策略

### 组件测试

- Library 行结构为两列，练习状态在 meta 行内。
- 主动作按钮 hover 显示箭头，无"继续/打开"文本。
- 搜索/筛选区在滚动时保持可见（sticky）。
- 编辑入口打开 Dialog，Escape 关闭并恢复焦点。
- 当前打开曲谱行有 `aria-current="true"` 和 accent 色条。

### Browser E2E

在 390×844、620px、1280×720 验证：

- 无页面级水平溢出。
- 搜索、筛选、打开 Viewer 旅程可完成。
- 滚动列表时搜索/筛选区保持可见。
- 编辑和删除流程一致。

## 边界

### Always

- 先写用户视角失败测试，再实现对应垂直切片。
- 每个切片验证 Light、Dark、桌面、窄屏和键盘相关状态。
- 保持 `libraryScoreId`、Repository / Gateway、播放命令和持久化不变量。
- 行为验证完成后更新 Sheet Library Feature Contract。

### Ask first

- 修改 Repository / Bridge / playback schema。
- 新增依赖、全局 breakpoint 或基础 token。
- 把排序改为 base-ui Select（留到 P3）。

### Never

- 用水平滚动掩盖核心控件溢出。
- 复制 Browser / Desktop / iPad 页面。
- 只靠颜色或图标表达动作和状态。

## P1 成功标准

- Library 行结构从三列改为两列，练习状态并入 meta 行。
- 主动作按钮无"继续/打开"文本，hover 显示箭头。
- 搜索/筛选区在列表滚动时保持可见。
- 编辑入口使用 Dialog，与删除模式一致。
- 当前打开曲谱行有视觉指示（accent 色条 + `aria-current`）。
- Stats bar 显示更丰富的摘要信息。
- 组件测试、`pnpm check:i18n`、`pnpm verify:fast`、Browser build / E2E 通过。
- Current Feature Contract 在行为验证后同步更新。

## 风险与缓解

| 风险                              | 影响 | 缓解                                          |
| --------------------------------- | ---- | --------------------------------------------- |
| 两列布局在极窄宽度溢出            | 高   | container query 控制断点；meta 行允许换行收缩 |
| sticky 区域高度变化导致吸附不稳定 | 中   | 使用 `top: 0` + 固定最小高度；测试滚动行为    |
| Dialog 打开/关闭的焦点管理不完整  | 中   | 使用 base-ui Dialog 的 focus management       |
| 当前曲谱指示与收藏状态冲突        | 低   | 色条位置在最左侧，与收藏图标无视觉重叠        |
