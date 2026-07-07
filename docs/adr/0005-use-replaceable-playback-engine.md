# ADR 0005：采用可替换播放引擎

## 状态

已接受

## 背景

第一版需要尽快打通 GP 与 MIDI 的播放、循环、变速、跟随和高亮。Web Audio / SoundFont 可以帮助 MVP 快速闭环。

但 Apple 平台后续可能需要更好的音色、后台播放、低延迟、系统音频集成和外设能力，因此不能让渲染层直接绑定 Web Audio 实现。

## 决策

采用双路径播放策略：

- MVP 使用 Web Audio / SoundFont。
- 架构预留 Native Audio Bridge。
- 通过 `PlaybackTimeline`、`PlaybackEngine`、`SynthAdapter` 隔离播放控制、时间轴和合成器实现。

## 后果

正面影响：

- 第一版可以快速验证播放和练习体验。
- 后续能替换为 AVAudioEngine、AudioKit、TinySoundFont 或其他原生音频后端。
- 渲染跟随逻辑可复用。

负面影响：

- 抽象层需要第一版就设计清楚。
- Web Audio 与原生音频之间可能存在时间精度和行为差异。
- 测试需要覆盖不同音频后端的状态一致性。

## 约束

- 渲染器只能订阅播放状态，不能直接控制合成器实现。
- 所有后端必须遵循统一的 play、pause、seek、tempo、loop、metronome、count-in 语义。
