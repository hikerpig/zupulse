---
status: current
---

# Device Theme 可切换主题落地规格

## 文档状态

- Owner: Design + web-viewer
- Date: 2026-08-02
- Related: `DESIGN.md`、`.design_library/zupulse-te-braun-theme`（当前主题）、
  `.design_library/tab-viewer-te-braun-theme`（Device Theme 契约，status: candidate）、
  `packages/web-viewer/src/styles/tokens.css`（运行时 token 事实源）
- Decision gate: 设计方向已批准（视觉基准 v5 + device-dark 已定稿）；本规格约束落地方式，
  实现以运行时代码为准。

## 结论摘要

把 Device Theme（TE EP-133 风格拟物主题）落地为**可切换的并行主题**，不替代当前主题。
主题模型为 2×2：外壳（classic / device）× 明暗（light / dark）。
切换通过根元素 `data-shell="classic|device"` 完成（`data-theme` 已被明暗轴占用），token 与现有语义 token 同构；
谱面渲染不参与主题切换。视觉基准：

- device-light：`.design_library/tab-viewer-te-braun-theme/specs/mockups/a-ep133-device-v5.html`
- device-dark：`.design_library/tab-viewer-te-braun-theme/specs/mockups/a-ep133-device-dark.html`

## 背景与问题

1. 产品当前只有一套视觉语言（扁平数字、纸感温暖）。用户希望有一套气质完全不同、
   可随时切回的拟物设备风主题。
2. Device Theme 的设计契约与 token 已在 `.design_library/tab-viewer-te-braun-theme`
   收敛（按键键程、薄推子、LCD 琥珀发光、细砂机身、方角、密度 8/10），
   缺的是运行时落地路径：token 怎么投、结构样式怎么挂、切换入口在哪、如何持久化。
3. 拟物主题包含当前语义 token 没有的**结构性样式**（键程阴影、噪点纹理、发光字、
   推子槽），不能只靠换色值实现，这是本规格要解决的核心技术问题。

## 目标与非目标

### 目标

- 用户可在界面上一键切换 classic / device 外壳，明暗切换保持现有行为，四种组合都可用。
- 切换即时生效，不刷新页面；选择持久化（Browser 用 local storage，Desktop 经 Main + Bridge，
  与 locale 持久化同路径）。
- device 外壳下：App Shell、Transport、练习控制仓、按钮、滑杆、读数区按契约换肤。
- 谱面渲染（alphaTab 输出、Loop 区间、播放头）在两个外壳下完全一致。
- Library / Studio 只继承控件材质（按键、推子、读数窗），不引入 LCD 显示条等设备隐喻。

### 非目标

- 不重排任何表面的信息架构与布局（密度 8/10 保持不变）。
- 不改动 classic 主题的任何视觉表现。
- 不做旋钮控件；不为 Library / Studio 发明无功能设备装饰。
- 不在本阶段做 device 专属动效；动效规则沿用 `DESIGN.md` Motion 一致性锁。

## 设计决定（继承自契约，不在此重开）

1. 机身：冷灰渐变 + 细砂噪点（SVG `feTurbulence`）；device-dark 为白颗粒 3.5%。
2. 按键：哑光单段渐变 + 5px 键程底边 + 1px 顶高光，active 下沉 4px；四变体
   （dark / light / orange / red），选中态用 LED + 键面切换。
3. 推子：5px 凹槽轨道 + 薄片柄 + 橙色指示线；不使用旋钮。
4. LCD：纯黑内凹 + 琥珀锐利发光字，禁止扫描线；仅映射 Transport 读数区。
5. 圆角方正规格：机身 14 / 面板 8 / 按键 6 / 内凹件 4。
6. 谱面永远白纸，dark 下也不变。
7. 琥珀发光字不承担操作语义；主操作仍由橙色统领。

## 技术方案

### Token 结构

- `tokens.css` 保持现有语义 token 为缺省（classic）。
- 新增 `[data-shell="device"]` 覆写段：与现有语义 token **同名同构**的第二套值
  （表面、前景、边框、accent 等），使绝大多数组件无需改动即可换色。
- 明暗继续走现有机制（dark class / `[data-mode="dark"]`，以运行时现状为准），
  device-dark 的差值token 已在契约 `colors_and_type.css` 的 dark 段定义。
- 采用后建立 `.design_library/tab-viewer-te-braun-theme/runtime-token-map.json`，
  只登记正式采用的映射；`check:design` 需要覆盖新主题与原语漂移检查。

### 结构样式

键程阴影、噪点纹理、发光字、推子槽这类语义 token 表达不了的样式，通过
`[data-shell="device"]` 作用域下的少量结构覆写实现（不改组件结构）：

- 按钮/控件基元：在 device 作用域追加键程底边、顶高光、active 下沉。
- App Shell 容器：追加机身渐变 + `--device-texture-grain` 噪点 + 方角。
- Transport 读数区：追加 LCD 内凹面板与琥珀发光字样式。
- slider 基元：追加凹槽轨道与薄片柄。
- 所有结构覆写挂在 `[data-shell="device"]` 选择器下，classic 渲染路径零变化。

### 切换入口与持久化

- 入口放在 AppHeader 现有明暗切换旁，与明暗是两个独立维度（外壳 ≠ 明暗）。
- 文案进 `@zupulse/app-i18n`；语义为"外观：经典 / 设备"，不发明营销名称。
- 持久化与 locale 同契约：Browser 写 local storage；Desktop 经 Main 持久化后再同步
  Renderer；启动时先读持久值再渲染，避免主题闪烁。
- `data-shell` 缺省为 classic，保证现有用户无感知。

## 表面范围与阶段

| 阶段 | 范围                                                             | 验收重点                               |
| ---- | ---------------------------------------------------------------- | -------------------------------------- |
| P1   | token 结构、`data-shell` 切换、持久化、切换入口                  | 四组合切换即时生效、重启保持、谱面无感 |
| P2   | Viewer 换肤：App Shell、Transport（LCD + seek 推子）、练习控制仓 | 对照 v5 / dark 基准逐控件复核          |
| P3   | Library / Studio 控件材质继承（按键、推子、读数窗）              | 无设备隐喻、密度不变                   |

Home 表面不在本规格范围；如需覆盖另行评审。

## 验收标准

1. `data-shell` 在 classic / device 间切换无需刷新，四种外壳×明暗组合渲染正确。
2. 主题选择跨会话持久；Browser 与 Desktop 行为一致。
3. 同一乐谱在两种外壳下 alphaTab 渲染输出逐像素一致（谱面不参与主题）。
4. classic 主题下所有现有视觉与交互回归无变化（`pnpm verify:fast` + 相关 E2E）。
5. device 主题控件覆盖完整状态：rest / hover / active / focus / disabled / selected；
   激活态只用 LED + 键面切换表达。
6. i18n 检查通过（`pnpm check:i18n`）；切换文案不使用英文装饰标题。
7. `check:design` 覆盖新主题 token 映射，无漂移。

## 风险与开放问题

1. SVG `feTurbulence` 噪点需在三端（Browser / Electron / iPad WebView）验证；
   不支持时退化纯净哑光（契约允许）。
2. 现有组件若直接硬编码色值而非消费语义 token，device 换肤会漏色；
   P1 需要先做一次 token 消费审计，结果决定 P2/P3 的实际改动面。
3. 键程阴影改变控件视觉高度但不改变布局盒；需要在高密度工具栏（36px 控件）
   验证阴影不互相遮挡。
