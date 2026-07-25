---
feature: viewer-playback-navigation
title: Viewer Playback Navigation
status: current
delivery: partial
last_verified: 2026-07-25
hosts:
  - browser
  - desktop
implementation_paths:
  - packages/web-core/src/gp/alphaTabBrowser.ts
  - packages/web-core/src/playback
  - packages/web-viewer/src/components/ScoreViewer.tsx
  - packages/web-viewer/src/components/Slider.tsx
  - packages/web-viewer/src/features/PlaybackWorkspace.tsx
  - packages/web-viewer/src/viewerApp.tsx
supersedes: []
---

# Viewer Playback Navigation Feature Contract

## 一句话契约

Viewer 使用 alphaTab 呈现播放游标并在独立谱面容器内跟随播放；用户可以点击谱面或拖动
Transport 改变位置，并缩放、滚动谱面。当前只有一套连续纵向阅读面，没有显式跟随状态或翻页模式。

本文描述当前可观察行为。发生冲突时，运行时代码、schema 和可重复测试优先于本文；Current ADR
与当前架构文档优先于历史规格。“进行中的目标差异”不是已经交付的行为。

## 用户入口

- 用户从 Sheet Library 打开 `#/viewer/:libraryScoreId`，应用从 Managed Score Copy 重建 Viewer
  Session 和 alphaTab runtime。
- Browser Demo 与 Desktop Shell 共享相同 Viewer、Transport、谱面点击和缩放交互。
- 播放控制需要 alphaTab player 和 SoundFont 就绪；查看、滚动和缩放不要求正在播放。

## 当前已实现行为

### 播放游标与纵向跟随

- alphaTab 显示小节游标、拍游标和当前元素高亮。
- Viewer 把 alphaTab `player.scrollElement` 指向谱面宿主的父级滚动容器；播放跟随只移动谱面
  区域，不滚动整个应用页面。
- 当前没有显式配置 ScrollMode，运行时使用锁定 alphaTab 版本的默认 Continuous 行为。
- Viewer 没有 Continuous Follow / Page Turn 选择、页码、Following / Detached 状态或
  “回到播放位置”操作。

### 谱面点击定位

- alphaTab 的 beat/note pointer 命中被映射为书面小节索引和小节内 tick，再发送正式 seek。
- 正式 seek 改变播放位置但不切换 playing/paused transport。
- 单指轻触可定位；移动超过 8px、双指手势和紧随滚动手势的触摸命中会被抑制。
- 当前 occurrence 映射按完整书面时长近似保留当前轮次；它尚未基于完整 repeat/jump 路径消歧。
- alphaTab `enableUserInteraction` 当前仍为启用，因此应用定位与 alphaTab 内建 seek/区间选择尚未
  收敛为单一手势权威。

### Transport 拖动

- Slider 在交互期间保留本地乐观值，不被滞后的外部 position snapshot 拉回。
- 同一 animation frame 内的多个拖动位置只把最新位置预览给 alphaTab engine。
- Scrub Preview 会更新 alphaTab 游标，但不修改 Controller 正式 state、不通知订阅者，也不写
  Local Playback Resume。
- 松手取消尚未执行的预览，并通过 PlaybackController 提交一次正式 seek。
- 当前没有独立导航协调器保证快速 Scrub 时视口跟随目标谱表行。

### 缩放与滚动位置

- Viewer 提供 75%–200% 缩放按钮，并支持双指捏合预览后提交缩放。
- 缩放偏好保存在当前宿主的本地存储中。
- alphaTab 重新布局后，Viewer 按缩放前后的滚动范围比例恢复纵向位置。
- 鼠标、触控板或触摸滚动不会形成可观察的 Detached 状态；后续播放仍可由 alphaTab 默认行为
  移动谱面容器。

### 失败与生命周期

