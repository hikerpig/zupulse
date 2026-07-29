---
status: draft
last-reviewed: 2026-07-29
feature: viewer-foundational-practice-tools
---

# Viewer 基础练习能力产品 Spec

## 文档定位

本 Spec 定义 Viewer 的两项 P0 目标能力：

1. Metronome and Count-in；
2. Piano Hand Practice。

它描述目标行为，不是当前运行时事实源。当前能力仍以
[`Viewer Playback Navigation Feature Contract`](../../features/contracts/viewer-playback-navigation.md)、
运行时代码、schema 和测试为准。

研究输入：
[`Viewer 跟练与学习体验评审`](../../evaluation/2026-07-29-viewer-practice-learning-experience-review.md)。

实现拆分：
[`tasks/viewer-foundational-practice/plan.md`](../../../tasks/viewer-foundational-practice/plan.md)。

## Assumptions

1. 首次交付同时覆盖 Browser 与 Desktop，共用同一份 `web-core` 契约和 React UI。
2. 设置按 Library Score 写入 Practice Sidecar，不跨设备同步，也不写回来源乐谱。
3. 首版 Count-in 是一小节，不包含每轮 Loop 前重复预备拍和 2–3 小节长度选择。
4. “练右手”表示右手由用户演奏、左手由系统伴奏；“练左手”语义相反。
5. 首版不使用音高阈值猜测左右手，只接受可确定的双 staff 钢琴结构。
6. 麦克风、MIDI 输入、自动正确率评分、自动加速和教师任务不属于本 Spec。
7. alphaTab 1.8.4 的 Metronome / Count-in 原生能力可作为引擎实现基础；staff 级音频隔离必须先通过
   技术 Spike 证明。

假设发生变化时必须先更新本 Spec，再修改实现计划。

## Objective

### 用户问题

初学者点击播放后没有准备时间，也没有稳定拍点；面对钢琴大谱表时，只能操作 Track Mixer，
无法用“左手、右手、双手”组织练习。

### 产品目标

Viewer MUST 让用户在不理解数字音乐 Track 概念的前提下：

- 打开节拍器；
- 在正式播放前获得一小节预备拍；
- 选择“双手示范”“练右手”或“练左手”；
- 在下次打开同一份 Library Score 时恢复这些练习设置。

### 成功信号

- 新用户能在练习设置首层发现节拍与手部练习入口。
- 用户可以在不打开 Track Mixer 的情况下完成一次分手练习。
- Metronome、Count-in、tempo、Loop 和 hand mode 组合时没有互相重置。
- 非钢琴谱和无法可靠识别双 staff 的钢琴谱不会得到错误的左右手控制。

## User Stories

### 学琴半年新手

- 作为新手，我希望播放前先听到一小节预备拍，以便把手放好并在正确拍点开始。
- 作为新手，我希望练习时持续听到节拍器，以便知道自己是否越弹越快或越弹越慢。
- 作为新手，我希望选择“练右手”，让系统播放左手伴奏，以便先掌握单手。
- 作为新手，我希望随时试听目标手，以便确认自己应该演奏什么。

### 钢琴教师

- 作为教师，我希望用“左手、右手、双手”而不是 Track / Mute / Solo 设置课堂演示。
- 作为教师，我希望为一份谱保存节拍器、预备拍和练习手设置，以便下次继续教学。
- 作为教师，我希望不符合钢琴双 staff 结构的谱明确说明不可用原因，而不是提供可能错误的控制。

## Product Behavior

### 1. Metronome

练习设置首层新增“节拍与预备拍”任务。Transport 不新增常驻文字控件，避免降低乐谱和播放主操作
的视觉优先级。

Metronome 设置：

- `enabled`: Boolean；
- `volume`: integer percentage in `[0, 100]`；
- 默认关闭；
- 首次打开使用 60% volume；
- 开启后在播放期间按谱面 tempo map 发声；
- tempo 或 score speed 改变时，点击声与当前播放速度保持一致；
- pause、stop 和 audio error 时不继续发声。

设置面板必须同时显示开关和音量，不能用 `volume > 0` 作为用户可见的唯一开启状态。

### 2. Count-in

Count-in 设置：

- `enabled`: Boolean；
- `volume`: integer percentage in `[0, 100]`；
- 默认关闭；
- 首次打开使用 70% volume；
- 时长为当前开始位置所处拍号的一小节；
- 只在用户从 `ready` / `stopped` 发起一次新的播放时执行；
- 从 `paused` 恢复不重复 Count-in；
- Count-in 结束后无缝进入正常播放，不能额外 seek；
- Count-in 使用即将开始播放的有效速度；
- Count-in 与 Metronome 可以独立开启。

