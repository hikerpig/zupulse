---
feature: viewer-playback-navigation
title: Viewer Playback Navigation
status: current
delivery: available
last_verified: 2026-08-12
hosts:
  - browser
  - desktop
implementation_paths:
  - packages/web-core/src/gp/alphaTabBrowser.ts
  - packages/web-core/src/playback
  - packages/web-viewer/src/score-navigation
  - packages/web-viewer/src/features/piano-key-visualization
  - packages/web-viewer/src/features/playback-workspace
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

### 谱面宽度与缩放

- 宽屏默认使用居中的 Comfortable 阅读宽度，谱面框最大宽度为 `960px`；用户可切换 Full width，
  该偏好保存在设备本地，并由 Viewer 与 Studio 共用。
- Viewer 与 Studio 共用紧凑的 alphaTab 字体资源：标题 28px、副标题 18px，其余常用谱面标注相对
  原默认值下调 1–2px；宿主不得单独覆盖出不同的谱面密度。
- 缩放范围为 50%–200%，以 10% 为步长。工具栏百分比可直接复位为 100%，并支持
  `Ctrl/Cmd +`、`Ctrl/Cmd -` 与 `Ctrl/Cmd 0`。
- 缩放提交先更新 alphaTab settings，再显式触发 render；宽度切换也进入同一阅读锚点恢复生命周期。
  重排完成后优先恢复视口中心的书面谱表行，bounds 暂不可用时按相对滚动位置降级。连续缩放只在
  最新 render 完成后恢复位置；播放位置与 Loop 状态不因缩放或宽度切换改变。
- 窄屏隐藏宽度切换，使用全宽谱面；缩放控件保持可触达且不得造成横向溢出。
- Transport 速度弹层锚定其可见触发器；响应式切换让该触发器离开布局时，弹层自动关闭。窄屏练习
  面板内独立的速度入口仍可正常打开，并遵循 Escape 关闭后恢复触发器焦点。

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

### 练习设置

- 常规“练习设置”入口打开任务概览，展示速度入口以及“节拍与预备拍”“练习手”“琴键引导”
  “设置循环区间”“选择主轨道”五项任务；
  当前轨道、速度与 Loop 状态不再作为单独的 Session section。
- “节拍与预备拍”分别保存显式开关与整数百分比音量，默认关闭，首次音量分别为 60% 和 70%。
  两项设置按 Library Score 写入 Practice Sidecar，并在 Browser 与 Desktop 共用的 Controller
  初始化路径恢复。Metronome 在播放期间持续生效；一小节 Count-in 只用于新的播放开始，从 pause
  恢复不会重新启动。
- Count-in 期间 Transport 显示可感知的“预备拍”状态并提供暂停操作。alphaTab 没有可靠公开当前拍
  序号，因此界面不显示推测的拍进度。音频 loading 或 error 时控制保持可发现但禁用，并显示就地原因。
- 对唯一双非打击乐 Staff Track，练习手支持双手示范、练右手和练左手。单手模式使用内存 Score
  副本生成 Staff 级 MIDI 投影，默认仅播放另一只手作为伴奏；临时试听目标手不持久化。切换不改变
  来源谱、渲染 Score 或 Track Mixer facts，播放中采用暂停、加载、恢复 tick 和继续播放的安全路径。
  目标 Staff 只使用低权重谱面 overlay 强调。
- Transport 的“循环模式”按钮直接打开或关闭模式，不打开练习设置。首次打开且没有可用区间时，
  以播放头所在小节建立默认 A/B；再次打开恢复保留的草稿或已选 Loop。
- Loop 草稿在 alphaTab 谱面上显示跨谱表行区间与 A/B 手柄；指针或触摸拖动按当前吸附规则更新
  `PlaybackController`，键盘方向键按拍移动边界。完整 A/B 草稿在 handle 提交后立即启用为临时
  Loop，不写入 Sidecar；“保存区间”才将其持久化为可复用 Loop。
- 设置面板提供与 Transport 同步的“循环模式”Switch。关闭模式会停止循环并隐藏谱面编辑层和
  保存、吸附编辑项，但保留 A/B；已保存片段仍可访问，选择片段会自动打开模式。关闭抽屉不关闭
  模式。设置面板不提供 Set A/B 或 A/B Slider。小屏练习面板改为底部面板，编辑时仍保留谱面上下文。