- 文件或 renderer 加载失败沿用 Viewer 本地化错误状态，不创建虚假的播放状态。
- 打开另一份曲谱或销毁 Viewer Session 时，谱面选择、缩放、Controller 和 alphaTab 订阅被清理。
- 暂停或宿主挂起时，当前正式播放位置按既有 resume 规则 flush；Scrub Preview 本身不持久化。

## 平台能力矩阵

| 能力                       | Browser | Desktop | 当前差异 |
| -------------------------- | ------- | ------- | -------- |
| alphaTab 游标与元素高亮    | 支持    | 支持    | 无       |
| 谱面容器纵向播放跟随       | 支持    | 支持    | 无       |
| 谱面点击 seek              | 支持    | 支持    | 无       |
| Transport 实时游标预览     | 支持    | 支持    | 无       |
| 缩放与滚动比例恢复         | 支持    | 支持    | 无       |
| 显式 Continuous/Page 模式  | 未实现  | 未实现  | 无       |
| Screen Score Page 与页导航 | 未实现  | 未实现  | 无       |

## 领域不变量

1. alphaTab 拥有实际音频时钟和高频播放游标；React 不保存逐帧游标几何。
2. 正式 seek 由 PlaybackController 接收并更新语义播放位置与 resume 状态。
3. Scrub Preview 只更新 engine，不改变正式 state 或持久化事实；松手后必须正式提交。
4. Viewer 只操作自己的谱面滚动容器，不以文档根节点作为播放跟随目标。
5. 谱面点击先产生书面位置，再映射到播放时间轴位置；两者不得当作同一位置语义。
6. 缩放、滚动和 seek 不得隐式改变 Loop、速度或轨道播放设置。

## 进行中的目标差异

以下内容不得被 AI 当作已经实现的行为：

- 尚未落地：设备级 Score Navigation Mode、Page Turn Mode 和 Screen Score Page。
- 尚未落地：Following / Detached 状态、手动浏览暂停自动跟随和“回到播放位置”入口。
- 尚未落地：基于 alphaTab 公开 staff-system bounds 的导航投影与 Loop-aware 重分页。
- 尚未落地：repeat、D.S.、D.C. 和 Coda 的完整 Playback Occurrence 点击消歧。
- 部分落地：Scrub 已更新 alphaTab 游标，但没有独立协调目标行或页的视口跟随。
- 部分落地：应用已经 dispatch 谱面 seek，但 alphaTab 内建用户交互仍同时启用。
- 部分落地：播放 position 仍按 engine 事件通知 React，尚未应用目标中的降频发布预算。

目标方向由 Proposed ADR 0064 和
[`Viewer 谱面导航与播放同步初步 Spec`](../../superpowers/specs/2026-07-25-viewer-score-navigation-playback-sync-design.md)
约束；在 Spec 实现并通过 Web 验收前，本节全部保持目标差异。

## 明确非目标

- 在 Viewer 中编辑来源谱面内容或读取 Studio Harmony Analysis Document。
- 打印纸张分页、出版排版保真或 alphaTab Horizontal 单行长卷。
- 通过 Scrub Preview 写入练习进度、Loop 或 Local Playback Resume。
- 让 React、Zustand 或 Feature Contract 成为 alphaTab 高频游标的第二事实源。

## 验收契约

- 给定已经加载的曲谱，当播放跨越谱表行时，文档根节点不得代替谱面容器滚动。
- 给定 playing 或 paused 状态，当用户点击有效 beat 时，播放位置必须改变且 transport 保持不变。
- 给定单指拖动或双指捏合，当手势结束时，不得把被抑制的触摸命中提交为谱面 seek。
- 给定同一帧内多个 Transport 预览位置，当 animation frame 执行时，只能把最新位置发送给 engine。
- 给定 Scrub Preview，当 alphaTab 回报匹配位置时，不得通知正式 state 或写 resume。
- 给定 Transport 松手，当仍有待执行预览时，必须取消预览并只提交一次最终 seek。
- 给定缩放导致 alphaTab 重排，当新布局完成时，Viewer 必须按滚动范围比例恢复阅读位置。
- 给定 Viewer Session 被销毁，当旧 alphaTab 再发事件时，不得更新已结束的 Session。

