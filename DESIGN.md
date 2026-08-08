---
status: current
last-reviewed: 2026-08-08
version: alpha
name: Zupulse
description: A dense, score-first digital music workstation for practice and harmony analysis.
theme-library: .design_library/zupulse-te-braun-theme
runtime-tokens: packages/web-viewer/src/styles/tokens.css
---

# Zupulse 设计契约

本文件是 Zupulse 当前产品设计语言的入口。它把长期稳定的视觉取舍、跨产品交互模式和各产品表面的
设计意图提供给设计者、开发者与 Agent，不复制完整 token 表，不描述 Feature 状态机，也不替代组件、
测试或运行时代码。

## Overview

Zupulse 是面向长期练习、乐谱查看与和声分析的桌面级数字音乐工作台。它更接近排练台、谱架与分析桌，
而不是专辑商店、SaaS 后台或营销型音乐网站：乐谱是安静的阅读面，控制区紧凑、精确、可扫描，品牌表达
服从工具效率。

| 维度             | 全局刻度 | 含义                               |
| ---------------- | -------- | ---------------------------------- |
| Design Variance  | 4/10     | 有辨识度，但布局服从工具效率       |
| Motion Intensity | 3/10     | 动效只服务反馈、状态与空间关系     |
| Visual Density   | 8/10     | 高密度工作台，以边界和秩序组织信息 |

Library 密度约 6/10，Viewer 约 8/10，Studio 约 9/10。这些刻度用于校准判断，不是运行时配置。

### Core principles

- **乐谱优先**：乐谱阅读面是视觉中心，保持最亮、最安静；禁止纹理、噪点、玻璃和品牌色铺底。
- **结构先于装饰**：优先使用布局、细边界和表面层级，不依赖卡片、阴影或颜色堆叠。
- **紧凑但不拥挤**：高密度来自稳定分仓、对齐和可扫描性，不来自缩小点击目标。
- **颜色有职责**：珊瑚色表达主操作和关键激活；语义色表达状态；signal 色只做音乐编码。
- **状态完整**：设计覆盖 loading、empty、error、disabled、focus、selected 等完整周期。
- **动效有含义**：每个动效表达反馈、状态变化、层级或空间关系，否则不添加。
- **双主题同构**：Light 与 Dark 共用信息层级，不把暗色主题做成另一套产品。

## Colors

- 暖中性灰构成基础表面，珊瑚色是唯一品牌主强调色。
- 珊瑚色实心填充只用于真正的主操作。active、pressed 等开启状态使用 accent 描边、soft 底色和前景着色，
  与主操作保持区分。
- 珊瑚色透明派生自 `--accent-primary`；组件不得引入第二个 coral 字面值。
- 绿、黄、红和蓝只承担明确状态语义；signal blue、pink、purple、yellow 只用于轨道、节拍、分层和参数编码。
- 同一产品表面通常不同时使用超过两种 signal 色，且 signal 色的视觉权重低于珊瑚色。Home 的工作区索引
  是显式例外。
- 组件只消费运行时 semantic token，不直接消费 theme library 的原始色阶。

精确颜色值、主题差异和派生关系由 `packages/web-viewer/src/styles/tokens.css` 独占；本文件只定义颜色职责。

## Typography

- Space Grotesk 用于界面主体；IBM Plex Mono 只用于参数、时间、速度和技术读数。
- 文案短、直接、功能导向；中文优先，不使用 emoji、口号或营销式修饰。
- `zh-CN` 界面的操作、区域和状态名称使用中文，不保留 Library、Practice、Tracks、Session、SETTINGS
  等英文装饰标题。品牌、文件格式、BPM、N.C.、和弦符号与用户内容保持原文。
- eyebrow 只用于确有索引价值的少量区域，不作为每个 section 的默认装饰。
- 数字变化频繁或需要纵向比较时使用 tabular numerals。
- Viewer 与 Studio 共用相同的谱面排印密度，不由宿主各自覆盖出不同的 alphaTab 字体体系。

精确字号、行高、字重和字体 fallback 由运行时 token 与 alphaTab 资源配置拥有。

## Layout

- 每个工作区只有一个主要滚动宿主。滚动条默认弱化，hover 时显现；内容随展开，避免嵌套滚动与无意义空白。
- 同一工作流中的标题栏、工具栏与内容面组成连续表面；相邻区域使用分隔线，不把每一层包装成独立卡片。
- 阅读面使用稳定且居中的 measure；工具工作区使用可预测的分栏与对齐，不让低频控件挤压主要内容。
- 响应式设计按任务优先级重排：窄屏可收起低频控件、把侧栏变为面板或把分栏变为上下结构，但不得仅按比例
  缩小桌面布局，也不得通过横向滚动隐藏关键动作。
- 触控尺寸、safe area 和窄视口溢出属于所有交互组件的基础约束。

## Elevation & Depth