首版不承诺：

- 每次 Loop 重新开始前 Count-in；
- 2–3 小节长度选择；
- 人声数字报拍；
- downbeat-only 模式。

Count-in 期间 Transport MUST 提供可感知的 `counting-in` 状态。若引擎不能提供可靠的当前拍序号，
UI 只显示“预备拍”，不得伪造 `1 / 4` 进度。

### 3. Piano Hand Practice

练习设置首层新增“练习手”任务。可用时提供三个互斥模式：

| Mode         | UI label | 系统播放   | 用户练习 | 谱面                   |
| ------------ | -------- | ---------- | -------- | ---------------------- |
| `both-hands` | 双手示范 | 左手与右手 | 跟随双手 | 双 staff 正常          |
| `right-hand` | 练右手   | 左手伴奏   | 右手     | 右手强调，左手降低权重 |
| `left-hand`  | 练左手   | 右手伴奏   | 左手     | 左手强调，右手降低权重 |

单手模式提供“试听本手”临时动作：

- 按住或激活时只播放目标手；
- 退出试听后恢复当前练习模式；
- 试听状态不持久化；
- 试听不得修改 Track Mixer 的持久化 Mute、Solo 或 Volume。

### 4. Hand Eligibility

系统只有在能够建立明确的 `PianoHandMapping` 时才显示可操作的 hand mode：

```ts
type PianoHandMapping = {
  trackId: string;
  rightStaffId: string;
  leftStaffId: string;
};
```

首版映射要求：

- 同一个可播放 Track；
- 正好两个非打击乐 staff；
- 来源结构能确定上方 staff 与下方 staff；
- staff identity 在同一来源文件重新打开后稳定。

系统 MUST NOT：

- 仅按音高阈值猜左右手；
- 把两个独立乐器 Track 自动当成钢琴左右手；
- 把 voice 当成独立 hand；
- 修改 Managed Score Copy 或来源文件以实现练习模式。

不满足条件时保留 Track Mixer，并显示语义原因：

- `piano-hand-practice-not-applicable`
- `piano-hand-practice-ambiguous`
- `piano-hand-practice-audio-unsupported`

`web-core` 只返回 code 和 context；用户文案由 `@zupulse/app-i18n` 提供。

### 5. Interaction with Existing Playback

- 切换 Metronome、Count-in 或 hand mode 不改变 position、tempo、Loop、navigation mode 或 transport。
- playing 中切换 Metronome 可立即生效。
- playing 中切换 hand mode 在下一安全音频边界生效，不允许卡音；若 alphaTab 无法安全热切换，
  UI MUST 暂停并明确提示，不能静默重建 Session。
- Loop 区间和 hand mode 正交；“练右手”时每轮仍只播放左手伴奏。
- Stop 保持当前设置并回到既有停止位置语义。
- Track Mixer 的显示轨道事实不被 hand mode 改写。
- Solo 仍是 Session-only；hand mode 不通过持久化 Solo 模拟。

## Persistence Contract

Practice Sidecar 目标结构：

```ts
type PracticePlaybackSidecar = {
  rhythm: {
    metronome: { enabled: boolean; volume: number; updatedAt: string };
    countIn: { enabled: boolean; volume: number; updatedAt: string };
  };
  pianoPractice: {
    mode: "both-hands" | "right-hand" | "left-hand";
    updatedAt: string;
  };
  // existing scoreSpeed, loops, visibility and tracks remain unchanged
};
```

- Persisted values MUST be validated by Zod.
- Absent values from older Sidecars MUST migrate to disabled Metronome, disabled Count-in and `both-hands`.
- A Sidecar schema-version decision is required before implementation. The preferred direction is an explicit
  `0.2.0 → 0.3.0` migration rather than silently changing the strict `0.2.0` payload.
- If the current score no longer has the persisted `PianoHandMapping`, runtime falls back to `both-hands` without
  deleting the saved value; the UI explains why the requested mode is unavailable.

## State Model

`PlaybackState.transport` target extension:

```ts
type TransportState = "idle" | "loading" | "ready" | "counting-in" | "playing" | "paused" | "stopped" | "error";
```

`PlaybackController` remains the single formal command owner:

```ts
type PlaybackCommand =
  | { type: "set-metronome"; enabled: boolean }
  | { type: "set-metronome-volume"; volume: number }
  | { type: "set-count-in"; enabled: boolean }
  | { type: "set-count-in-volume"; volume: number }
  | { type: "set-piano-hand-mode"; mode: PianoHandMode }
  | { type: "preview-piano-target-hand"; active: boolean };
```

`PlaybackEngine` owns audio execution. React MUST NOT derive audio state or write directly to alphaTab.

## UX and Accessibility