- 主轨道任务复用主轨道、附加显示、静音、独奏和音量命令。任务返回只回到概览，不关闭抽屉。
- 打开概览后焦点进入关闭按钮；进入任务后焦点进入返回按钮。Escape 关闭抽屉并恢复普通练习设置
  触发器焦点。
- playback 尚不可用时仍显示相同任务概览，但所有领域动作禁用并显示原因。

### 琴键引导

- 唯一双非打击乐 Staff Track 可从练习设置或 Transport 右侧工具区的琴键引导按钮打开会话级琴键引导；默认关闭，
  刷新或重新进入 Viewer 后保持关闭，不写入 Practice Sidecar 或设备偏好。完整时间轴在用户首次打开时
  惰性生成并在 Session 内复用；Staff mapping 合格但单手音频隔离不可用时，视觉提示仍然可用。Transport
  按钮以 `aria-pressed` 反映开关状态，不可用时保持禁用。
- 提示区位于乐谱下方、Transport 上方，关闭后归还乐谱空间。当前发声键按手色高亮（左手 signal purple、
  右手 signal blue），coral 只用于击打线；正在发声的提示块相对未到达的提示块加亮。预览窗口跟随当前
  有效速度（baseTempo × scoreSpeed）固定提前约 2 秒，并限制在 2–8 个四分音符之间；提示块以长度表达
  时值。双手示范显示双手，单手练习只显示目标手。
- 空间允许时提示区默认高 260px，可从顶部分隔条在 180–420px 内拖动或用键盘调整；短窗口至少保留
  180px 谱面。谱面滚动区与钢琴 Grid 行之间保持 8px 可见间距，钢琴不得 overlay 谱面。关闭再打开
  保留当前 Viewer Session 高度，source 变化时复位，不写入持久化偏好。ResizeObserver 的高度回写延迟到
  下一帧，避免拖拽时触发 ResizeObserver loop 错误。
- 事件来自 alphaTab `MidiFileGenerator` 展开的 Staff 播放投影，使用包含 channel transposition 的
  发声音高和半开区间 `[startTick, endTick)`；反复形成独立 occurrence，连音保持连续事件，来源 Score
  不被修改。
- animation frame 直接读取 alphaTab tick 并只更新可视化 SVG；逐帧数据不进入 React state 或
  `PlaybackController` snapshot。事件按时间索引后只查询当前窗口，提示 rect 复用节点池且 active key
  只更新变化项；卸载会取消逐帧运行时。
- 不适用或投影失败时任务仍可发现，但显示语义化原因并保持禁用；普通乐谱播放不受影响。

### 生命周期与降级

- render、resize、zoom 和轨道重排使用递增 generation；旧回调不能覆盖新投影。
- staff-system bounds 暂不可用时不阻断播放，保留模式偏好并等待下一次完整 render。
- Session destroy 清理选择、alphaTab 导航事件、输入监听、ResizeObserver、Controller 和预览状态。
- Viewer route 在 Session 与首次 alphaTab render 完成前维持 loading surface。Managed Score 读取、
  Session 初始化和 Render 失败分别形成 `viewer-library-failed`、`viewer-session-failed` 与
  `viewer-render-failed`，错误停留在 Viewer 并可就地重试，不回写 Library 全局不可用状态。
- Viewer runtime 只消费 React route 显式注册的 `ViewerDomBindings`；Viewer route 不依赖固定 DOM ID
  定位谱面宿主、滚动宿主、标题或状态节点。

## 平台能力矩阵

| 能力                                 | Browser | Desktop | 当前差异 |
| ------------------------------------ | ------- | ------- | -------- |
| Continuous Follow / Detached         | 支持    | 支持    | 无       |
| Page Turn 与设备本地偏好             | 支持    | 支持    | 无       |
| PageUp/PageDown、wheel、swipe        | 支持    | 支持    | 输入设备 |
| Comfortable / Full width 与缩放      | 支持    | 支持    | 无       |
| 精确 Playback Occurrence 谱面定位    | 支持    | 支持    | 无       |
| Transport latest-only 游标与视口预览 | 支持    | 支持    | 无       |
| Loop-aware 临时页面                  | 支持    | 支持    | 无       |
| 任务式练习设置                       | 支持    | 支持    | 无       |
| Metronome / 一小节 Count-in          | 支持    | 支持    | 无       |
| 钢琴按键当前状态与四拍预提示         | 支持    | 支持    | 无       |

