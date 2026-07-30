# Zupulse Design System

A design system reconstruction of **Zupulse** — a Digital Music Practice Workspace.
This system is written for a dashboard-oriented practice environment with a future-facing, restrained, precise, screen-first, and digitally playful character.

## Source

- Narrative source: `phase2-brand-analyst.json`
- Machine-readable token source: `css.json`
- Theme CSS projection: `colors_and_type.css`
- Product design contract: `../../DESIGN.md`
- Product runtime tokens: `../../packages/web-viewer/src/styles/tokens.css`
- Product type: Digital Music Practice Workspace
- Brand language: 中文

## Role in the product

本目录是 Zupulse 的上游主题资料库，保存品牌原语、组件语义和视觉参考。它不直接导入应用，
也不自动覆盖运行时 CSS。产品界面先遵循根 `DESIGN.md`，组件只消费
`packages/web-viewer/src/styles/tokens.css` 中的运行时语义 token。

`runtime-token-map.json` 记录已经正式采用的主题原语与运行时语义 token。未出现在映射中的
主题值仍是候选设计资料，不代表当前产品已经采用。

## What this design system covers

- **Foundations** — color scales, semantic aliases, typography, spacing, size, radius, shadow, motion, and layout tokens.
- **Brand narrative** — the visual tone is defined as clean off-white working surfaces, charcoal structural blocks, a vivid coral primary action accent, sparse coded accents in blue, pink, purple, and yellow, Braun-like order, Teenage Engineering rhythmic color placement, and a low-metal, screen-first digital studio feel.
- **Documentation scope** — this README focuses on token and documentation guidance for designers, so the most actionable material here is how to use the foundations consistently.

## CONTENT FUNDAMENTALS

### Voice & tone

这套系统的语言风格与它的视觉气质一致：克制、精确、偏工程化，但不冷漠。品牌分析把它定义为 future-facing、restrained、precise、warm-industrial、digitally playful，因此文案不适合夸张的情绪表达，也不适合营销式堆砌形容词。更合适的写法是短句、动作导向、界面对象明确，例如直接点名播放、循环、轨道、速度、打开乐谱这类操作对象。中文应作为主要界面语言，语气保持专业、直接、轻量，避免表情符号，避免不必要的感叹语，避免把音乐练习工具写成娱乐平台。

### Concrete copy examples

- 播放控制：_"播放"_
- 重复模式：_"循环"_
- 轨道维度：_"轨道"_
- 练习参数：_"速度"_
- 文件入口：_"打开乐谱"_

### When generating copy

- 优先使用简短中文动作词，让操作对象一眼可见。
- 文案应该服务于练习流程与工作台结构，而不是制造情绪噪声。
- 当界面涉及参数、节奏、轨道或文件时，命名应保持技术化和可扫描性。
- 品牌允许一点数字玩味感，但这种“playful”更像节奏与编排感，不是口语化俏皮语气。

## VISUAL FOUNDATIONS

### Color

主品牌色是一条完整的信号橙红 10 阶色阶，从 `#fff2ee` 到 `#57170a`，其中主动作色落在 `--zupulse-primary-500: #f0492e`。它取自 Teenage Engineering 设备的橙红旋钮与按键，往珊瑚方向回拨后更明亮，仍是屏幕里的高能操作信号。浅色主题下，它与 `--surface: #f0eee9`、`--surface-container-low: #e2e0da`、`--surface-container: #dbdad4` 一起工作，形成"机身灰工作台 + 炭黑结构件 + 橙红主操作"的清晰层级；深色主题中主色切换到 `--zupulse-primary-400: #f5826a`，继续保持高可见度与快速响应感。

中性色是另一条 10 阶色阶，从 `#e9e7e2` 到 `#141414`。主导界面质感的是接近 Teenage Engineering 机身的浅暖灰与明确的炭灰结构：`#f0eee9`、`#e2e0da`、`#dbdad4` 负责底板与卡面，`#4a4a4a`、`#2e2e2d`、`#141414` 负责导航、轨道结构、控制框架和高密度信息区。这让工作台保留 Braun 式秩序，同时摆脱米色纸感，转向低反光、先屏幕后材质的数字设备界面。

