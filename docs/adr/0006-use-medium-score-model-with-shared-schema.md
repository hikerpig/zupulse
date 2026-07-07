# ADR 0006：采用中等厚度 Score Model 与共享 schema

## 状态

已接受

## 背景

Viewer 第一版同时支持 GP 与 MIDI。GP 是结构化乐谱文件，MIDI 是演奏事件流。系统需要统一支撑渲染、播放、练习和 sidecar，但不应在第一版变成完整制谱软件。

薄模型会迫使渲染、播放和练习层频繁读取格式扩展，导致业务逻辑分散。厚模型会把第一版拖入 MusicXML / 制谱级复杂度。

## 决策

采用中等厚度 Score Model。

统一模型覆盖：

- score
- track
- staff
- measure
- beat
- note
- tempo
- time signature
- repeat
- section
- playback mapping

GP 技法、MIDI 原始事件、MIDI 分析状态和 piano-roll 数据保留在 source-specific extension。

Score Model 采用跨端共享 schema。Web Viewer Core 拥有主要实现，Native Shell 只消费必要子集。

## 后果

正面影响：

- 渲染、播放和练习逻辑有稳定共同语言。
- 不会过早进入完整制谱模型复杂度。
- 后续 Windows 壳层和原生音频桥可以消费同一 schema。

负面影响：

- schema 设计需要版本化和迁移。
- source-specific extension 需要治理，避免变成杂物箱。
- Native 与 Web 对同一 schema 的兼容性需要测试。

## 约束

- schema 必须带版本号。
- Web Viewer Core 不能把平台私有字段写进核心模型。
- source-specific extension 只能保存来源特有语义，不能承载通用业务状态。