本轮自动化验收平台是 Chromium Browser Demo；iOS WebView 和实体 iPad 不属于本 Contract 的已验证宿主。

## 领域不变量

1. alphaTab 拥有音频时钟、动画游标、beat 命中和渲染坐标。
2. `PlaybackController` 拥有正式 transport、seek、Playback Occurrence、Loop 和持久化语义。
3. `ScoreNavigationCoordinator` 位于 Viewer DOM 边界，拥有 Follow State、Screen Score Page 和视口。
4. React 只消费低频 transport 与导航 snapshot；逐帧游标几何和 `scrollTop` 不进入 React。
5. Scrub Preview 是唯一可绕过正式 state 的临时 engine 路径，松手必须正式提交。
6. Score Navigation Mode 是设备偏好；Following / Detached 和页码只属于当前 Session。
7. Metronome 与 Count-in 是独立的 Practice Sidecar 设置；React 只派发领域命令，alphaTab 音量和
   Count-in 生命周期由 Playback Engine / Controller 边界管理。
8. 钢琴按键时间轴是来源 Score 的不可变派生；React 不接收 `AlphaTabApi`，逐帧 tick 与几何不进入应用
   state 或持久化层。逐帧投影不得扫描整首事件或销毁重建完整 SVG 提示层。

## 明确非目标

- 打印分页、出版排版、alphaTab Horizontal 长卷或自研谱表虚拟化。
- 持久化 Screen Score Page 页码或把导航模式写入 Practice Sidecar。
- 通过 Scrub Preview 写入 resume、Loop 或练习进度。
- 本轮 iOS、Xcode、实体 iPad 验收。
- 不通过 Track Mixer 状态模拟 Staff 音频隔离；运行时投影失败或结构无法唯一判定时必须显示语义化
  unavailable 原因，并保持普通播放可用。
- 不接收 MIDI 键盘输入、不做演奏评分或指法推荐，也不提供可调提前量、全屏瀑布模式或开关持久化。

## 验收契约

- 播放跨谱表行或页面只移动谱面滚动容器，文档根节点不滚动。
- 手动浏览保持 Detached；正式定位、stop 或恢复动作回到 Following。
- Page Turn 的每个离散输入最多移动一页；resize 和 zoom 后保留书面锚点。
- 宽屏默认居中且不超过 960px；Full width 偏好刷新后保留。缩放与宽度切换会实际重排谱面并保持
  当前书面位置，连续缩放只提交最新布局；100% 复位和键盘快捷键可用，窄屏不产生横向溢出。
- 谱面点击只提交一次正式 seek，且不改变 playing/paused transport。
- Scrub 每帧最多发送一个最新预览，松手只提交一次正式 seek。
- playing position snapshot 最多约 10Hz；pause、stop、seek 和 Loop 语义立即可观察。
- 常规练习入口进入任务概览；Transport Loop 按钮直接切换模式且不打开抽屉，返回与 Escape 焦点稳定。
- 节拍器和预备拍可独立开启、调整音量并在刷新后恢复；新开始执行预备拍，pause 后恢复不重复执行，
  设置变化不改变 tempo、Loop、position 或 Track Mixer facts。
- eligible 钢琴谱可切换练习手并刷新恢复；临时试听不持久化。切换前后 tempo、Loop、position 和
  Track Mixer facts 保持不变，播放中切换不会停留在暂停状态。
- eligible 钢琴谱可打开按键提示并看到当前键、未来四拍内目标与时值；双手与单手过滤正确。关闭后
  恢复乐谱空间且不改变播放和练习 facts；刷新后默认关闭。提示区默认 260px，可在 180–420px 内拖动
  或键盘调整并在短窗口保留谱面；窄屏不产生横向溢出或遮挡 Transport。