语义色保持清晰分工，并延续系统的理性组织方式。成功色主值是 `#2c9f69`，语义别名使用 `--success: #1f8254`；警告色主值是 `#f0a000`，语义别名使用 `--warning: #c98300`；错误色主值是 `#e02e18`，语义别名使用 `--error: #c42814`；信息色主值是 `#008ff5`，语义别名使用 `--info: #0072ca`。除此之外，系统还定义了四个稀疏的 coded accents：`--color-signal-blue: #5dade2`、`--color-signal-pink: #f04a8a`、`--color-signal-purple: #a972ff`、`--color-signal-yellow: #ffbe1a`。这些颜色用于轨道编码、节奏标记、层级分组和参数提示，只负责形成节奏与分类感，不可替代主信号橙红承担主要 CTA、主要激活态或品牌识别。

整体色彩氛围来自"机身灰表面 + 深炭结构块 + 橙红主信号 + 少量编码色点亮"的组合。它依然保留 Braun 的秩序与 Teenage Engineering 的节拍感，但不再强调器材金属感，而是把它们压缩进一个更锋利、更平面、更像数字工作站的屏幕语言里：基础层始终安静，结构层始终明确，主操作始终由信号橙红统领，辅助色只在需要编码节奏时出现。

### Typography

系统的显示、标题和正文全部使用 **Space Grotesk**，代码与数字则使用 **IBM Plex Mono**。这意味着品牌在大多数场景下坚持单一无衬线家族来维持界面一致性，再用等宽字建立参数、速度、时间值和技术字段的仪器感。`--font-display`、`--font-heading`、`--font-body` 都是 `'Space Grotesk', sans-serif`；`--font-mono` 是 `'IBM Plex Mono', monospace`。从 CSS 可以看出字体通过 `@import` 加载，因此设计上默认以这两个字体为首选。

字号系统从展示到说明文形成明确阶梯：display `56px / 1.05 / 700`，H1 `40px / 1.1 / 700`，H2 `32px / 1.15 / 600`，H3 `24px / 1.2 / 600`，H4 `20px / 1.3 / 500`，lead `18px / 1.55 / 400`，body `16px / 1.5 / 400`，mono `14px / 1.5 / 500`，caption `12px / 1.45 / 400`，eyebrow `11px / 1.35 / 500`。这套比例把可读性放在前面，没有过度追求戏剧化的大标题，而是让标题在仪表盘里依然能够紧凑排列。

字距控制同样很克制。display 使用 `-0.03em`，H1 和 H2 使用 `-0.02em`，把 Space Grotesk 的几何感压得更紧一些；eyebrow 使用 `0.08em` 并强制 `uppercase`，形成控制台标签式的小型索引语言。`IBM Plex Mono` 配合 `font-variant-numeric: tabular-nums`，说明数字栏位、时间、速度或价格式信息应保持整齐对齐，而不是采用比例数字。

字体替代策略也已经在 token 里暗示清楚：当 Space Grotesk 不可用时退回 `sans-serif`；当 IBM Plex Mono 不可用时退回 `monospace`。这不是审美首选，但能保留无衬线主体与等宽数据层的基本结构。

### Spacing

间距系统采用清晰的 8 点延展，但以 `4px` 作为最小基元：`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`，分别对应 `--space-1` 到 `--space-8`。这让界面既能处理紧凑的参数面板，也能支撑较大的内容区留白。尺寸 token 说明控制高度同样遵循这套尺度：小按钮 `36px`，默认输入框 `40px`，中按钮 `44px`，大按钮 `48px`。因此控件编排应优先围绕 40–48px 的交互高度，而不是更矮的网页按钮比例。

布局 token 把这种秩序进一步固定下来：导航高度 `72px`，侧栏宽度 `88px`，基础 gutter `24px`，最大内容宽度 `1440px`。这组值让界面天然更像设备化工作台而不是营销站点；特别是 `88px` 侧栏和 `72px` 顶栏，会形成较强的模块边界感。

### Radius

圆角没有走极简硬角路线，也没有走超软卡片路线，而是使用一组逐层递进的现代工业圆角：`6px`、`10px`、`14px`、`20px` 和 `9999px`。`6px` 适合更紧凑的控件与小型表面；`10px` 是常规组件的中性圆角；`14px` 更适合较大卡片或区块；`20px` 用于需要更明显包裹感的容器；`9999px` 明确保留给完整胶囊形态。因为品牌基调是 precise 与 warm-industrial，这些圆角应被理解为“经过计算的柔化”，不是情绪化的可爱处理。

### Shadow / Elevation

