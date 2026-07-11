# Tab Viewer 组件语义

## 核心原则

- 颜色只承担层级和状态，不承担装饰
- 离白表面是清洁工作底板，不是带材质感的装饰色
- 橙色只用于主操作、当前激活、关键焦点
- 黑色结构层用于承托信息密度和功能分区
- 蓝 / 粉 / 紫 / 黄只允许作为稀疏 coded accents，不成为主品牌色，也不替代主橙

## Button

### Primary Button

- 用途：播放、打开乐谱、确认保存区间
- 背景：`--tab-viewer-primary-500`
- 悬停：`--tab-viewer-primary-600`
- 前景：`#ffffff`
- 圆角：`--radius-sm`
- 风格：纯色、平面、强对比，像屏幕里的立即执行信号，不做金属高光

### Secondary Button

- 用途：停止、次级切换、面板内工具动作
- 背景：light 用 `--surface-container`，dark 用 `--surface-container-low`
- 边框：`--color-border`
- 文本：`--color-foreground`
- 风格：干净、轻哑光、低凸起，保持离白工作台的清洁感

### Tertiary / Ghost Button

- 用途：主题切换、轻量模式切换
- 背景：透明或 `--surface-container-low`
- 激活：`--color-primary-container`
- 文本：激活时使用 `--color-on-primary-container`
- 禁止使用粉 / 紫 / 黄直接充当主激活底色

## Panel

### Structural Panel

- 用途：右侧 `Loop` / `Tracks` 主模块
- 背景：`--color-surface`
- 内层项：`--color-surface-container-low`
- 边框：`--color-border`
- 阴影：`--shadow-1`
- 风格：几何秩序优先，像屏幕结构块而不是器材金属面板，不做玻璃感

### Utility Block

- 用途：轨道条目、循环条目、数值控制区
- 背景：light 用 `--surface-container-low`，dark 用 `--surface-container`
- 激活边框：`--color-primary`
- 允许在左侧加 2px 激活指示条
- 辅助编码色只能出现在小标签、细线、刻度或点状提示里

## Status

### Status Chip

- `ready`：`--color-success`
- `warning`：`--color-warning`
- `error`：`--color-error`
- `info`：`--color-info`
- `neutral`：`--color-on-surface-variant`

规则：

- 默认尺寸偏小
- 带小圆点或细竖条作为状态标记
- 不允许大面积彩色底块泛滥
- 状态芯片只使用语义色，不使用 signal pink / purple 充当状态语义

## Transport

### Timeline

- 轨道底：`--meter-track`
- 已播放：`--meter-fill`
- 当前柄：主橙色或高对比黑白柄
- 数字：统一使用 `IBM Plex Mono`
- 蓝 / 粉 / 紫 / 黄可用于轨道层分类，但只能停留在条带、片段或小点级别

### Speed Control

- 属于精密控制，不属于品牌展示
- 背景用中性层
- 只在焦点和当前值上使用橙色
- 若需要次级编码，优先把 signal blue 用在标尺或对齐参考，而不是按钮主体

## Score Stage

- 外壳背景：`--bg-score-shell`
- 阅读面：`--bg-score`
- 乐谱区始终是全页面最亮、最安静的区域
- 禁止把大面积品牌橙色压到乐谱阅读面上

## Track Controls

### Track Row

- 行背景：`--surface-container-low`
- 当前主轨：加主色边框或左侧高亮条
- `mute` / `solo` 是状态按钮，不是主要 CTA
- 音量推子允许使用橙色刻度，但轨道本体仍以中性色为主
- 轨道家族编码可以使用 blue / pink / purple，但每行只保留一种辅助 accent

## Loop Controls

### Loop Segment

- A/B 点属于结构焦点
- 激活区间可以使用浅橙背景或橙色边线
- 保存的 loop 条目优先体现秩序，而不是标签装饰感
- signal yellow 只适合做拍点、对齐刻度或轻量提醒，不适合铺成大面积块面

## 辅助配色规则

- 蓝色：只用于数据选择、技术提示、次级仪表或链接型编码
- 粉色：只用于轨道家族、乐句层或合成器相关分组提示
- 紫色：只用于效果、调制、片段分层或并行结构提示
- 黄色：只用于节拍、定位刻度、轻量提醒或时间性标记
- 这些颜色都必须是小面积、低占比、单点出现，视觉优先级始终低于橙色
- 同一界面同时出现的辅助 accent 最好控制在 1–2 种，避免把工作台变成彩虹面板

## 不该做的事

- 不做拟物金属边框
- 不做高亮玻璃霓虹 UI
- 不把所有可点击元素都染成橙色
- 不让颜色数量超过结构层级数量
