---
feature: viewer-playback-navigation
title: Viewer Playback Navigation
status: current
delivery: available
last_verified: 2026-07-25
hosts:
  - browser
  - desktop
implementation_paths:
  - packages/web-core/src/gp/alphaTabBrowser.ts
  - packages/web-core/src/playback
  - packages/web-viewer/src/score-navigation
  - packages/web-viewer/src/features/PlaybackWorkspace.tsx
  - packages/web-viewer/src/viewerApp.tsx
supersedes: []
---

# Viewer Playback Navigation Feature Contract

## 一句话契约

Viewer 在同一份 alphaTab 纵向布局上提供连续跟随和稳定翻页；谱面点击与 Transport 正式定位只由
`PlaybackController` 提交，Scrub Preview 则以 latest-only 临时更新游标和目标视口。

## 用户入口

- 用户从 Sheet Library 打开 `#/viewer/:libraryScoreId`。
- 谱面导航入口位于底部 Transport 工具区；Page Turn 的页导航仅在该模式可用。
- Browser 与 Desktop 共享相同 React Viewer 和运行时契约。

## 当前已实现行为

### Continuous Follow 与 Follow State

- Browser 和 Desktop 默认使用 Continuous Follow；播放头进入新的完整谱表行时，Viewer 只移动谱面
  滚动容器，把目标行放到视口上部。
- 手动 wheel 或 touch 浏览进入 `Detached`，此时播放和 Scrub 不自动抢回视口。
- 正式 seek、stop、模式切换或“返回播放位置”恢复 `Following`；单独 play/pause 不改变状态。
- alphaTab 公开的 `customScrollHandler` 提供游标谱表行，`postRenderFinished` 和
  `boundsLookup.staffSystems` 提供完整布局；高频几何不进入 React state。

### Page Turn

- 用户可在紧凑的导航模式弹层中选择 `continuous` 或 `page-turn`；偏好保存在设备本地，不进入
  Practice Sidecar。
- Screen Score Page 按当前视口高度贪心装入连续完整谱表行，计入真实行间距；超高谱表行独占一页。
- Page Turn 显示上一页、下一页和 `n / m`，支持 PageUp/PageDown、横向 swipe 和每个 wheel
  gesture 至多翻一页。
- 播放或 Scrub 跨页时只呈现最新目标页。缩放、resize 或 alphaTab 重排后以书面谱表行锚点重建页面。
- 已启用 Loop 跨越普通页边界且相关谱表行能放入一屏时，Viewer 临时合并 Loop 页面；放不下时保持
  普通分页。

### 谱面点击与 Transport

- beat/note 命中先形成 Written Position，再通过 alphaTab 展开的 `tickCache.masterBars` 解析唯一
  Playback Occurrence；优先当前 occurrence，其次播放头之后最近一次，最后回退首次。
- alphaTab 默认 seek / playback-range 用户交互关闭；应用手势是正式谱面定位的唯一权威。
- 单指轻触定位；移动超过 8px、双指捏合和滚动后的抑制窗口不会误发 seek。正式 seek 保持
  playing/paused transport。
- Slider 拖动保留本地乐观值；同一 animation frame 只把最新预览位置发送给 alphaTab。
- Scrub Preview 不改变 Controller 正式 state、不通知订阅者、不写 resume；松手取消待执行预览并
  提交一次正式 seek。
- 播放中的普通 position snapshot 最多约 10Hz 发布给 React；transport、正式 seek、stop、Loop
  变更与 pause flush 立即发布。

### 生命周期与降级

- render、resize、zoom 和轨道重排使用递增 generation；旧回调不能覆盖新投影。
- staff-system bounds 暂不可用时不阻断播放，保留模式偏好并等待下一次完整 render。
- Session destroy 清理选择、alphaTab 导航事件、输入监听、ResizeObserver、Controller 和预览状态。

## 平台能力矩阵