系统定义了 5 层阴影，而且每一层都偏向紧凑、低雾化的工业桌面感。`--shadow-1` 是 `0 1px 2px rgba(24,24,24,0.06), 0 1px 1px rgba(24,24,24,0.04)`，用于静态卡片；`--shadow-2` 是 `0 6px 14px -4px rgba(24,24,24,0.12)`，用于卡片悬停；`--shadow-3` 是 `0 14px 30px -10px rgba(24,24,24,0.18)`，用于浮层；`--shadow-4` 是 `0 20px 44px -14px rgba(24,24,24,0.22)`，用于模态；`--shadow-5` 是 `0 30px 72px -24px rgba(24,24,24,0.28)`，用于覆盖层。

它们的共同特点是阴影始终锚定在 `rgba(24,24,24,...)` 这组深炭色上，因此即使表面偏暖，层级判断仍然很理性。这个系统不适合柔雾、彩色光晕或大面积玻璃拟态，更适合用有限层级把工作台面板、悬停态和模态清晰分开。

### Borders

- 轮廓线主值来自 `--rule: var(--zupulse-neutral-200)`，也就是浅灰 `#d0cec8` 这一层。
- 常规描边使用 `--color-outline` 与 `--color-border`，都落在这条冷中性色谱上，而不是纯黑透明线。
- 深色主题下 outline 变为 `--zupulse-neutral-700`，保持同样的结构逻辑但提升暗底可见性。

### Backgrounds

- 浅色背景以 `#e9e7e2`、`#f0eee9`、`#e2e0da`、`#dbdad4` 为主，强调干净、低反光、接近 TE 机身浅灰的工作台层次。
- 深色背景以 `#181818` 为底，并配合 `#272727`、`#2e2e2d`、`#383837`、`#4a4a4a` 做层级抬升。
- `--inverse-surface` 与 `--inverse-on-surface` 明确了浅深模式之间的反转逻辑，适合做高对比提示区。

### Animation

- 快速动效 `120ms`，基础动效 `180ms`，说明系统倾向敏捷反馈而非拖拽式慢动画。
- 标准缓动为 `cubic-bezier(0.2, 0, 0.12, 1)`，前段干脆、尾段收得利落，符合精密工具的响应感。
- 这类参数更适合按钮、面板、悬停、模态的短距离过渡，不适合大幅戏剧性位移。

### Iconography & coded details

- 图标尺寸采用 `12 / 16 / 20 / 24px` 四档，对应从微型状态提示到标准操作图标的完整范围。
- 等宽字与 tabular 数字是系统的重要“编码细节”，应优先用于速度、计数、时间、参数和轨道类信息。
- `--color-signal-blue`、`--color-signal-pink`、`--color-signal-purple`、`--color-signal-yellow` 只应作为轨道、层、节拍、参数的小面积编码信号出现，形成可扫描的节奏感。
- 无论这些 coded accents 如何出现，主按钮、主激活、主焦点始终由珊瑚通道负责；辅助色不能升级为第二主品牌色。

## Index

- `README.md` — 当前品牌说明，面向设计师，聚焦 foundations 与文档语义。
- `colors_and_type.css` — 主题 CSS 投影，包含颜色、字体、间距、尺寸、圆角、阴影、动效与布局变量。
- `css.json` — token 的结构化映射文件，可用于程序化检索同一套变量。
- `runtime-token-map.json` — 已采用主题原语到产品运行时语义 token 的受控映射。
- `specs/reference-braun.png` — 品牌参考图像之一。
- `specs/reference-teenage-engineering.png` — 品牌参考图像之一。

## Caveats / known substitutions

1. **Space Grotesk** 和 **IBM Plex Mono** 通过 `@import` 远程加载；当字体不可用时，系统会分别退回 `sans-serif` 与 `monospace`。这能保留结构，但会削弱标题几何感与数据栏位的品牌特征。
2. 颜色 token 在 `colors_and_type.css` 中带有 `AI-generated` 注释，因此它们是主题重建结果，不自动等于产品运行时事实。已采用范围以 `runtime-token-map.json` 为准，当前实际值仍以应用 `tokens.css` 为准。尤其是 coded accents 的职责已经被收敛为小面积节奏与分类信号，不应再把它们外推成新的主品牌色。
3. 当前说明文档只展开 token 与品牌叙事，不展开组件、预览页或 UI kit 的行为细节；因此这里适合作为 foundations 依据，不适合作为组件契约来源。
4. 品牌样例文案仅能确认 `"播放" "循环" "轨道" "速度" "打开乐谱"` 这组高频界面词，说明系统的语言方向已经明确，但更长篇的叙述性文案仍需沿着“专业、直接、可扫描”的原则继续扩写。