- Viewer 保持 Design Variance 4/10、Motion Intensity 3/10、Visual Density 8/10。
- 新入口进入现有任务式练习设置，不增加 Dashboard、引导卡片墙或常驻说明区。
- “节拍与预备拍”“练习手”使用中文任务语言；不得把 `Metronome`、`Count-in`、`Staff` 暴露给
  `zh-CN` 用户。
- 所有 Toggle、Slider、Segmented control 与试听动作必须有 accessible name、focus-visible、
  disabled reason 和键盘操作。
- 状态不能只依赖颜色。被练习的 staff 使用低权重强调和文字状态，不改变用户内容、音符颜色或
  和弦符号语义。
- 窄屏使用现有底部练习面板，必须保留足够谱面上下文。
- Count-in 和持久化失败使用就地状态；不使用长期 toast 传达关键事实。

## Failure and Degraded States

| State                              | Required behavior                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| SoundFont loading                  | Controls remain visible but disabled with a localized reason.                                                             |
| SoundFont error                    | Metronome, Count-in and hand audio actions are disabled; playback retry remains available.                                |
| Hand mapping unavailable           | Hand task remains discoverable and explains why it is unavailable.                                                        |
| Sidecar write failure              | Active session keeps the selected settings and reports unsaved state.                                                     |
| Sidecar migration failure          | Existing score remains viewable; unsupported persisted practice settings are not applied.                                 |
| Staff-audio hot switch unsupported | The implementation follows the approved fallback from the feasibility gate; it MUST NOT silently corrupt Track mix state. |

## Non-goals

- Mic / MIDI listening and note correctness scoring.
- Automatic speed ramp or repetition goals.
- Per-loop Count-in and multi-bar Count-in.
- Human voice counting.
- Teacher accounts, assignment sharing or cloud sync.
- Automatic piano-hand inference from pitch, channel or note density.
- Editing source fingerings or writing any setting back into GP / MusicXML / MXL.
- Replacing the advanced Track Mixer.

## Tech Stack and Project Structure

- Domain, Zod and playback commands:
  `packages/web-core/src/playback/`
- alphaTab public boundary:
  `packages/web-core/src/gp/alphaTabBrowser.ts`
- React task UI:
  `packages/web-viewer/src/features/PlaybackWorkspace.tsx`
- Presentation:
  `packages/web-viewer/src/playbackPresenter.ts`
- Localized copy:
  `packages/app-i18n/src/locales/`
- Browser journey:
  `apps/web-demo/e2e/library.spec.ts`
- Current Feature Contract:
  `docs/features/contracts/viewer-playback-navigation.md`

No new dependency is expected. Any staff-audio solution that requires a dependency or source-file rewrite must
stop for review.

## Code Style

Exact domain values use named string unions and named exports:

```ts
export type PianoHandMode = "both-hands" | "right-hand" | "left-hand";

export type PianoHandPracticeState = {
  mode: PianoHandMode;
  availability: "available" | "not-applicable" | "ambiguous" | "audio-unsupported";
};
```

- Prettier double quotes；
- named exports；
- `__tests__/*.test.ts(x)`；
- absent optional properties are omitted, not assigned `undefined`；
- no workspace deep imports；
- no user-visible inline literals outside `@zupulse/app-i18n`。

## Testing Strategy

### Unit

- Zod ranges, defaults and Sidecar migration.
- `PlaybackController` command/state/persistence semantics.
- Hand eligibility and stable staff mapping.
- alphaTab adapter mapping for volume, Count-in, Metronome and staff audio.

### Component

- Task discovery, labels, disabled reasons and focus restoration.
- Metronome / Count-in independence.
- Three hand modes and temporary target-hand preview.
- Narrow viewport layout and unsaved/error state.

### E2E

- Browser sample completes Count-in, then starts playback with Metronome.
- A piano multistaff fixture switches between both/right/left without changing Loop, tempo or visible Track facts.
- Refresh restores persisted settings.
- Non-piano fixture exposes the disabled reason and keeps normal playback available.
- Desktop receives the same shared-domain behavior through its existing Sidecar path.

## Commands

```bash
pnpm vitest run packages/web-core/src/playback
pnpm vitest run packages/web-viewer/src/features/__tests__/PlaybackWorkspace.test.tsx
pnpm check:i18n
pnpm check:docs
pnpm verify:fast
pnpm verify
pnpm verify:e2e
pnpm format:check
git diff --check
```

Run the smallest affected command first. Escalate to `pnpm verify:e2e` after the Browser and Desktop integration
paths exist.

## Boundaries

### Always

