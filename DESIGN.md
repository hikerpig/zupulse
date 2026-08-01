---
status: current
last-reviewed: 2026-07-30
theme-library: .design_library/zupulse-te-braun-theme
runtime-tokens: packages/web-viewer/src/styles/tokens.css
---

# Zupulse 设计契约

本文件是 Zupulse 当前产品设计规则与上下文路由的入口。它约束产品界面如何做取舍，
不复制完整 token 表，也不替代组件、测试或运行时代码。

## 事实源与冲突处理

涉及 UI、主题和交互设计时，按以下顺序取信：

1. 运行时组件、`packages/web-viewer/src/styles/tokens.css`、自动化测试与可重复的视觉结果。
2. 本文件标记为 Current 的产品设计契约。
3. `.design_library/zupulse-te-braun-theme` 中的品牌原语、组件语义与参考资产。
4. 当前功能规格中的局部设计要求。
5. Historical / Superseded 设计稿和讨论稿，仅作历史证据。

发现冲突时不得静默选择。普通功能修改遵循当前运行时；设计系统修改需要显式协调本文件、
theme library 与运行时 token。

## 设计定位

Zupulse 是面向长期练习、乐谱查看与和声分析的桌面级数字音乐工作台。

| 维度             | 全局刻度 | 含义                               |
| ---------------- | -------- | ---------------------------------- |
| Design Variance  | 4/10     | 有辨识度，但布局服从工具效率       |
| Motion Intensity | 3/10     | 动效只服务反馈、状态与空间关系     |
| Visual Density   | 8/10     | 高密度工作台，以边界和秩序组织信息 |

局部参考：Library 密度约 6/10，Viewer 约 8/10，Studio 约 9/10。刻度用于校准判断，
不是需要写入代码的配置。

## 核心原则

- **乐谱优先**：乐谱阅读面是视觉中心，保持最亮、最安静；禁止纹理、噪点、玻璃和品牌色铺底。
- **结构先于装饰**：优先使用布局、细边界和表面层级，不依赖卡片、阴影或颜色堆叠。
- **滚动与阅读面**：每个工作区只有一个主要滚动宿主，使用 `.scrollable` 默认隐藏滚动条、hover 淡入；内容随展开，避免嵌套滚动与无意义空白。
- **紧凑但不拥挤**：高密度来自稳定分仓、对齐和可扫描性，不来自缩小点击目标。
- **颜色有职责**：珊瑚色表达主操作和关键激活；语义色表达状态；signal 色只做音乐编码。
- **状态完整**：设计必须覆盖 loading、empty、error、disabled、focus、selected 等完整周期。
- **动效有含义**：每个动效必须表达反馈、状态变化、层级或空间关系，否则不添加。
- **双主题同构**：Light 与 Dark 共用信息层级，不把暗色主题做成另一套产品。

## 一致性锁

### Palette

- 暖中性灰是基础表面，珊瑚色是唯一品牌主强调色。
- 珊瑚色实心填充只用于真正的主操作（播放、导入）。active/pressed 等开启状态一律用
  `accent` 描边 + `--accent-soft` 底色 + 前景着色的组合，与主操作可区分。
- 珊瑚色的透明度派生（soft、glow、focus ring、搜索高亮）一律用 `color-mix` 自
  `--accent-primary` 计算，不写第二个 coral 字面值；`--transport-key-bg` 与 `--meter-fill`
  直接引用 `--accent-primary`。
- 绿、黄、红和蓝只承担明确的状态语义。
- signal blue、pink、purple、yellow 仅用于轨道、节拍、分层和参数编码。
- 同一界面同时使用的 signal 色通常不超过两种，且视觉权重低于珊瑚色。
- 组件消费运行时语义 token，不直接消费 theme library 的原始色阶。

### Shape

- 基础控件使用小圆角，工作台分仓优先薄边界。
- 同一工具栏内的控件统一一档高度（Transport 工具控件 36px）与圆角（6px）；唯一主操作
  （播放）可升至 44px 建立层级；圆形只保留给纯图标按钮与 toggle。
- 同一工作流中的标题栏、工具栏与内容面组成连续表面；边框、圆角和阴影只放在最外层真实容器，相邻区域使用分隔线。
- pill 只用于标签、状态或连续选择，不作为普通按钮的默认形态。
- 圆形只用于图标按钮、真实状态点或具有旋转对称语义的控件。
- 大圆角和明显阴影必须对应真实的容器或浮层层级。

