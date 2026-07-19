# Studio 工作区调优设计规格

## 状态

- 状态：待确认。
- 日期：2026-07-19。
- 范围：Studio 布局、Harmony Selection、有效和弦预览与 Preview Transport。
- 事实边界：运行时代码、Zod schema、测试、Current ADR、`docs/architecture/harmony-analysis-system.md` 和根 `DESIGN.md` 高于本文。

## 目标

Studio 应成为全宽、高密度的桌面和弦校对工作台：用户能同时阅读乐谱和检查完整分析结果，谱面与右侧有效和弦区间双向定位，并在 alphaTab 中预览最终将导出的和弦符号。

本轮解决：

- 当前上下布局未充分利用横向空间，长分析内容难以完整浏览。
- 当前选择只是 Revision segment 的数组索引，不能与谱面或修正后的有效结果稳定联动。
- 当前 alphaTab 不显示 Effective Harmony Projection。
- 当前 Studio Preview Transport 只更新本地 React 状态，没有驱动 alphaTab。

## 术语

- **Analysis Revision segment**：不可变分析结果中的原始片段。
- **Effective Harmony Range**：Effective Harmony Projection 中一个连续区间，是列表、预览和编辑选择的直接对象。
- **Harmony Selection**：当前用于导航、高亮和指定编辑目标的临时 Score Written Range，不持久化为 Correction。

完整定义见 `CONTEXT.md` 与 `docs/architecture/glossary.md`。

## 桌面布局

- 顶部保留紧凑上下文栏；其下工作区占满剩余视口，不再受 `1440px` 页面最大宽度限制。
- 主工作区为可拖动双栏，默认左侧乐谱约 60%、右侧分析约 40%。
- 分隔条支持指针拖动、键盘调整和双击恢复默认值，并具有可访问名称与当前值。
- 左栏最窄 40%，右栏最窄 30%；实际实现可用等价像素下限保护内容可用性。
- 分栏比例作为设备级界面偏好保存，不写入 Harmony Analysis Document。
- 窄视口回退为上下结构并禁用分隔条；乐谱与分析区各自保持明确滚动边界。

右栏采用稳定分仓：

1. 顶部紧凑命令栏：保存状态、撤销/重做、重新分析、立即保存。
2. 默认收起的设置区：分析范围与标注目标。
3. 单行 Preview Transport：播放/暂停、速度和循环当前区间。
4. 占满剩余高度的主区域：有效和弦区间列表与编辑器分别滚动。
5. 底部固定导出操作条。

## 有效和弦区间列表

- 主列表以 Effective Harmony Projection 为事实源，不直接以 `activeRevision.segments` 为列表事实。
- 每项显示和弦或 N.C./未解决状态、音乐可读范围和来源。
- 位置优先显示小节与拍；非整数拍显示必要细分，原始 tick 只进入技术详情。
- 来源使用文本或结构表达：来源谱、算法、用户修正、未解决；不得只依赖颜色。
- 算法置信度在列表中显示可扫描等级，在详情中显示精确百分比与候选排序。
- 来源谱和用户修正不显示算法置信度；必要时在“底层分析”详情中查看被覆盖的 Revision 结果。
- 快速筛选包含“全部”“待确认”“已修正”。筛选不改变谱面上的完整预览。
- 从谱面选择一个被筛选隐藏的区间时，列表临时显示该项并说明其不符合当前筛选，不改选其他区间。

键盘行为：

- `ArrowUp` / `ArrowDown` 选择前后项，`Home` / `End` 跳至首尾，`PageUp` / `PageDown` 按可见页移动。
- `Enter` 从列表进入编辑器，`Escape` 从编辑器返回当前列表项。
- 表单输入期间不得劫持文字编辑快捷键。

## Harmony Selection 与双向联动

- 点击 alphaTab 音符或拍点，把 Beat 映射为 Score Written Moment，并选中覆盖该时刻的 Effective Harmony Range。
- 点击右侧区间，在 alphaTab 中高亮完整 Score Written Range。
- 谱面点击与拖选只负责导航和高亮，不隐式创建 Correction 或改变区间边界。
- 选择不保存数组索引；投影重建后，以选择焦点书面时刻重新解析包含它的区间。
- 拆分后选择包含焦点时刻的左侧新区间；合并后选择合并区间；重新分析后选择包含焦点时刻的新区间。
- 焦点时刻落入空白时优先选择后方最近区间，没有后方区间才选择前方最后一项。
- 用户直接点击未被任何有效区间覆盖的谱面位置时，不吸附、不创建修正；保留原选择、暂时取消范围高亮，并就地说明该位置没有有效和弦区间。
- 播放头位置不自动改变 Harmony Selection，避免播放时编辑器跳动。

