# ADR 0009：使用领域播放控制器与 alphaTab 适配器

## 状态

已接受

## 背景

Browser Demo 已能加载并渲染 GP 文件。下一步需要增加播放、变速、命名 AB 循环、轨道显示与混音，并把练习设置写入 sidecar。

如果 UI 直接编排 alphaTab API，播放器状态、练习规则和第三方类型会进入页面组件。后续接入 macOS/iOS WKWebView、原生音频桥或其他渲染后端时，这些规则难以复用和测试。

当前也没有足够证据定义覆盖 Web Audio、AVAudioEngine 和 Windows 的完整通用播放协议。

## 决策

Web Core 使用 `PlaybackController` 维护播放练习领域状态，并通过最小 `PlaybackEngine` 接口调用 `AlphaTabPlaybackAdapter`。

- UI 只发送领域命令并消费 presenter 状态。
- `PlaybackController` 负责 transport、定位、速度、循环、轨道设置和持久化调度。
- `AlphaTabPlaybackAdapter` 负责 alphaTab 命令、属性和事件映射。
- sidecar codec 不依赖 alphaTab 类型。
- 第一版只实现 alphaTab 播放后端，不提前实现完整原生音频协议。

## 后果

正面影响：

- 播放与练习规则可以脱离 DOM 和 alphaTab 做单元测试。
- Browser Demo 与未来 Apple Shell 共享领域语义。
- 第三方 API 变化集中在 adapter。
- sidecar 数据不携带 alphaTab 私有对象。

负面影响：

- 需要维护 Controller 与 adapter 的事件一致性。
- alphaTab 已提供的部分状态会在领域层拥有对应表示。
- 文件切换和销毁必须严格处理订阅与迟到事件。

## 约束

- `PlaybackEngine` 只包含当前竖切实际使用的能力。
- 引擎事件必须关联 `sessionId`。
- UI 不直接调用 alphaTab 播放和轨道混音 API。
- 原生音频桥在出现真实平台需求后单独设计。
