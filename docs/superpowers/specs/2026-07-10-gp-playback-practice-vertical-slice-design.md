# GP 播放练习竖切设计

## 目标

在现有 Browser Demo 和 alphaTab GP 渲染能力上，增加一条可实际练习的播放竖切：离线 SoundFont 播放、播放进度、变速、多个命名 AB 循环、轨道显示与混音，以及通过 Bridge/mock storage 验证的 sidecar 持久化。

这条竖切先稳定 Web Core 的领域边界和交互语义。后续桌面宿主已改为 Electron，详见 `2026-07-10-electron-desktop-gp-slice-design.md`；SQLite、MIDI 和同步继续作为独立阶段。

## 范围

本次包含：

- 播放、暂停、停止和拖动定位。
- 当前时间、总时长和播放进度。
- `25%–200%` 变速，按 `5%` 吸附，音高保持不变。
- 多个命名 AB 循环区间。
- 全谱默认速度和循环区间速度覆盖。
- 关闭、按拍、按小节三档循环边界吸附，默认按拍。
- 主显示轨道、附加显示轨道、静音、独奏和单轨音量。
- 全谱速度、循环区间、显示轨道、静音和音量的 sidecar schema。
- 上次播放位置的本机状态合约和 mock storage 验证。
- 从锁定版本 alphaTab 依赖复制 `sonivox.sf3` 和许可证到构建产物。
- Browser Demo 的完整操作入口和错误状态。

本次不包含：

- 节拍器、倒计时、逐段自动训练或练习统计。
- MIDI 播放和分析。
- 真实 SQLite、CloudKit 或跨设备同步实现。
- macOS/iOS App Shell、WKWebView 和平台音频会话。
- 用户导入自定义 SoundFont。
- 原生音频引擎或完整的跨引擎事件协议。

## 架构决策

采用 Web Core 领域控制器加 alphaTab 适配器的结构：

```text
Browser Demo UI
    |
    v
PlaybackController <--> PracticePlaybackSidecar / LocalPlaybackResume
                                  |
                                  v
                         Bridge / mock storage
    |
    v
PlaybackEngine
    |
    v
AlphaTabPlaybackAdapter
    |
    v
alphaTab
```

`PlaybackController` 是播放练习状态的单一入口。UI 只发送领域命令并渲染 presenter 输出，不直接编排 alphaTab API。`AlphaTabPlaybackAdapter` 隔离第三方类型、属性和事件，使后续 Apple Shell 可以复用领域状态而不继承 Browser Demo 的实现细节。

第一版只有 alphaTab 播放后端。`PlaybackEngine` 只抽象当前竖切实际使用的能力，不提前定义 Web Audio、AVAudioEngine 或 Windows 后端的完整公共协议。

## 领域模型

### PlaybackState

`PlaybackState` 是 Controller 对外发布的不可变快照，至少包含：

- `sessionId`：区分当前文件会话，隔离旧播放器的迟到事件。
- `transport`：`idle | loading | ready | playing | paused | stopped | error`。
- `position`：当前毫秒位置和可用时的音乐位置。
- `durationMs`：总时长。
- `scoreSpeed`：全谱默认播放速度。
- `looping`：循环是否启用。
- `activeLoopId`：当前循环区间。
- `loops`：命名循环区间集合。
- `tracks`：轨道显示和播放设置。
- `soundFont`：`idle | loading | ready | error`。
- `persistence`：`clean | saving | unsaved | error`。

### MusicalPosition

循环边界的权威定位采用音乐位置，并保留毫秒缓存：

```ts
type MusicalPosition = {
  measureId: string;
  measureIndex: number;
  beatIndex: number;
  tick: number;
  cachedTimeMs: number;
};
```

`measureId + tick` 用于稳定附着到谱面，`measureIndex + beatIndex` 用于显示和降级，`cachedTimeMs` 用于快速定位。若缓存与当前时间轴不一致，以音乐位置重新计算为准。

### LoopRegion

```ts
type LoopRegion = {
  id: string;
  label: string;
  labelSource: "generated" | "user";
  start: MusicalPosition;
  end: MusicalPosition;
  snapMode: "off" | "beat" | "measure";
  speedOverride?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};
```

规则：

