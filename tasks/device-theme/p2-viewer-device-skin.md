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

- [ ] device-light 对照 v5 基准、device-dark 对照 dark 基准逐控件复核通过。
- [ ] 同一乐谱在 classic / device 下 alphaTab 渲染逐像素一致（谱面不参与换肤）。
- [ ] 控件状态完整：rest / hover / active / focus / disabled / selected；
      激活态只用 LED + 键面切换；focus 有形状或位置变化，不只发光。
- [ ] 36px 高密度工具栏中键程阴影不互相遮挡；布局盒尺寸不变。
- [ ] classic 主题视觉回归零变化。
- [ ] `runtime-token-map.json` 建立且无漂移（`check:design` 通过）。

## Verification

- 最小测试：Viewer 相关组件测试 + `pnpm --filter @zupulse/web-viewer test`
- 门禁：`pnpm verify:fast`；涉及 Browser/Desktop journey 时 `pnpm verify:e2e`
- 人工证据：两种外壳 × 明暗的 Viewer 截图（对照基准），附在本文件。

## Open decisions

- 细砂噪点若在某端 WebView 不支持 `feTurbulence` data URI：退化为纯净哑光
  （契约允许），并在契约 Caveats 记录该端限制。
