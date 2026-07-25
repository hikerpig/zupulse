# Harmony structured feature contract

版本：`semi-crf-linear-v1`

## Segment features（73）

Flatten 仅发生在 scorer 边界，固定顺序如下：

1. duration chroma（12）
2. attack chroma（12）
3. held chroma（12）
4. upper-staff attack chroma（12）
5. lower-staff attack chroma（12）
6. scalars（13）：
   - normalized duration
   - start/end metric strength
   - non-chord duration ratio
   - bass/root match、bass/chord-tone、bass change
   - staff/voice synchronization
   - key-known、key compatibility
   - spelling-known、spelling compatibility

Chroma 各自归一化，不在 cache 内合并。跨小节音符用 measure duration 建立 absolute tick，pickup 不按标准小节长度补齐。Key 只读取 score 自带 measure key；缺失时以 `keyKnown=0` 明确表示，不猜局部调、不读取 gold。

## Transition features（29）

固定顺序：

1. root motion one-hot（12）
2. effective bass motion one-hot（12；slash bass 优先于 root）
3. same chord
4. common-tone ratio
5. from/to complexity
6. normalized duration change

## 数值与缺失值

- 所有输出数值在 runtime schema 中强制有限且最多两位小数。
- 比例缺少分母时为 `0`。
- Key 与 spelling 各有独立 `known` flag，不能把未知误解为不兼容。
- 不包含 gold、人工局部 key、pedal/controller 或数据集身份。
- Segment/transition feature length、字段顺序和 version 不匹配时 fail closed。
