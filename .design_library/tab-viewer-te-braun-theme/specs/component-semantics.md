# Zupulse Device Theme 组件语义

Status: candidate。视觉基准 `../mockups/a-ep133-device-v5.html`。
与当前主题（zupulse-te-braun-theme）信息架构一致，只替换材质与控件形态。

## 核心原则

- 拟物感来自"高度与键程"，不来自渐变和光影的数量
- 谱面永远是白纸；材质只出现在设备外壳与控件上
- 橙色只用于主操作（播放）与线性参数指示；红色只承担循环/记录语义
- 琥珀色发光字只属于显示面板，不承担操作语义
- 禁止无功能装饰（扬声器格栅等）；禁止扫描线等损害可读性的效果

## Device Body（机身）

- 背景：`--device-body-light → mid → dark` 纵向渐变 + `--device-body-glare` 顶部受光
- 纹理：`--device-texture-grain`（细砂噪点）；不支持时退化为纯净哑光
- 边缘：1.5px 顶缘高光 + 底缘内影 + 外层投影
- 圆角：`--device-radius-body`

## Key（按键）

四种变体共用同一结构：哑光面（单段渐变）+ 5px 键程底边 + 1px 顶面高光。

| 变体         | 用途                               | 面                           | 底边                       |
| ------------ | ---------------------------------- | ---------------------------- | -------------------------- |
| `key-dark`   | 停止、步进、轨道未选中、深色功能键 | `--device-key-dark-face-*`   | `--device-key-dark-edge`   |
| `key-light`  | 次级操作、轨道选中态               | `--device-key-light-face-*`  | `--device-key-light-edge`  |
| `key-orange` | 唯一主操作（播放）                 | `--device-key-orange-face-*` | `--device-key-orange-edge` |
| `key-red`    | 循环 A–B（记录语义）               | `--device-key-red-face-*`    | `--device-key-red-edge`    |

状态规则：

- rest：`box-shadow` 底边 `--device-key-travel`(5px) + 浅投影 + inset 顶高光
- active：`translateY(--device-key-press)`(4px)，底边收至 1px
- selected（如轨道选中）：用 `key-light` 切换 + LED 表达，不做第三种键面颜色
- disabled：降低对比与底边高度，不出现彩色
- 标签刻在键上方机身（`--device-label`，9px uppercase 宽字距 + 下高光），不上键面

## Fader（线性推子）

- 轨道：5px 高/宽 `--device-fader-rail` 凹槽（inset 阴影），圆角 `--device-radius-inset`
- 已填充段：`--device-fader-fill`（进度/速度类用橙色填充；音量类可不填充）
- 柄：薄片（横向 14×22 / 纵向 22×14），`--device-fader-cap-*` 深色面 + 中央
  `--device-fader-indicator` 指示线
- 刻度：轨道旁细刻度线，每第 5 格加长；不标注数值
- 数值用独立读数窗表达，不写进轨道
- 播放位置 seek、速度、音量都用此形态；本产品不使用旋钮

## LCD Display（显示屏）

- 面板：`--device-lcd-bg-*` 深色内凹 + ≤5% 玻璃反光，圆角 `--device-radius-lcd`
- 读数：IBM Plex Mono + tabular numerals；主读数 `--device-lcd-amber` 带
  `--device-lcd-glow` 光晕，次级读数 `--device-lcd-amber-dim`
- 字形必须锐利：光晕只在字形边缘，禁止扫描线、点阵化、模糊
- signal 色块（`--device-lcd-signal-*`）只做小面积编码，同屏不超过 3 种
- 承载：BPM、小节计数、播放态、Loop 区间、当前轨道

## Readout（读数窗）

- 小型内凹黑窗（`--device-readout-bg-*`），琥珀 mono 读数
- 用于推子配套数值（时间、BPM），圆角 `--device-radius-inset`

## LED

- 6–7px 圆点；on = `--device-led-on` + 光晕；off = `--device-led-off` 哑光凹点
- 只表达真实布尔状态（循环开、当前轨道），一个控件至多一颗

## Score Paper（谱面）

- `--device-score-paper-hi → lo`，圆角 6px，浅投影浮于机身上
- 谱面内不使用任何设备材质；Loop 区间与播放头沿用当前主题的珊瑚色系表达

## Screw（螺丝）

- 仅用于品牌板四角的固定语义；10–11px 金属径向渐变 + 一字槽
- 不扩散到其他面板

## 状态覆盖清单

与当前主题相同的完整周期（rest/hover/active/focus/disabled/loading/empty/error/selected），
设备主题额外约束：

- focus：不得只用发光表达，必须有形状或位置变化（如键面下沉或边框）
- 激活态统一用 LED + 键面切换，不用彩色光晕铺满
- loading/empty/error 在 LCD 中以琥珀暗态文字表达，不使用红色发光

## Device Dark（深色机身）

视觉基准 `../mockups/a-ep133-device-dark.html`。派生规则：

- 只替换机身、内凹面板、键程分离度、推子槽、LED 灭态相关色值
  （见 `colors_and_type.css` 的 `[data-mode="dark"]` 段）
- LCD、橙红键、LED 亮态、读数窗、谱面纸与浅色版完全一致
- 深色键与机身必须保持明度差；分离度不够时先调键面明度，不加描边
- 细砂噪点在深色机身为白色颗粒（3.5%），密度与浅色一致
- 谱面在 dark 下仍是白纸：外壳主题是设备，纸不属于外壳