- 进入空 Loop 草稿时按当前小节建立 A/B；谱面手柄与 Controller 草稿保持一致，A/B 手柄可用键盘
  按拍调整；提交完整草稿后立即进入临时 Loop。关闭模式隐藏编辑层并保留 A/B，再次打开恢复；
  抽屉 Switch 与 Transport 同步，抽屉不显示 Set A/B 或 A/B Slider。

## 证据地图

| 契约                        | 代码                                                                                             | 测试                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| alphaTab 公开导航边界       | `packages/web-core/src/gp/alphaTabBrowser.ts`                                                    | `packages/web-core/src/gp/__tests__/alphaTabBrowser.test.ts`    |
| occurrence 精确解析         | `packages/web-core/src/score/positions.ts`、`packages/web-core/src/playback/writtenSelection.ts` | 相邻 `__tests__`                                                |
| Follow State 与页面协调     | `packages/web-viewer/src/score-navigation`                                                       | `packages/web-viewer/src/score-navigation/__tests__`            |
| 模式、页码与恢复 UI         | `packages/web-viewer/src/features/playback-workspace`                                            | `PlaybackWorkspace.test.tsx`、feature-local tests               |
| 谱面宽度、缩放与位置恢复    | `packages/web-viewer/src/components/ScoreViewer.tsx`、`packages/web-viewer/src/viewerApp.tsx`    | `ScoreViewer.test.tsx`、`viewerApp.test.ts`、Playwright         |
| 练习设置任务、降级与焦点    | `packages/web-viewer/src/features/playback-workspace`                                            | `PlaybackWorkspace.test.tsx`、feature-local tests               |
| 谱面 Loop 区间与 A/B 手柄   | `packages/web-viewer/src/practice-loop`、`packages/web-viewer/src/components/ScoreViewer.tsx`    | `loop-range-geometry.test.ts`、`ScoreViewer.test.tsx`           |
| position 发布预算           | `packages/web-core/src/playback/playbackController.ts`                                           | `playbackController.test.ts`                                    |
| 节拍、预备拍与 Sidecar 迁移 | `packages/web-core/src/playback`、`packages/web-core/src/storage/sidecar.ts`                     | `playbackSidecar.test.ts`、`sidecar.test.ts`、`library.spec.ts` |
| Piano Hand 结构 eligibility | `packages/web-core/src/playback/pianoHandMapping.ts`                                             | `pianoHandMapping.test.ts`                                      |
| Staff 音频投影与谱面强调    | `alphaTabStaffAudioProjection.ts`、`packages/web-viewer/src/practice-hand`                       | 相邻单元测试、`ScoreViewer.test.tsx`、`library.spec.ts`         |
| 钢琴按键时间轴与逐帧投影    | `alphaTabPianoKeyTimeline.ts`、`packages/web-viewer/src/features/piano-key-visualization`        | 相邻单元测试、`PlaybackWorkspace.test.tsx`、`library.spec.ts`   |
| Browser 长谱与响应式流程    | `apps/web-demo/e2e/library.spec.ts`                                                              | Playwright Chromium                                             |

## 相关资料

- 当前架构：[`viewer-score-navigation.md`](../../architecture/viewer-score-navigation.md)
- 决策：[`ADR 0064`](../../adr/0064-coordinate-score-navigation-with-playback.md)
- 初步 Spec：
  [`2026-07-25-viewer-score-navigation-playback-sync-design.md`](../../specs/2026-07-25-viewer-score-navigation-playback-sync-design.md)
- UI 契约：[`DESIGN.md`](../../../DESIGN.md)

## 维护触发器

- alphaTab player、bounds、cursor、tick cache 或 user interaction API 变化。
- occurrence 回退、谱面手势、Scrub Preview 或正式 seek 语义变化。
- Screen Score Page、Loop 重组、输入去重、Follow State 或模式持久化变化。
- 谱面宽度模式、缩放范围、alphaTab 重绘或缩放后位置恢复变化。
- position 发布预算、resume flush 或 Session 清理变化。
- 钢琴按键 eligibility、事件时间轴、提前窗口、音域、手部过滤、session-only 开关或高度调整语义变化。