### Material

- 轻微材质只允许出现在 App Shell、Transport 和控制仓外壳。
- 内容区依靠纯色、边界与间距建立层级。
- 噪点、渐变和内高光必须克制，不得成为第一视觉印象。

### Typography

- Space Grotesk 用于界面主体；IBM Plex Mono 只用于参数、时间、速度和技术读数。
- 文案短、直接、功能导向；中文优先，不使用 emoji 或营销式修饰。
- `zh-CN` 界面的操作、区域和状态名称使用中文，不保留 Library、Practice、Tracks、Session、
  SETTINGS 等英文装饰标题；只保留品牌、文件格式、BPM、N.C.、和弦符号及用户内容等标准或原始文本。
- eyebrow 只用于确有索引价值的少量区域，不作为每个 section 的默认装饰。
- 数字变化频繁或需要纵向比较时使用 tabular numerals。

### Motion

- 默认只使用短距离的 transform、opacity 与颜色过渡。
- 禁止装饰性循环、视差、滚动劫持和无意义的入场编排。
- 所有非必要动效尊重 `prefers-reduced-motion`。
- 播放位置、seek 和拖动等高频值不得通过 React state 每帧重渲染整棵组件树。

## 产品表面

### Home

- Home 是唯一承担“展示与介绍”职责的产品表面；Library / Viewer / Studio 不放介绍性内容。
- 单栏阅读面，最大宽度 960px 与 Viewer Comfortable 阅读框对齐；分区之间用细分隔线，不用卡片堆叠。
- Hero（产品定义）无编号、整体居中对齐；下方工作区分区从 01 开始编号，编号索引用 IBM Plex Mono。
  编号与 mono 参数读数只写真实能力，不编造版本号或精确数字；display（56px）只用于 Hero 标题。
- signal 色编码：Viewer = blue、Studio = purple、Library = pink；只出现在编号与指示点等小面积位置，
  视觉权重低于珊瑚色。Home 同屏使用三种 signal 色，是“同一界面 signal 色通常不超过两种”的显式例外。
- 全页只有“打开曲库”一个珊瑚色实心主操作（位于 Hero）；工作区分区为纯介绍内容，不再各设入口链接。
- 不读取 Library 数据，无 loading / empty 分叉；`capabilities.harmonyAnalysis=false` 时不渲染和声分析一节，也不放“不可用”占位。

### Library

- 像排练目录，不像专辑商店或 SaaS 后台。
- 浏览效率高于装饰性封面；搜索、排序、状态和主动作保持清晰。
- 练习状态只表达已有持久化事实；只有真实 Resume 位置存在时使用“继续练习”，不得把摘要缺失
  写成“尚未练习”。
- 单文件常规成功使用短暂、紧凑的就地反馈；批量、重复、失败、取消和进行中结果保持可追溯。
- 筛选行（搜索、收藏、排序）控件统一 13px 字号与 40px 高度；排序标签与 select 垂直居中对齐。
- 导入成功条与格式徽章使用中性 surface + 前景色，不引入第二套彩色 accent；曲谱行操作图标
  保持常显可用对比度，不依赖 hover 才可见。
- 顶部与空态只表达一个导入意图；modal 负责多选、候选审阅、移除和确认，不预先要求用户判断
  “单份”或“批量”。
- Browser 与 Desktop 都可把 dropped files 加入同一候选清单；Desktop 通过 Preload `webUtils.getPathForFile`
  和 Main 一次性 token 边界接收文件，Renderer 不获取绝对路径；原生多选与 dropped files 共享候选列表。
- 空态告诉用户如何导入自己的乐谱，并提供一份用户主动选择的短 bundled sample；样例不得自动
  入库或产生 sample-only 馆藏语义，不使用营销式插画填充空间。

### Viewer

- 乐谱是绝对视觉中心，Transport 与练习控制仓形成连续工作台。
- Transport 进度条常驻栏顶边缘：轨道默认 4px、hover/focus 升至 6px，thumb 14px 常显；
  不再使用孤立的分隔竖线。BPM 弹层与谱面导航弹层共用同一种菜单项样式（`menuOption`），
  速度输入框隐藏浏览器原生 spin 按钮但保持键盘可输入。
