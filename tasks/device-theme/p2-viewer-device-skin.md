# Task: Viewer device 换肤（App Shell / Transport / 练习控制仓）

## Goal

device 外壳下，Viewer 的 App Shell、Transport（LCD 读数区 + seek 推子）和练习控制仓
按视觉基准完整换肤；谱面渲染逐像素不变；classic 不受影响。

## Non-goals

- 不改 Viewer 信息架构与布局（密度 8/10 不变）。
- 不做 Library / Studio（P3）；不做 device 专属动效。
- 不做旋钮；LCD 显示条只映射 Transport 读数区，不扩散到其他区域。

## Canonical context

- 视觉基准: `.design_library/tab-viewer-te-braun-theme/specs/mockups/a-ep133-device-v5.html`
  与 `a-ep133-device-dark.html`
- 组件语义: `.design_library/tab-viewer-te-braun-theme/specs/component-semantics.md`
  （按键四变体三态、推子规格、LCD 约束、状态清单）
- Viewer 结构: `packages/web-viewer/src/features/PlaybackWorkspace.tsx`、
  `playback-workspace/playback-transport.tsx`、`PlaybackWorkspace.module.css`
- 结构样式机制（Spec）：所有覆写挂在 `[data-shell="device"]` 作用域，不改组件结构。

## Scope

- App Shell 容器：机身渐变 + 细砂噪点（`--device-texture-grain`，dark 为白颗粒）+ 方角。
- 按钮/控件基元：键程底边 5px、顶高光 1px、active 下沉 4px；四变体映射——
  orange=播放（唯一主操作）、red=循环 A–B、dark=停止/步进/未选中、light=次级操作/选中态。
- Transport：读数区换 LCD 内凹面板 + 琥珀发光字（IBM Plex Mono + tabular numerals，
  禁止扫描线）；进度条换凹槽轨道 + 薄片柄 + 橙色指示线，时间读数进读数窗。
- 速度控制：横推子 + −/+ 步进键 + BPM 读数窗；音量竖推子（若该表面有音量控件）。
- 轨道选择：键井凹槽 + pad 键 + LED 激活点。
- 采用后建立 `.design_library/tab-viewer-te-braun-theme/runtime-token-map.json`，
  登记本阶段正式采用的映射；`check:design` 同步覆盖。
- P1 审计清单中 Viewer 相关的硬编码色值在本任务内顺手 token 化。

## Acceptance criteria

- [x] device-light 对照 v5 基准、device-dark 对照 dark 基准逐控件复核通过。
- [x] 同一乐谱在 classic / device 下 alphaTab 渲染逐像素一致（谱面不参与换肤）。
- [x] 控件状态完整：rest / hover / active / focus / disabled / selected；
      激活态只用 LED + 键面切换；focus 有形状或位置变化，不只发光。
- [x] 36px 高密度工具栏中键程阴影不互相遮挡；布局盒尺寸不变。
- [x] classic 主题视觉回归零变化。
- [x] `runtime-token-map.json` 建立且无漂移（`check:design` 通过）。

## 验证记录（2026-08-03）

- `pnpm test -- web-viewer`：49 文件 / 262 测试通过；`pnpm test -- styles`：18 通过。
- `pnpm verify:fast` 通过（163 文件 / 736 测试，含 check:design 覆盖 device 映射 106 条）。
- 截图证据（`scripts/capture-viewer-shell-screenshots.mjs`，Cannon in D 样例，重载后
  `dataset.shell` 与存储值脚本校验一致）：
  - `scripts/screenshots/viewer-{classic,device}-{light,dark}.png` — Viewer 全图四组合。
  - `scripts/screenshots/viewer-device-{light,dark}-practice.png` — 练习控制仓。
- 逐控件复核：播放=orange 键（修正了与 dark 键选择器的覆盖顺序）、停止/步进/导航=dark 键、
  循环激活=red 键+LED、时间/BPM/页码=读数窗（琥珀 mono + 内凹）、seek=凹槽轨道+薄片柄+
  橙色指示线、练习面板=内凹板+light 任务键、键井行（loopRow/trackRow）、原生音量 range=
  凹槽+薄片柄、开关=凹槽轨道+薄片滑块。谱面纸两种外壳下一致（token 未触及 alphaTab 渲染）。
- 未映射基准细节：品牌板四角螺丝（`header` 的 `::after` 已被 noiseOverlay 占用，
  螺丝为纯固定语义装饰，本轮不引入额外 DOM）；手型 pad 选中态在钢琴谱样例上未展开截图。

## Open decisions

- 细砂噪点若在某端 WebView 不支持 `feTurbulence` data URI：退化为纯净哑光
  （契约允许），并在契约 Caveats 记录该端限制。
  → Browser（Chromium）验证通过；Electron 同为 Chromium 预期一致；iPad WebView 未验证，
  若不支持按契约退化即可（噪点仅为机身质感层，无功能语义）。

## Verification

- 最小测试：Viewer 相关组件测试 + `pnpm --filter @zupulse/web-viewer test`
- 门禁：`pnpm verify:fast`；涉及 Browser/Desktop journey 时 `pnpm verify:e2e`
- 人工证据：两种外壳 × 明暗的 Viewer 截图（对照基准），附在本文件。

## Open decisions

- 细砂噪点若在某端 WebView 不支持 `feTurbulence` data URI：退化为纯净哑光
  （契约允许），并在契约 Caveats 记录该端限制。
