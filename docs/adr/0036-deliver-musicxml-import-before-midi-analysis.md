# ADR 0036：先交付 MusicXML 导入，再建设 MIDI 分析

## 状态

已接受

## 背景

ADR 0002 确立了 GP 与 MIDI 都属于产品目标，但没有规定二者之后的详细交付顺序。Desktop GP Slice 已经建立基于 alphaTab 的查看与播放链路；下一阶段需要选择 MusicXML 导入或 MIDI 导入与分析。

MusicXML 是结构化数字乐谱，能够复用现有 alphaTab importer、Viewer 和播放链路。MIDI 是带时间戳的演奏事件，除文件解析外还需要量化、拍号处理、左右手分配、异常检测和基础钢琴谱生成。直接从 MIDI 开始，会把格式接入、领域模型验证和不确定性分析同时引入一个竖切。

## 决策

在 Desktop GP Slice 之后，先交付 MusicXML 导入竖切，再建设 MIDI 导入与分析。

交付顺序为：

1. MusicXML 文件识别、读取、解析、显示、播放和错误处理。
2. 使用 MusicXML 补强统一 Score Model，并验证多声部、连音、拍号变化和 repeat 等结构。
3. MIDI 原始事件导入、可靠 piano-roll 和播放。
4. MIDI 量化、左右手分配、异常检测和基础钢琴谱。

ADR 0035 定义的 MIDI 三层模型继续有效，并作为后续 MIDI 阶段的约束。

## 后果

正面影响：

- 更早交付第二种结构化乐谱格式的端到端体验。
- 复用现有 alphaTab 导入、渲染和播放能力，降低首个新格式竖切的变量数量。
- 先用确定性乐谱输入检验 Score Model，再承接 MIDI 的推断结果。
- MusicXML 文件可以成为后续 MIDI Analyzer 输出质量的对照样本。

负面影响：

- MIDI 差异化能力延后。
- MusicXML 与 alphaTab 的兼容边界仍需通过真实文件验收。
- 原 ADR 0002 中的“第一版”不再表示紧邻 GP Slice 的单一交付批次。

## 与既有决策的关系

- 细化 ADR 0002 的实施顺序，不取消 MIDI 产品目标。
- 延续 ADR 0006 的中等厚度共享 Score Model。
- 延续 ADR 0035 的不可变 Raw MIDI、Analysis Revision 与 User Corrections 模型。