- 宽屏乐谱默认使用居中的 Comfortable 阅读框，最大宽度 960px；Full width 是显式且持久的用户
  选择。窄屏直接使用全宽并隐藏宽度切换，不能为了保留低频控件造成横向溢出。
- Viewer 与 Studio 的 alphaTab 字体资源共用紧凑规格：标题 28px、副标题 18px，其余常用标注在
  保持辨识度的前提下相对原默认值下调 1–2px；不得由宿主各自形成不同密度。
- 缩放是读谱工具而非装饰：50%–200%、10% 步进、百分比复位为 100%，支持标准
  `Ctrl/Cmd +/-/0`。重排后保持当前书面谱表行，不能跳回页首或改变播放与 Loop 状态。
- 练习设置首层按“调整速度、设置循环区间、选择主轨道”等用户任务组织；Loop 和 Track 的领域
  控件进入二级工作区，不在首层平铺内部对象或单独堆叠 Session facts。
- 适用的钢琴谱可从练习设置打开钢琴按键提示。它紧贴在乐谱下方、Transport 上方，以提示块长度表达
  时值并同步高亮当前发声键；关闭后完整归还谱面空间。左右手使用不同 signal 色但同时保留文字图例，
  不能只依赖颜色。可视化默认高 260px，可从顶部分隔条在 180–420px 内上下调整；短窗口必须继续给
  乐谱保留至少 180px。谱面滚动区与钢琴工作区之间保持 8px 可见分隔，不得以 overlay 覆盖谱面；高度
  只在当前 Viewer Session 内保留，分隔条支持方向键调整与双击复位。该区域是读谱辅助，不得扩张为
  全屏瀑布游戏或取代乐谱的视觉中心。
- Transport 快捷入口可以直达对应练习任务；二级工作区返回首层时不关闭控制仓。
- Loop 是高频 Transport 模式：Loop 图标直接打开或关闭模式，不自动打开设置抽屉。首次打开时从
  播放头所在小节建立默认 A/B；再次打开恢复保留的区间。模式打开时谱面显示区间和可拖动边界，
  播放限制在 A/B；模式关闭时隐藏编辑层并恢复整首播放，但不清除区间。设置面板提供与 Transport
  同步的“循环模式”Switch，关闭时隐藏保存与吸附编辑项；关闭抽屉不关闭模式。小屏控制仓使用
  底部面板，保留足够谱面可见区域。完成 handle 调整后，A/B 草稿立即作为临时 Loop 生效；
  “保存区间”只负责把它持久化为可复用区间。设置面板不提供 Set A/B 或 A/B Slider。
- 播放是主要操作；mute、solo、删除和设置不得获得同等视觉权重。
- Score Navigation Mode 是低频设置，使用紧凑图标入口和 ContextPopup；不以介绍文案或常驻状态栏
  挤占谱面。
- Page Turn 才显示上一页、下一页和 `n / m`；Detached 只显示明确的“返回播放位置”恢复动作。
- Continuous Follow 动画短促且可取消；Scrub、Page Turn 和减少动态效果时直接呈现最新目标。

### Studio

- 允许最高信息密度，但来源和弦、算法结果、用户修正和未解决状态必须可区分。
- 编辑、预览与分析状态使用稳定区域，避免依赖临时 toast 传递关键事实。
- 专业密度不能牺牲键盘操作、可读性或错误恢复。
- 桌面 Studio 使用可调分栏同时呈现乐谱与分析工作区；窄屏回退为上下结构。
- Studio 乐谱预览复用 Viewer 的宽度模式、缩放范围、快捷键和位置保持契约，不建立第二套读谱行为。
- 乐谱预览表达 Effective Harmony Projection 的当前音乐结果，来源与置信度留在分析详情中，不用多色和弦污染读谱面。
- 谱面与 Effective Harmony Range 双向定位，但 Harmony Selection 本身不得隐式创建或修改 User Correction。
- 命令栏低频操作（设置、试听、撤销、重做、导出）使用图标按钮 + 浮层，让出垂直空间给分析内容；主操作（保存、重新分析）保留文字按钮。
- 片段列表使用视觉编码快速区分来源（色条）、置信度（圆点）、状态（底色），减少文字元信息。
- 结构化和弦编辑默认折叠为入口按钮，需要时再弹出完整构建器。
- 进度统计常驻列表顶部，可点击切换过滤视图。

### Overlay