滚动联动保持克制：

- 目标已可见时只更新高亮。
- 右侧选区对应谱表不可见时，将该谱表系统滚入乐谱栏中部。
- 谱面点击对应列表项不可见时，只滚到最近可见位置。
- 用户拖动分隔条或主动滚动期间不抢夺滚动；`prefers-reduced-motion` 下立即定位。

## alphaTab 和弦预览

- Studio 默认在乐谱上显示完整 Effective Harmony Projection，而不是只显示当前选择。
- 已确定 Chord Symbol 与 N.C. 进入临时预览；Unresolved Harmony 不伪造成和弦符号。
- 乐谱只表达当前有效音乐结果，不用颜色区分来源。来源、置信度、未解决原因和修正状态留在右侧详情。
- 预览投影必须能以 User Correction > source harmony > Analysis Revision 的优先级替换结果，不能在来源和弦旁重复叠加一个冲突标记。
- 预览是从 Managed Score Copy 与当前本地 Document 派生的临时渲染输入，不修改 Managed Score Copy，不保存 alphaTab runtime，也不改变正式导出边界。
- “显示和弦预览”是默认开启的设备级界面偏好。关闭时隐藏 Studio 派生标记；来源谱自身已有的和弦仍作为原谱内容显示。
- 只在已提交领域操作后刷新：选择候选、应用手动和弦、N.C.、重置、拆分、合并、移动边界，以及成功重新分析。结构化表单草稿变化不触发重渲染。
- 预览刷新尽量保持缩放、滚动位置与 Harmony Selection。
- 预览生成或重渲染失败时保留原始乐谱和右侧编辑能力，在乐谱栏就地显示可重试错误；保存与正式导出使用各自校验，不因预览失败被无条件阻断。

## Preview Transport

- Studio Preview Transport 驱动当前 Studio alphaTab 实例，不调用 Viewer 的 Playback Controller，也不读写 Practice Sidecar 或 Local Playback Resume。
- 支持播放/暂停、定位、临时速度和循环当前 Effective Harmony Range。
- Harmony Selection 与播放头互相独立。
- 区间循环采用局部书面试听：从所选 Score Written Range 起点到终点线性播放，不执行反复、D.C./D.S. 等结构跳转。
- 完整乐曲播放仍遵循来源谱的播放顺序。

## 运行时边界

- alphaTab 的命令式生命周期继续集中在 Viewer adapter/工作区边界，不散入普通表单组件。
- Studio runtime 暴露经过应用类型封装的 Beat 选择、范围高亮、滚动定位和 Transport 命令；React 页面不依赖 alphaTab DOM 结构。
- MusicXML 来源和弦投影属于可重建的 Studio Session 数据，不新增到持久化 Harmony Analysis Document。
- Harmony Selection、筛选、分栏比例、预览开关和 Transport 状态都不是 Harmony Analysis Document 字段。
- 书面位置与 alphaTab Beat 的映射必须使用现有精确 written-time 规则，不把不可表示位置四舍五入到最近拍点。

## 状态与降级

至少覆盖：loading、empty、error、analyzing、cancelled、stale、unresolved、source-derived、algorithm-derived、user-corrected、unsaved、saving、conflict、preview-render-error、audio-unavailable、playing、paused 和无选择。

- 分析期间继续显示旧 active Revision 的有效投影；最新 Job 成功后原子切换并重建选择。
- 预览错误、音频不可用和持久化错误分别就地表达，不合并成模糊 toast。
- Light、Dark、桌面、窄屏与键盘路径保持同构信息层级。

## 验收标准

1. 常规桌面视口中，Studio 主区占满可用宽高，乐谱与分析栏可独立滚动，长列表可访问到底部。
2. 分隔条可用鼠标、触控板和键盘调整，比例有边界、可复位并跨 Studio 页面打开恢复。
3. 右侧列表展示 Effective Harmony Range；Correction 拆分、合并或覆盖后列表和谱面仍一一对应。
4. 点击列表会高亮并按需滚动谱面；点击谱面 Beat 会选择正确的半开书面区间。
5. 选择在投影重建后按焦点书面时刻稳定恢复，不跳回索引 0。
6. alphaTab 默认显示完整有效和弦结果，修正提交后更新；未解决区间不生成虚假和弦。
7. 来源和弦被 Correction 覆盖时，预览只显示有效结果，不显示冲突重复标记。
8. Preview Transport 实际驱动 Studio alphaTab，局部循环不污染 Viewer 的练习或续播状态。
9. 快速筛选、列表键盘导航、焦点返回和 reduced-motion 行为可通过用户视角测试验证。
10. 预览渲染失败不会丢失修正或阻止继续编辑，并有就地错误与重试入口。