- 内容区依靠纯色、边界与间距建立层级。
- 轻微材质只允许出现在 App Shell、Transport 和控制仓外壳。
- Dialog、Popover 和 Menu 才使用明确浮层与较高 elevation。
- 噪点、渐变、内高光与阴影必须克制，不得成为第一视觉印象。

## Shapes

- 基础控件使用小圆角，工作台分仓优先薄边界。
- 同一工具栏内的控件使用一致的基础高度和圆角；唯一主操作可以提高尺寸建立层级。
- pill 只用于标签、状态或连续选择，不作为普通按钮的默认形态。
- 圆形只用于纯图标按钮、真实状态点或具有旋转对称语义的控件。
- 大圆角和明显阴影必须对应真实的容器或浮层层级。

精确 control height、radius、shadow 和组件几何由运行时 token 与共享组件拥有。

## Components

### Action hierarchy

- 每个区域只突出一个主操作；secondary、icon 与 destructive action 使用更低视觉权重。
- 播放、导入等主操作可以使用珊瑚色实心填充；mute、solo、删除、设置等不得获得同等权重。
- 图标按钮必须有可访问名称、稳定点击目标和明确的 focus、disabled、active 状态。

### Boolean settings

- 设置型布尔状态使用固定标签与 Switch，不用“显示/隐藏”动作文案代替状态。
- 关闭态使用中性轨道与明亮滑块；开启态使用 accent 描边、soft 底色和 accent 滑块。
- 同一状态在快捷入口与设置面板同时出现时，共享语义和状态反馈，不创造两套开关语言。

### Overlay and feedback

- 浮层处理焦点进入、焦点恢复、Escape、窄视口和内容溢出。
- 状态错误优先就地显示；toast 只用于短暂且不阻塞的反馈。
- 单次普通成功反馈可以短暂收起；批量、重复、失败、取消和进行中结果必须保持可追溯。

共享组件的 DOM、ARIA、状态属性和样式实现以 `packages/web-viewer/src/components/ui`、相关测试与运行时
组件为准。本节只定义跨产品组件语义。

## Motion

- 默认只使用短距离 transform、opacity 与颜色过渡。
- 禁止装饰性循环、视差、滚动劫持和无意义的入场编排。
- 所有非必要动效尊重 `prefers-reduced-motion`。
- 播放位置、seek、拖动与其他高频反馈必须保持即时，不用视觉滞后掩盖运行时性能问题。

## Interaction Patterns

每处 UI 修改至少覆盖目标相关的状态，并通过文本、结构或图标表达，不能只依赖颜色。本节定义需要设计覆盖的
状态集合，不定义 Feature 状态机、默认值或持久化行为。

- 通用：rest、hover、active、focus、disabled、loading、empty、error、selected、unsaved。
- Viewer：playing、paused、seeking、loop enabled / invalid、muted、soloed、audio unavailable、restored。
- Studio：analyzing、cancelled、stale、unresolved、source-derived、algorithm-derived、user-corrected。
- 交互中断后必须有清晰恢复路径；关闭浮层、取消任务或离开 detached 状态不能依赖临时 toast 解释结果。
- 键盘、指针和触控操作共享相同的领域结果，视觉反馈可以按输入方式适配。

## Product Surfaces

本节只记录各产品表面的设计意图、视觉层级、密度与特有约束。当前用户行为、平台能力、默认值、范围和
持久化规则由对应 Current Feature Contract 与运行时证据拥有。

### Home

- Home 是唯一承担产品定义与工作区介绍的表面；Library、Viewer、Studio 不放介绍性 Hero。
- 使用单栏阅读面和细分隔线，不用卡片堆叠；产品定义居中，工作区说明使用克制的编号索引。
- Viewer、Studio、Library 可分别使用 blue、purple、pink 的小面积 signal 标记，这是单表面两种 signal 色
  上限的显式例外。
- 全页只保留一个珊瑚色实心主操作。介绍内容只陈述已实现能力，不显示不可用能力占位，也不编造版本号或指标。

当前行为由 Home 路由、用户视角测试与 runtime capability 证据拥有。

### Library

- Library 像排练目录，不像专辑商店或 SaaS 后台；浏览效率高于装饰性封面。
- 标题与艺术家是主信息，格式、时长和练习摘要是辅助信息；搜索、排序、状态和主动作保持清晰。
- 行级操作保持常显可用对比度，不依赖 hover 才可发现。
- 顶部与空态只表达一个导入意图；modal 承担候选审阅，不预先要求用户判断单份或批量。
- 导入反馈使用中性 surface 与前景色，不为格式、成功状态或批量结果创造第二套品牌 accent。
- 空态帮助用户导入自己的乐谱，不使用营销插画填充工作区。

当前行为见 [Sheet Library Feature Contract](docs/features/contracts/sheet-library.md)。

### Viewer