- Dialog、Popover 和 Menu 才使用明确浮层与较高 elevation。
- 浮层必须处理焦点进入、焦点恢复、Escape、窄视口和内容溢出。
- 状态错误优先就地显示；toast 只用于短暂且不阻塞的反馈。

## 完整状态

每处 UI 修改至少覆盖目标相关的状态，且必须通过文本、结构或图标表达，不能只依赖颜色。

- 通用：rest、hover、active、focus、disabled、loading、empty、error、selected、unsaved。
- Viewer：playing、paused、seeking、loop enabled / invalid、muted、soloed、audio unavailable、restored。
- Studio：analyzing、cancelled、stale、unresolved、source-derived、algorithm-derived、user-corrected。

## Anti-Slop

Zupulse 不是营销落地页、SaaS 管理后台、赛博音乐概念图或硬件拟物复制。

- 不通过卡片包装、大圆角、pill 和阴影代替结构与层级。
- 不在所有标题上添加 uppercase、宽字距、mono eyebrow。
- 不使用没有真实语义的状态点、版本号、编号标签或精确数字。
- 不让所有按钮具有相同权重，也不把所有可点击元素染成珊瑚色。
- 不混用暖灰和冷灰表面体系，不为单个页面创造第二主强调色。
- 不使用霓虹、外发光、大面积玻璃或高饱和渐变。
- 不用动画装饰静态内容；Library / Viewer / Studio 工作区不增加营销 Hero、口号或与练习流程无关的说明文案。Home 的介绍内容必须真实对应已实现能力，同样禁止口号与营销修饰。

## Agent 工作协议

进行 UI、CSS、主题、布局或交互状态修改前：

1. 阅读本文件并声明目标表面的设计刻度。
2. 阅读目标组件、相关测试和一个当前推荐实现。
3. 列出需要覆盖的交互与数据状态。
4. 检查是否已有语义 token 或基础组件。
5. 只有修改主题、token 或基础组件时，继续读取 theme library 的相关文件。

完成后：

1. 对照 Palette、Shape、Material、Typography、Motion 一致性锁自审。
2. 对照 Anti-Slop 禁止项自审。
3. 验证相关的 Light、Dark、桌面、窄屏、键盘和状态场景。
4. 从最小相关测试开始，再运行与风险相称的项目门禁。
5. 新增长期设计决策时更新本文件；不要只留在对话或临时任务规格中。

## 维护边界

- `.design_library/zupulse-te-braun-theme` 是上游主题资料库，不直接导入应用或覆盖运行时 CSS。
- `packages/web-viewer/src/styles/tokens.css` 是当前运行时 token 事实源。
- `.design_library/zupulse-te-braun-theme/runtime-token-map.json` 只记录已经正式采用的原始 token 到运行时语义 token 映射。
- Tailwind 只把运行时语义 token 投影为受约束 utility，不保存独立产品色值，也不改变本文件、
  theme library 与运行时 token 的事实源顺序。
- Tailwind 默认 palette、font、radius 和 shadow 不属于 Zupulse 设计系统；产品组件只能消费批准的
  semantic utility。alphaTab、动态音乐可视化和复杂几何样式可以继续直接消费运行时 CSS variable。
- 样式迁移不是产品目标。现有 CSS Module 只有在能够删除重复视觉状态、复用共享 primitive 或消除
  双重 style ownership 时才迁移；不得用 Tailwind 覆盖率或 CSS LOC 作为设计质量指标。
- `check:design` 验证入口文件和映射不漂移，不负责评价所有视觉质量。
- 不自动生成本文件；token 差异可以自动检查，产品设计判断由人维护。

## 深入阅读

- 主题摘要：`.design_library/zupulse-te-braun-theme/SKILL.md`
- 完整品牌说明：`.design_library/zupulse-te-braun-theme/README.md`
- 原始 token：`.design_library/zupulse-te-braun-theme/css.json`
- 主题 CSS：`.design_library/zupulse-te-braun-theme/colors_and_type.css`
- 组件语义：`.design_library/zupulse-te-braun-theme/specs/component-semantics.md`
- 运行时 token：`packages/web-viewer/src/styles/tokens.css`
- Viewer 当前模式：`packages/web-viewer/src/features/PlaybackWorkspace.tsx`
- UI 用户视角测试：`packages/web-viewer/src/app/__tests__/App.test.tsx`
