# Zupulse Device Theme（设备主题）

一套**可切换的并行视觉主题**：把 Zupulse 界面装进一台 Teenage Engineering 风格的实体练习设备里。
它不替代 `.design_library/zupulse-te-braun-theme`（当前运行时主题），两者通过主题切换共存。

- Status: adopted（P1 切换基础设施 + P2 Viewer 换肤已落地；P3 Library/Studio 材质继承进行中）
- 视觉定稿：`specs/mockups/a-ep133-device-v5.html` / `a-ep133-device-v5.png`
- 品牌参考：`specs/reference-teenage-engineering.png`（EP-133 K.O. II）
- 纹理选型试验：`specs/mockups/texture-lab.html`

## 定位

| 维度     | 与当前主题的关系                                                              |
| -------- | ----------------------------------------------------------------------------- |
| 信息架构 | 完全一致，只换材质与控件形态                                                  |
| 密度     | 保持 8/10，拟物不占布局空间                                                   |
| 乐谱     | 同样"乐谱优先"：谱面永远是白纸，材质只出现在设备外壳上                        |
| 切换粒度 | 只换外壳（机身、控件、显示面板）；谱面渲染不参与主题切换                      |
| 切换机制 | `data-shell` 属性切换外壳；明暗沿用 `data-theme`；token 与现有语义 token 同构 |
| 明暗组合 | 2×2：外壳（classic / device）× 明暗（light / dark）                           |

## 设计决定（经评审收敛）

1. **机身**：冷灰受光渐变 + 细砂噪点（SVG `feTurbulence`，5% 黑，不规则注塑颗粒）。
   不使用规则点阵、拉丝、罗纹或暖纸纤维——规则图案有刻意感，暖底违反"不混用暖灰冷灰"。
2. **按键**：哑光单段渐变 + 5px 键程底边 + 1px 顶面高光；active 下沉 4px 并收掉底边。
   不堆多层渐变和内凹阴影（会造成视觉模糊）。拟物感来自"高度"，不来自"光影数量"。
3. **推子（slider）**：5px 深色凹槽轨道 + 14×22 薄片柄 + 橙色指示线。
   用于播放位置（seek）、速度、音量等线性参数；不使用旋钮（产品内无对应场景）。
4. **显示屏（LCD）**：纯黑内凹面板 + 琥珀色锐利发光字 + 1px 水平玻璃反光（≤5%）。
   禁止扫描线等降低可读性的效果。承载 Transport 读数：BPM、小节、Loop、轨道、播放态。
5. **圆角**：方正规格——机身 14 / 面板 8 / 按键 6 / 内凹件 4。
6. **无功能装饰**：禁止扬声器格栅等不承担功能的设备元素；螺丝仅用于品牌板固定语义。
7. **彩色编码**：signal 色只出现在 LCD 内的小面积色块与 LED，键面不做彩色模块。
8. **推广边界**：Library / Studio 只继承机身、按键、推子、显示窗这些"真实控件材质"，
   不发明磁带仓等设备隐喻。LCD 显示条是 Viewer/Transport 的专属映射。
9. **暗色形态（已定稿）**：主题模型为 2×2——外壳（classic / device）× 明暗（light / dark）。
   device-dark 视觉基准 `specs/mockups/a-ep133-device-dark.html`：深色细砂机身（白颗粒 3.5%）、
   深色键与机身拉开明度差、推子槽改深；LCD、橙红键、LED、读数窗、谱面纸与浅色版完全一致。
   谱面在 dark 下仍是白纸——外壳主题是设备，纸不属于外壳。

## 表面映射（Viewer）

| 设备元素                             | 对应现有界面                              |
| ------------------------------------ | ----------------------------------------- |
| 品牌板（含螺丝）                     | App header / 品牌区                       |
| LCD 显示条                           | Transport 读数区（BPM、小节、Loop、轨道） |
| 全长横推子 + 时间读数窗              | Transport 进度条 / seek                   |
| 播放大橙键                           | 主操作播放键                              |
| 停止黑键、A–B 红键 + LED             | 停止、循环模式（LED = 激活态）            |
| 速度横推子 + −/+ 步进键 + BPM 读数窗 | 速度控制                                  |
| 音量竖推子                           | 音量                                      |
| 轨道键井（A/B/C/D + LED）            | 轨道选择                                  |
| 浅键                                 | 次级操作（练习设置、谱面缩放等）          |

## Token 文件

- `colors_and_type.css` — 主题原语与组件级变量（机身、按键三态、推子、LCD、LED、读数窗）。
- `specs/component-semantics.md` — 组件语义与状态规则。
- `runtime-token-map.json` — 已正式采用的运行时映射（P1 语义 token + P2 结构原语），
  由 `pnpm check:design` 防漂移。
- 采用机制：根元素 `data-shell="classic|device"` 切换外壳（缺省 classic），明暗沿用
  `data-theme="light|dark"`；运行时 token 在 `packages/web-viewer/src/styles/tokens.css` 的
  `:root[data-shell="device"]` 段与明暗覆写段。键程阴影、细砂噪点等结构性样式挂在各组件
  CSS Module 的 `[data-shell="device"]` 作用域覆写（未分层，优先级高于 tailwind utilities）。

## Caveats

1. 本目录 token 是从 mockup 反推的设计原语，未经运行时验证；采用前以
   `specs/mockups/a-ep133-device-v5.html` 为视觉基准复核。
2. 细砂噪点依赖 SVG `feTurbulence` data URI；需要确认目标渲染端（Browser / Electron / iPad）
   均支持，否则退化为纯净哑光（texture-lab 的 A 方案）也可接受。
3. 琥珀色发光字是该主题的显示专属色，与品牌珊瑚主色并存但不承担操作语义；
   主操作仍由橙色系（`--device-key-orange-*`）统领。
4. 暂无 `css.json` 结构化投影；主题定稿采用时补齐。
