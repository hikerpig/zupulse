# ADR 0037：以 alphaTab Score 作为 MusicXML 查看与播放运行时模型

## 状态

已接受

## 背景

MusicXML 能表达大量制谱、布局和播放语义。Viewer 已经使用 alphaTab 进行乐谱渲染与播放。如果导入 MusicXML 后先完整转换为自有 Score Model，再转换给 alphaTab，将产生重复模型、有损映射和双向一致性成本。

ADR 0006 要求跨格式的中等厚度 Score Model，但它不要求复制底层渲染引擎支持的全部制谱语义。

## 决策

MusicXML 导入后，alphaTab `Score` 是当前 Viewer Session 中渲染与播放的权威运行时乐谱对象。

自有 `ScoreDocument` 从 alphaTab `Score` 投影跨格式业务所需的稳定子集，包括：

- Score Identity 与来源摘要。
- 曲目与轨道摘要。
- 统一播放时间轴。
- Viewer、练习和 sidecar 使用的稳定音乐位置映射。
- 跨端桥接真正需要的数据。

首版不把 MusicXML 或 alphaTab 的完整制谱语义复制进 `ScoreDocument`。来源特有且确有业务用途的信息可以保留在受治理的 extension 中，但 extension 不得成为 alphaTab 对象图的无类型镜像。

## 后果

正面影响：

- MusicXML 可以直接复用 alphaTab importer、renderer 和 playback。
- 避免为了首版建立第二套完整制谱模型。
- 跨格式领域逻辑仍然依赖稳定的共享投影，而不是散落读取 alphaTab 内部对象。

负面影响：

- 当前 MusicXML 渲染与播放能力受 alphaTab importer 和数据模型边界约束。
- 未来替换渲染器时，需要扩充自有模型或增加新的适配器。
- alphaTab 版本升级必须验证投影适配器和音乐位置映射。

## 约束

- UI 领域逻辑不能任意穿透适配层读取 alphaTab 对象。
- sidecar 不得持久化 alphaTab 对象引用或不稳定的内存标识。
- 投影出的稳定标识必须能够在同一文件重新打开后重建。
- alphaTab `Score` 只属于当前 Viewer Session，不写入持久化存储。

## 与既有决策的关系

本 ADR 细化 ADR 0006 对 MusicXML 的模型厚度和所有权解释，不取消共享 Score Model。