- `start` 必须早于 `end`。
- 速度范围为 `0.25–2.0`，以 `0.05` 为步长归一化。
- 默认名称使用“小节 12–16”格式。
- `labelSource` 为 `generated` 时，边界变化会更新默认名称；用户重命名后不再自动更新。
- 删除写入带 `deletedAt` 的 tombstone，供后续对象级同步使用。
- 多个循环区间可以重叠，不限制数量。

### TrackPlaybackState

显示选择和音频混音彼此独立：

```ts
type TrackPlaybackState = {
  primaryVisibleTrackId: string;
  additionalVisibleTrackIds: string[];
  visibilityUpdatedAt: string;
  settings: Record<string, {
    muted: boolean;
    solo: boolean;
    volume: number;
    muteUpdatedAt: string;
    volumeUpdatedAt: string;
  }>;
};
```

轨道使用 Score Model 中的稳定 ID。`volume` 范围为 `0–1`。主显示轨道必须存在，附加显示轨道不能重复包含主轨道。sidecar 保存显示选择、静音和音量，不保存独奏。

## Controller 命令

UI 通过以下命令改变状态：

- `togglePlayback`
- `stop`
- `seekTo`
- `setScoreSpeed`
- `setLoopBoundary`
- `saveLoopRegion`
- `selectLoopRegion`
- `renameLoopRegion`
- `deleteLoopRegion`
- `setLoopSpeedOverride`
- `setLoopSnapMode`
- `setLoopEnabled`
- `setPrimaryVisibleTrack`
- `setAdditionalVisibleTracks`
- `setTrackMute`
- `setTrackSolo`
- `setTrackVolume`

Controller 负责参数校验、吸附、有效速度计算、引擎调用、状态发布和持久化调度。Presenter 只把状态转换成 UI 文案和控件属性。

## 核心行为

### 文件打开

1. 创建新的 `sessionId`，Controller 进入 `loading`。
2. alphaTab 加载谱面并提取轨道、时长和时间轴映射。
3. Controller 通过 Bridge 读取当前 `ScoreIdentity` 的 sidecar 和仅保存在本机的上次播放位置。
4. 恢复全谱速度、循环、显示轨道、静音、音量和上次播放位置；缺失轨道设置被忽略并记录诊断信息。
5. 加载内置 SoundFont。
6. SoundFont 就绪后进入 `ready`。恢复位置不会触发自动播放。谱面渲染不依赖 SoundFont，因此音频失败时仍可阅读。

浏览器和 WKWebView 的音频初始化必须由用户手势触发。文件加载后不自动播放，也不主动制造声音。

### 播放与定位

- `togglePlayback` 在 `ready`、`paused`、`stopped` 和 `playing` 之间切换。
- `stop` 停止并回到当前有效播放范围的起点；启用循环时回到 A 点，否则回到谱面开头。
- 普通定位不改变吸附模式，也不自动创建循环边界。
- 引擎位置事件更新当前毫秒和音乐位置，并驱动 alphaTab 高亮与 UI 进度。

### 循环区间

- A/B 可在当前播放位置打点，也可拖动进度条边界。
- 设置边界时应用当前吸附模式；普通 seek 不吸附。
- 选择已保存区间会启用循环并定位到 A 点，但不会从静止状态自动播放。
- 播放中切换区间时，从新 A 点继续播放。
- 激活区间存在 `speedOverride` 时使用覆盖速度，否则使用全谱速度。
- 关闭循环后恢复全谱速度。

### 轨道

- 主显示轨道和附加显示轨道决定 alphaTab 渲染哪些轨道。
- 静音、独奏和音量只改变播放，不隐式改变显示轨道。
- 独奏是会话态；切换文件或重新打开时清空。
- 若 sidecar 引用当前谱面不存在的轨道，忽略该条覆盖，不能按数组下标套用。

## Sidecar 与合并

`PracticePlaybackSidecar` 是现有 sidecar payload 的版本化子结构，保存：

- 全谱默认速度及更新时间。
- 命名循环区间及 tombstone。
- 主显示轨道和附加显示轨道。
- 每条轨道的静音、音量及字段更新时间。

`LocalPlaybackResume` 通过 Bridge 单独保存当前 `ScoreIdentity` 的上次播放位置和更新时间。它属于本机 SQLite/index metadata，不进入 sidecar，也不参与跨设备同步。本次由 mock storage 验证读写合约。

不保存：

- 当前 transport 状态。
- 轨道独奏。
- SoundFont 加载状态。

