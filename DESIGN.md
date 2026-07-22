---
status: current
last-reviewed: 2026-07-21
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
- 绿、黄、红和蓝只承担明确的状态语义。
- signal blue、pink、purple、yellow 仅用于轨道、节拍、分层和参数编码。
- 同一界面同时使用的 signal 色通常不超过两种，且视觉权重低于珊瑚色。
- 组件消费运行时语义 token，不直接消费 theme library 的原始色阶。

### Shape

- 基础控件使用小圆角，工作台分仓优先薄边界。
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
- eyebrow 只用于确有索引价值的少量区域，不作为每个 section 的默认装饰。
- 数字变化频繁或需要纵向比较时使用 tabular numerals。

### Motion

- 默认只使用短距离的 transform、opacity 与颜色过渡。
- 禁止装饰性循环、视差、滚动劫持和无意义的入场编排。
- 所有非必要动效尊重 `prefers-reduced-motion`。
- 播放位置、seek 和拖动等高频值不得通过 React state 每帧重渲染整棵组件树。

## 产品表面

### Library

- 像排练目录，不像专辑商店或 SaaS 后台。
- 浏览效率高于装饰性封面；搜索、排序、状态和主动作保持清晰。
- 空态告诉用户如何导入第一份乐谱，不使用营销式插画填充空间。

### Viewer

- 乐谱是绝对视觉中心，Transport 与练习控制仓形成连续工作台。
- Loop、Tracks、Session 使用分仓与细分界，不拼成多张悬浮卡片。
- 播放是主要操作；mute、solo、删除和设置不得获得同等视觉权重。

### Studio

- 允许最高信息密度，但来源和弦、算法结果、用户修正和未解决状态必须可区分。
- 编辑、预览与分析状态使用稳定区域，避免依赖临时 toast 传递关键事实。
- 专业密度不能牺牲键盘操作、可读性或错误恢复。
- 桌面 Studio 使用可调分栏同时呈现乐谱与分析工作区；窄屏回退为上下结构。
- 乐谱预览表达 Effective Harmony Projection 的当前音乐结果，来源与置信度留在分析详情中，不用多色和弦污染读谱面。
- 谱面与 Effective Harmony Range 双向定位，但 Harmony Selection 本身不得隐式创建或修改 User Correction。

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
- 不用动画装饰静态内容，不增加营销 Hero、口号或与练习流程无关的说明文案。

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