## 文档决策

本轮不新增 ADR。可拖动布局、交互联动和预览呈现均容易局部替换，且遵循现有 Studio、Effective Harmony Projection 与 Preview Transport 边界，不满足“难以逆转、反直觉、真实重大权衡”三个 ADR 条件。

## 工程执行契约

### 技术栈

- TypeScript 5.5、React 19、React Router、CSS Modules。
- alphaTab 1.8.4 公共模型与浏览器 API。
- Zod 领域边界、Vitest、Testing Library、Playwright 与 pnpm workspace。
- 不新增依赖，不修改 Harmony Analysis Document schema、数据库或 Bridge API。

### 命令

```bash
# Studio 与相关适配器的最小测试
pnpm vitest run packages/web-core/src/gp packages/web-viewer/src/app/pages/__tests__/StudioPage.test.tsx

# 快速项目门禁
pnpm verify:fast

# Browser 与 Desktop 构建
pnpm verify

# Browser 与 Desktop E2E
pnpm verify:e2e

# 文档与格式
pnpm check:context
pnpm check:design
pnpm format:check
```

### 项目结构

- `packages/web-core/src/gp`：alphaTab 公共 API 的类型封装与运行时适配器。
- `packages/web-core/src/harmony`：Effective Harmony Projection、书面时间与领域格式化。
- `packages/web-viewer/src`：独立 Studio runtime、会话编排与可复用展示逻辑。
- `packages/web-viewer/src/app/pages`：Studio 页面、CSS Modules 与用户视角测试。
- `apps/web-demo`、`apps/desktop-shell`：只负责把共享 runtime factory 接入各宿主。
- `docs/superpowers/specs`：本规格；`tasks`：获批计划和任务清单。

### 代码风格

使用 named export、双引号、`exactOptionalPropertyTypes` 兼容的条件属性，以及不泄漏 alphaTab 对象的应用类型：

```ts
export type HarmonySelection = {
  focus: ScoreWrittenMoment;
  range: ScoreWrittenRange;
};

export function selectContainingRange(
  ranges: readonly EffectiveHarmonyEntry[],
  focus: ScoreWrittenMoment,
): HarmonySelection | undefined {
  const entry = ranges.find(({ range }) => containsMoment(range, focus));
  return entry ? { focus, range: entry.range } : undefined;
}
```

跨 workspace 只使用包公开入口；只有 `__tests__` 与 `e2e` 引用测试框架。

### 测试策略

- 纯书面时间、选择恢复、投影视图模型与 alphaTab API 映射使用 Vitest 单元测试。
- Studio 页面布局、筛选、键盘、错误和焦点使用 Testing Library 用户视角测试。
- Browser 与 Desktop 至少各覆盖一次 Studio 打开、分栏、双向选择、预览修正和真实试听的 E2E 主路径。
- alphaTab 公共 API 能力属于首个高风险检查点；在大规模 UI 改写前用受控假对象与真实 fixture 验证。
- 每 2–3 个任务执行一次 `pnpm verify:fast`；最终执行 `pnpm verify` 与 `pnpm verify:e2e`。

### 边界

- **始终执行**：测试先行；精确书面时间映射；保持 Viewer/Studio 播放状态隔离；覆盖 Light、Dark、桌面、窄屏与键盘状态；更新活规格。
- **需要先询问**：新增依赖；改变持久化 schema、Bridge、导出格式语义或 Current ADR；因 alphaTab 限制缩减已确认验收标准。
- **绝不执行**：持久化 alphaTab runtime/DOM；把分栏或选择写入分析文档；用数组索引作为长期选择身份；预览时修改 Managed Score Copy；删除失败测试来通过门禁。

### 工程假设

- 设备偏好使用容错 `localStorage`，Browser 与 Desktop Renderer 共用实现。
- Studio 使用独立 alphaTab runtime，不创建 Viewer Playback Controller，也不接触练习 persistence。
- 临时和弦预览使用 alphaTab 公开模型/API 派生；若无法无重复地替换来源和弦或表达拍内边界，必须在首个检查点回到计划评审，不静默降级。