## 证据地图

| 契约                           | 运行时代码 / Schema                                                                                                                                 | 自动化证据                                                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| alphaTab 设置与谱面滚动容器    | [`viewerApp.tsx`](../../../packages/web-viewer/src/viewerApp.tsx)                                                                                   | [`viewerApp.test.ts`](../../../packages/web-viewer/src/__tests__/viewerApp.test.ts)                                                                                                       |
| 触摸抑制与书面 beat 命中       | [`alphaTabBrowser.ts`](../../../packages/web-core/src/gp/alphaTabBrowser.ts)                                                                        | [`alphaTabBrowser.test.ts`](../../../packages/web-core/src/gp/__tests__/alphaTabBrowser.test.ts)                                                                                          |
| 当前书面位置到 occurrence 映射 | [`writtenSelection.ts`](../../../packages/web-core/src/playback/writtenSelection.ts)                                                                | [`writtenSelection.test.ts`](../../../packages/web-core/src/playback/__tests__/writtenSelection.test.ts)                                                                                  |
| Scrub latest-only 调度         | [`PlaybackWorkspace.tsx`](../../../packages/web-viewer/src/features/PlaybackWorkspace.tsx)                                                          | [`PlaybackWorkspace.test.tsx`](../../../packages/web-viewer/src/features/__tests__/PlaybackWorkspace.test.tsx)                                                                            |
| Slider 乐观交互值              | [`Slider.tsx`](../../../packages/web-viewer/src/components/Slider.tsx)                                                                              | [`Slider.test.tsx`](../../../packages/web-viewer/src/components/__tests__/Slider.test.tsx)                                                                                                |
| 预览不通知、不持久化           | [`playbackController.ts`](../../../packages/web-core/src/playback/playbackController.ts)                                                            | [`playbackController.test.ts`](../../../packages/web-core/src/playback/__tests__/playbackController.test.ts)                                                                              |
| 缩放、捏合与位置恢复           | [`ScoreViewer.tsx`](../../../packages/web-viewer/src/components/ScoreViewer.tsx)、[`viewerApp.tsx`](../../../packages/web-viewer/src/viewerApp.tsx) | [`ScoreViewer.test.tsx`](../../../packages/web-viewer/src/components/__tests__/ScoreViewer.test.tsx)、[`viewerApp.test.ts`](../../../packages/web-viewer/src/__tests__/viewerApp.test.ts) |

## 相关资料

- 产品术语：[`CONTEXT.md`](../../../CONTEXT.md)
- 当前架构入口：[`docs/architecture/README.md`](../../architecture/README.md)
- 当前 UI 契约：[`DESIGN.md`](../../../DESIGN.md)
- 当前谱面滚动设计：
  [`2026-07-12-score-workspace-scrolling-design.md`](../../superpowers/specs/2026-07-12-score-workspace-scrolling-design.md)
- Written Position / Playback Occurrence：ADR 0038
- Proposed 导航决策：ADR 0064
- 初步 Spec：
  [`2026-07-25-viewer-score-navigation-playback-sync-design.md`](../../superpowers/specs/2026-07-25-viewer-score-navigation-playback-sync-design.md)

## 维护触发器

- alphaTab player、cursor、scrollElement、ScrollMode 或 user interaction 设置变化。
- 谱面 pointer/touch 手势、Written Position 映射或正式 seek 语义变化。
- Transport Slider、Scrub Preview、position 事件发布或 resume 持久化变化。
- ScoreViewer 缩放、滚动宿主、视口布局或响应式行为变化。
- 目标 Spec 的差异落地并获得可重复测试证据。
- Browser、Desktop 或未来 iPad 的平台能力矩阵发生变化。
