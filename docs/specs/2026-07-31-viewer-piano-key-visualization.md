# Viewer 琴键引导 Spec

本文描述本次功能变更的目标与验收边界，不是当前运行时行为或实施进度的事实源。当前 Viewer 行为仍以
[`Viewer Playback Navigation Feature Contract`](../features/contracts/viewer-playback-navigation.md)、
运行时代码与测试为准。

## 目标

为适用的钢琴谱提供一个默认关闭、可折叠的练习可视化：用户在阅读乐谱和跟随播放时，能看到当前按下
的琴键、即将按下的琴键以及音符持续时值。可视化位于乐谱下方、Transport 上方；关闭后必须完整归还
乐谱空间。

首版服务于从乐谱到键盘位置的过渡学习，不把 Viewer 变成独立的瀑布流演奏游戏。乐谱继续是 Viewer
的视觉中心。

## 产品决策

- 只对现有 `PianoHandMapping` 判定为 `available` 的唯一双非打击乐 Staff Track 开放。
- 提前窗口跟随当前有效速度（baseTempo × scoreSpeed），固定提前约 2 秒墙钟时间，并限制在 2–8 个
  四分音符之间。变速与 tempo change 改变提示的运动距离，但保持下落体感速度一致。
- 双手示范显示左右手；练右手只显示右手目标，练左手只显示左手目标。伴奏手是否发声不改变目标提示。
- 音高表达实际发声的 MIDI key。事件采用半开区间 `[startTick, endTick)`，音符到达 `startTick` 时
  琴键按下，到达 `endTick` 时释放。
- 左右手使用两种低权重 signal 色，并同时用可测试的 hand 语义区分；不能只依赖颜色。
- 键盘音域由整份曲谱稳定派生并留出上下文，播放期间不自动平移。极端音域允许整体压缩，不增加第二
  个横向滚动宿主。
- 开关默认关闭，仅属于当前 Viewer Session。首版不写入 Practice Sidecar 或设备偏好。
- 不适用或事件投影失败时，练习设置仍显示该任务及语义化原因，但不能打开空的可视化区域。

## 工程边界

`web-core` MUST generate an immutable expanded playback timeline from the same alphaTab
`MidiFileGenerator` semantics used by audio playback. Each hint event MUST contain:

```ts
type PianoKeyHintEvent = {
  pitch: number;
  startTick: number;
  endTick: number;
  hand: "right" | "left";
};
```

- Events MUST be normalized to the `AlphaTabApi.tickPosition` axis, including `tickShift` removal.
- Sounding pitch MUST include alphaTab channel transposition and remain within MIDI `0..127`.
- Repeats, ties, grace timing, tuplets, tempo changes, and note effects MUST NOT be reinterpreted from written
  beats when the generated playback events already express them.
- Overlapping events for the same pitch MUST keep the key active until every active occurrence has ended.
- Invalid or zero-length events MUST be omitted. Timeline generation MUST NOT mutate the rendered source Score.
- `web-viewer` MUST NOT receive the alphaTab API object. It may consume only the immutable event timeline and a
  narrow session-owned playback tick reader or imperative runtime.
- Per-frame geometry MUST NOT be published through `PlaybackController`, React context, Zustand, or persisted
  state. React owns the opt-in UI and accessibility structure; a session-owned runtime owns high-frequency visual
  updates and cleanup.
- Seek, stop, loop wrap, and route teardown MUST replace stale visual state on the next frame and cancel pending
  work. Pause MUST freeze the projection at the current tick.

## UI 与布局

- 开关入口属于“练习设置”的任务列表，并在 Transport 右侧工具区提供低权重图标开关，不与播放、
  停止等主操作争夺权重。
- 可视化形成一个紧凑的底部工作区：提示轨道在上，钢琴键盘在下，使用边界而非卡片或明显阴影建立
  层级。
- 音符块抵达键盘的边缘表达 onset；块长度表达 duration；当前 active key 有非颜色状态差异。
- 区域提供简短中文 accessible name，但 88 个琴键不成为 88 个可聚焦按钮，也不使用高频
  `aria-live` 播报。
- 空间允许时区域默认高 260px；顶部分隔条可拖动到 180–420px，并支持方向键、Home / End 与双击
  复位。短窗口动态限制上限并至少给乐谱保留 180px；谱面与钢琴之间保留 8px 可见分隔，钢琴不得以
  overlay 覆盖谱面；关闭再打开保留当前 Viewer Session 高度。
- `390px`、`620px` 与宽屏下不得产生 document 横向溢出，并必须保留折叠入口和 Transport 关键操作。
- 时间运动属于功能信息。`prefers-reduced-motion` 下移除额外 easing/transition，但仍直接呈现当前与
  即将到来的音符。

## Non-goals

- MIDI 文件产品导入、外接 MIDI 键盘输入、演奏评分、指法推荐或游戏化判定。
- 任意多轨/多谱表手工映射、打击乐键盘、非十二平均律键盘或 Studio 预览。
- 可调提前量、可调键盘音域、独立全屏瀑布模式或开关持久化。
- 推断踏板、手指编号或把音符名称做成持续播报。
- 新增 Browser、Desktop 或 iPad Bridge API。

## Acceptance criteria

- [ ] An eligible piano score exposes an opt-in piano-key visualization below the score and above Transport.
- [ ] Closing the visualization restores the score area without changing transport, position, loop, tempo,
      track mix, or piano-hand practice state.
- [ ] The timeline contains separate right/left expanded playback occurrences with exact positive durations and
      does not mutate the source Score.
- [ ] A repeated written note appears once per playback occurrence; a tied note remains one continuous event.
- [ ] Hint visibility follows an effective-tempo-adaptive lookahead (about two seconds, clamped to two to eight
      quarter notes) and half-open `[startTick, endTick)` semantics.
- [ ] Chords activate all pitches together; overlapping occurrences of the same pitch release only after the last
      active occurrence ends.
- [ ] Both-hands mode shows both hands; right-hand and left-hand practice show only the corresponding target hand.
- [ ] Pause freezes the visual state; seek, stop, speed changes, and loop wrap resynchronize without stale keys or
      hint blocks.
- [ ] Ineligible and failed projections remain discoverable with semantic unavailable copy and do not block normal
      score playback.
- [ ] Per-frame updates stay outside React application state and all animation/session resources are released on
      unmount or Viewer Session destroy.
- [ ] Chinese and English catalogs remain structurally identical; user-visible errors never expose raw exceptions.
- [ ] Light/Dark and `390px`/`620px`/desktop layouts keep the score primary and introduce no horizontal overflow.
- [ ] The visualization defaults to 260px when space permits, resizes between 180px and 420px by pointer or
      keyboard, preserves at least 180px for the score, and retains height only within the current Viewer Session.