- Route all formal practice commands through `PlaybackController`.
- Validate persisted inputs with Zod.
- Keep Browser and Desktop behavior aligned.
- Preserve position, Loop, tempo and Track Mixer facts across setting changes.
- Update the Current Feature Contract only after behavior is implemented and verified.

### Ask First

- Add a dependency.
- Choose a staff-audio implementation that rewrites or clones source score data.
- Change the Sidecar version or migration policy from the preferred `0.3.0` direction.
- Pause/rebuild the active Session when switching hand mode.
- Expand Count-in beyond one bar or execute it before every Loop cycle.

### Never

- Guess piano hands from pitch ranges in this layer.
- Put translated copy or translation keys in `web-core`.
- Persist temporary target-hand preview or Solo state.
- Mutate Managed Score Copy.
- Expose raw alphaTab exceptions in the DOM.

## Acceptance Criteria

### Metronome and Count-in

- [ ] A user can independently enable Metronome and one-bar Count-in from the practice task UI.
- [ ] Volume values are validated, persisted per Library Score and restored after reopening.
- [ ] Count-in runs for a new start but not for resume from pause.
- [ ] Tempo changes affect Metronome and Count-in consistently.
- [ ] Loop, position, navigation mode and Track mix facts remain unchanged.
- [ ] Loading, error, disabled, counting-in, playing, paused and stopped states are observable and accessible.

### Piano Hand Practice

- [ ] An eligible two-staff piano exposes both-hands, right-hand and left-hand modes.
- [ ] Right-hand mode plays left-hand accompaniment; left-hand mode plays right-hand accompaniment.
- [ ] Temporary target-hand preview restores the selected practice mode and is not persisted.
- [ ] Hand mode does not rewrite Track visibility, mute, solo or volume state.
- [ ] Ambiguous and non-applicable scores never receive an inferred hand mapping.
- [ ] The selected mode persists per Library Score and degrades safely if eligibility changes.

### Cross-cutting

- [ ] Browser and Desktop share the same domain contract and user-visible behavior.
- [ ] `pnpm check:i18n`, `pnpm check:docs`, `pnpm format:check` and `git diff --check` pass.
- [ ] Relevant unit, component and Browser E2E tests pass.
- [ ] The Current Feature Contract is updated only after the target behavior is verified.

## Open Questions

1. Can alphaTab 1.8.4 expose a reliable Count-in lifecycle and current beat without custom MIDI-event handling?
2. Can staff audio be isolated without mutating the loaded score or rebuilding the player?
3. If hot switching staff audio is unsafe, is a short explicit pause acceptable?
4. Should Metronome / Count-in settings be per-score only, or should a later global default seed new scores?
5. Should “试听本手” use press-and-hold, a temporary Toggle, or a one-pass playback command?

Questions 1–3 are blocking feasibility gates. Questions 4–5 can use the defaults in this Spec for the first
implementation and be refined after usability testing.

## Feasibility Gate Result

`2026-07-29` 针对当前固定依赖 alphaTab `1.8.4` 的结果如下：

1. Count-in 音频受公开的 `countInVolume` 控制。alphaTab 在 Count-in 开始前发布 `playing`，进入主播放
   时再次发布 `playing`，Count-in 期间不发布主播放位置。当前适配层只公开可靠的
   `count-in-started` / `count-in-ended`，不伪造当前拍序号。
2. alphaTab 的 `play()` 在 `countInVolume > 0` 时总会重新调用 `startCountIn()`。因此 Controller
   只在新开始时保留 Count-in；从 pause 恢复时通过显式 `skipCountIn` 操作继续当前播放，不启动新的
   Count-in。Loop 回绕不会重新执行 Count-in。
3. alphaTab 公共播放器 API 只提供 Track 级 mixer，无法直接隔离同一 Track 内的两个 Staff。经明确
   批准，运行时采用内存投影：深拷贝已解析 Score，只在副本中清空非目标 Staff 的 Note，生成替换
   MIDI 并加载到现有 player。来源 bytes、用于渲染的 Score 和 Track Mixer facts 均不改变。
4. 播放中切换先保存 tick，暂停 player，加载投影 MIDI，恢复 tick 与 Track Mixer，再继续播放；UI
   明确提示发生过安全暂停。投影失败时回退为语义化 `audio-unsupported`，不保留部分生效状态。
5. 单手模式默认播放另一只手作为伴奏；“临时试听练习手”是可键盘操作的 Toggle，不写入 Sidecar。
   谱面仅以低权重 overlay 强调目标 Staff，不改变音符颜色或内容。

结论：Question 1 已解决，Sidecar 升级到 `0.3.0`；Question 2 通过经批准的 runtime MIDI projection
解决；Question 3 采用显式安全暂停、恢复方案。Task 6–8 按上述边界交付。