- 乐谱是绝对视觉中心；Transport、练习控制仓与谱面组成连续工作台。
- 宽屏使用稳定的 Comfortable 阅读面，Full width 是显式选择；窄屏优先保住谱面和高频控制。
- 缩放、宽度切换与导航是读谱工具，界面反馈必须保持当前阅读上下文，不制造装饰性重排。
- 练习设置首层按用户任务组织，Loop、Track 等领域对象进入二级工作区，不在首层平铺内部结构。
- 琴键引导紧贴谱面下方且不覆盖谱面；关闭后完整归还空间。左右手同时使用 signal 色和文字图例，coral
  只用于击打线。它是读谱辅助，不扩张为全屏游戏或取代乐谱。
- Transport 快捷入口服务高频任务；Score Navigation Mode 等低频设置使用紧凑入口与 ContextPopup。
- 播放是主要操作；其他轨道、设置与删除操作保持次级权重。

当前行为见 [Viewer Playback Navigation Feature Contract](docs/features/contracts/viewer-playback-navigation.md)。

### Studio

- Studio 允许最高信息密度，但来源和弦、算法结果、用户修正和未解决状态必须可区分。
- 编辑、预览与分析状态使用稳定区域，避免依赖临时 toast 传递关键事实。
- 桌面使用可调分栏同时呈现乐谱与分析工作区；窄屏按相同任务层级回退为上下结构。
- Studio 复用 Viewer 的阅读语言，不建立第二套谱面宽度、缩放或排印密度。
- 乐谱预览保持音乐结果纯净；来源、置信度和修正状态在分析工作区表达，不用多色元信息污染读谱面。
- 命令栏把低频操作收进图标与浮层，主操作保留文字；列表通过克制的色条、状态点和底色提高扫描效率。
- 结构化和弦编辑按需展开，进度与筛选保持稳定可见。

当前行为见 [Harmony Analysis Feature Contract](docs/features/contracts/harmony-analysis.md)。

## Do's and Don'ts

Zupulse 不是营销落地页、SaaS 管理后台、赛博音乐概念图或硬件拟物复制。

- **Do** 通过稳定分仓、对齐、细边界和语义 token 建立秩序。
- **Do** 保持主操作稀缺，并让状态、音乐编码和品牌强调各司其职。
- **Do** 为 Light、Dark、桌面、窄屏、键盘和目标相关状态提供完整设计。
- **Don't** 通过卡片包装、大圆角、pill 和阴影代替结构与层级。
- **Don't** 在所有标题上添加 uppercase、宽字距和 mono eyebrow。
- **Don't** 使用没有真实语义的状态点、版本号、编号标签或精确数字。
- **Don't** 混用暖灰和冷灰表面体系，也不为单个页面创造第二主强调色。
- **Don't** 使用霓虹、外发光、大面积玻璃或高饱和渐变。
- **Don't** 用动画装饰静态内容，或在工具工作区增加口号和与练习流程无关的说明文案。

## Sources of Truth and Maintenance

涉及 UI、主题和交互设计时，按以下顺序取信：

1. 运行时组件、`packages/web-viewer/src/styles/tokens.css`、自动化测试与可重复的视觉结果。
2. 本文件标记为 Current 的产品设计契约。
3. `.design_library/zupulse-te-braun-theme` 中的品牌原语、组件语义与参考资产。
4. Current Spec 中的局部设计要求。
5. Historical 或 Superseded 设计稿和讨论稿，仅作历史证据。

发现冲突时不得静默选择。普通 Feature 修改服从当前运行时；设计系统修改需要显式协调本文件、theme
library 与运行时 token。

- `.design_library/zupulse-te-braun-theme` 是上游主题资料库，不直接导入应用或覆盖运行时 CSS。
- `packages/web-viewer/src/styles/tokens.css` 是当前运行时 token 事实源。
- `.design_library/zupulse-te-braun-theme/runtime-token-map.json` 只记录已经采用的上游 token 到运行时
  semantic token 映射。
- Tailwind 只投影已经批准的运行时 semantic token；详细 style ownership 见
  `docs/architecture/react-application-system.md` 和 Current ADR。
- `check:design` 验证入口文件、token 映射和样式边界，不负责评价所有视觉质量。
- 本文件由人维护设计判断，不从 token 自动生成。Google DESIGN.md alpha metadata 只提供工具互操作线索，
  不改变本仓库的事实源顺序。
- 只有新增或改变已经验证、长期且跨产品的视觉原则、组件语义、interaction pattern、Product Surface
  设计意图或显式例外时，才更新本文件；单次变更意图留在 Spec。
- 本文件不得记录精确 token 值、Feature 默认值、状态机、持久化规则、平台能力或实现细节；它只链接这些
  事实的唯一 owner。Feature 行为变化更新对应 Contract，实现机制变化更新 Architecture 或 ADR。

### Implementation references

- Agent UI 规则：`packages/web-viewer/AGENTS.md`
- 组件语义：`.design_library/zupulse-te-braun-theme/specs/component-semantics.md`
- 运行时 token：`packages/web-viewer/src/styles/tokens.css`
- React UI architecture：`docs/architecture/react-application-system.md`
- Feature Contract 索引：`docs/features/README.md`
- UI 用户视角测试：`packages/web-viewer/src/app/__tests__/App.test.tsx`