连续拖动速度、音量和循环边界时，Controller 立即更新内存状态，但使用去抖写入。命名、删除、静音等离散操作可立即排队。写入串行化，后一次快照覆盖同一会话中尚未开始的旧写入。

上次播放位置最多每五秒写入一次，并在暂停、停止、切换文件和销毁前刷新。显式停止会回到当前有效播放范围的起点，并把该位置作为新的本机恢复点。

后续真实同步按对象和字段合并：循环区间按 `id` 与 `updatedAt` 合并，删除由 tombstone 传播；全谱速度和轨道设置分别按字段更新时间合并。本次只在 codec 与 mock storage 测试中验证数据结构，不实现 CloudKit。

## SoundFont 资源

使用锁定版本 `@coderline/alphatab` 包内的 `dist/soundfont/sonivox.sf3`。Rspack 构建从依赖复制 SoundFont 和对应许可证到静态资源目录，不在仓库重复提交二进制。

构建必须在资源缺失时失败，并验证发布产物同时包含：

- `sonivox.sf3`
- SoundFont 许可证
- alphaTab 字体资源

运行时通过单一资源配置提供 URL，方便 Apple App Bundle 后续映射到离线资源。

## Browser Demo 界面

Browser Demo 使用工作台布局：

- 顶部固定播放工具栏：播放/暂停、停止、当前时间、总时长、进度、速度、循环开关和 A/B 打点。
- 中央 alphaTab 谱面：保留播放位置高亮。
- 轨道面板：主显示轨道单选、附加显示轨道多选、静音、独奏和音量。
- 循环面板：名称、小节范围、速度覆盖、选择、重命名和删除。

小屏幕下，轨道和循环面板折叠为两个抽屉，谱面保持主要空间。播放按钮在 SoundFont 就绪前不可用并显示加载状态。错误显示在对应控件附近，不使用阻塞弹窗。

## 错误处理与生命周期

- `score-load-failed`：显示可操作错误并保留文件选择入口。
- `soundfont-load-failed`：谱面继续可读，播放禁用，允许重试资源加载。
- `audio-start-blocked`：等待下一次明确用户点击后重试音频初始化。
- `sidecar-save-failed`：内存状态继续有效，标记未保存并允许重试。
- `local-resume-save-failed`：不影响播放和 sidecar，同一会话内保留待重试的最新位置。

切换文件或销毁页面时，Controller 必须停止播放、刷新必要的待写入 sidecar、取消资源加载和事件订阅，再销毁 alphaTab API。所有引擎事件携带其创建时的 `sessionId`；Controller 忽略与当前会话不一致的事件。

## 测试与验收

自动化测试包括：

- Controller 状态机：播放、暂停、停止、定位、文件切换和迟到事件隔离。
- 循环领域逻辑：边界顺序、三档吸附、默认名称、用户名称、速度覆盖、重叠区间和 tombstone。
- 轨道领域逻辑：显示与播放设置独立、稳定 ID、无效轨道降级和独奏不持久化。
- sidecar codec：版本校验、往返序列化、旧字段缺失、对象级合并和无效数据拒绝。
- 本机恢复位置：节流写入、暂停/销毁刷新、重新打开恢复和不进入同步 sidecar。
- alphaTab adapter：命令映射、事件映射、解绑、SoundFont 成功与失败。
- jsdom UI：控件禁用状态、进度更新、循环列表、轨道面板和错误展示。
- Rspack 构建：SoundFont、许可证和 alphaTab 字体存在。

人工验收素材至少覆盖：

- GP3、GP4、GP5、GPX 和 GP。
- 单轨与多轨谱。
- 中文文件名、标题和轨道名。
- 可验证变速、循环和轨道混音的谱。
- 损坏或不完整的 GP 文件。

完成标准：用户可以在 Browser Demo 打开上述真实 GP 文件，离线播放，调整进度与速度，创建和切换多个命名循环，独立控制显示轨道和混音，并通过 mock Bridge 验证关闭再恢复后的练习设置和本机播放位置。

## 后续计划边界

本设计完成后的桌面宿主采用 Electron，具体边界见 `2026-07-10-electron-desktop-gp-slice-design.md`。真实 SQLite、本地曲库、MIDI Analyzer、公开发布和跨平台同步继续拆分为独立竖切；移动端形态另行设计。