| 能力                                 | Browser | Desktop | 当前差异 |
| ------------------------------------ | ------- | ------- | -------- |
| Continuous Follow / Detached         | 支持    | 支持    | 无       |
| Page Turn 与设备本地偏好             | 支持    | 支持    | 无       |
| PageUp/PageDown、wheel、swipe        | 支持    | 支持    | 输入设备 |
| 精确 Playback Occurrence 谱面定位    | 支持    | 支持    | 无       |
| Transport latest-only 游标与视口预览 | 支持    | 支持    | 无       |
| Loop-aware 临时页面                  | 支持    | 支持    | 无       |

本轮自动化验收平台是 Chromium Browser Demo；iOS WebView 和实体 iPad 不属于本 Contract 的已验证宿主。

## 领域不变量

1. alphaTab 拥有音频时钟、动画游标、beat 命中和渲染坐标。
2. `PlaybackController` 拥有正式 transport、seek、Playback Occurrence、Loop 和持久化语义。
3. `ScoreNavigationCoordinator` 位于 Viewer DOM 边界，拥有 Follow State、Screen Score Page 和视口。
4. React 只消费低频 transport 与导航 snapshot；逐帧游标几何和 `scrollTop` 不进入 React。
5. Scrub Preview 是唯一可绕过正式 state 的临时 engine 路径，松手必须正式提交。
6. Score Navigation Mode 是设备偏好；Following / Detached 和页码只属于当前 Session。

## 明确非目标

- 打印分页、出版排版、alphaTab Horizontal 长卷或自研谱表虚拟化。
- 持久化 Screen Score Page 页码或把导航模式写入 Practice Sidecar。
- 通过 Scrub Preview 写入 resume、Loop 或练习进度。
- 本轮 iOS、Xcode、实体 iPad 验收。

## 验收契约

- 播放跨谱表行或页面只移动谱面滚动容器，文档根节点不滚动。
- 手动浏览保持 Detached；正式定位、stop 或恢复动作回到 Following。
- Page Turn 的每个离散输入最多移动一页；resize 和 zoom 后保留书面锚点。
- 谱面点击只提交一次正式 seek，且不改变 playing/paused transport。
- Scrub 每帧最多发送一个最新预览，松手只提交一次正式 seek。
- playing position snapshot 最多约 10Hz；pause、stop、seek 和 Loop 语义立即可观察。

## 证据地图

| 契约                     | 代码                                                                                             | 测试                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| alphaTab 公开导航边界    | `packages/web-core/src/gp/alphaTabBrowser.ts`                                                    | `packages/web-core/src/gp/__tests__/alphaTabBrowser.test.ts` |
| occurrence 精确解析      | `packages/web-core/src/score/positions.ts`、`packages/web-core/src/playback/writtenSelection.ts` | 相邻 `__tests__`                                             |
| Follow State 与页面协调  | `packages/web-viewer/src/score-navigation`                                                       | `packages/web-viewer/src/score-navigation/__tests__`         |
| 模式、页码与恢复 UI      | `packages/web-viewer/src/features/PlaybackWorkspace.tsx`                                         | `PlaybackWorkspace.test.tsx`                                 |
| position 发布预算        | `packages/web-core/src/playback/playbackController.ts`                                           | `playbackController.test.ts`                                 |
| Browser 长谱与响应式流程 | `apps/web-demo/e2e/library.spec.ts`                                                              | Playwright Chromium                                          |

## 相关资料

- 当前架构：[`viewer-score-navigation.md`](../../architecture/viewer-score-navigation.md)
- 决策：[`ADR 0064`](../../adr/0064-coordinate-score-navigation-with-playback.md)
- 初步 Spec：
  [`2026-07-25-viewer-score-navigation-playback-sync-design.md`](../../superpowers/specs/2026-07-25-viewer-score-navigation-playback-sync-design.md)
- UI 契约：[`DESIGN.md`](../../../DESIGN.md)

## 维护触发器

- alphaTab player、bounds、cursor、tick cache 或 user interaction API 变化。
- occurrence 回退、谱面手势、Scrub Preview 或正式 seek 语义变化。
- Screen Score Page、Loop 重组、输入去重、Follow State 或模式持久化变化。
- position 发布预算、resume flush 或 Session 清理变化。
