# ADR 0038：区分书面位置与播放实例

## 状态

已接受

## 背景

带反复、房子、D.C.、D.S. 或 Coda 的乐谱中，同一个书面小节可能在实际播放时间轴中出现多次。只用小节、拍和 tick 表示位置，无法精确表达播放头、seek、恢复位置和跨反复边界的 AB 循环。

另一方面，批注、section 和谱面选择应附着于用户看到的书面乐谱，而不应因为播放展开而复制。

## 决策

领域模型区分：

- `Written Position`：书面谱中的 track/part、measure、beat 与 tick，用于批注、section 和谱面交互。
- `Playback Occurrence`：Written Position 在展开播放时间轴中的一次具体出现，用于播放头、seek、AB 循环和 Local Playback Resume。

alphaTab 负责解释 repeat 和 jump 并建立展开播放顺序。适配层负责提供 Written Position 与 Playback Occurrence 之间的稳定映射。

Practice Sidecar 中附着于谱面内容的数据默认保存 Written Position。依赖具体播放轮次的数据必须保存 Playback Occurrence，或保存足以稳定重建它的展开路径信息。

## 后果

- 同一书面小节的多次播放可以被准确区分。
- 批注不会因为反复展开而重复存储。
- 现有 Musical Position 和 loop schema 需要版本化扩展。
- repeat/jump 结构改变后，旧的 occurrence 可能失效，需要明确回退规则。
