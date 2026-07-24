# Harmony Semi-CRF Task 27 oracle checkpoint

## 冻结合同

- Dataset：Mozart v2.3，v3 完整作品级 train/tune split。
- Boundary policy：`dense-note-events`。
- Search contract：`maxSpan=16`、rule-only Top-8。
- Gold 只进入 CLI oracle；没有进入 analyzer、lattice 或 candidate generator。
- 继续条件：
  - boundary representability `>= 0.99`
  - span representability `>= 0.99`
  - segment Top-8 oracle 不低于同批现有 Top-8 `-0.005`

## 报告与规模

| split | pieces | mapped | boundary |   span | candidate oracle | path ratio |  ranges | Top-8 slots |
| ----- | -----: | -----: | -------: | -----: | ---------------: | ---------: | ------: | ----------: |
| train |     30 |  7,691 |   1.0000 | 0.9853 |           0.8106 |     0.7987 | 603,024 |   4,824,192 |
| tune  |      9 |  1,886 |   1.0000 | 0.9836 |           0.8302 |     0.8165 | 147,944 |   1,183,552 |

同批 dense tune 的现有 Top-8 oracle 为 `0.7975`，因此 structured candidate oracle 的门禁通过。Boundary 也全部存在。失败项是 boundary-count span：train 有 113 个 mapped segments 超过 16 个 legal boundary，最大观察 span 为 84；tune 有 31 个，最大 span 为 24。所有 piece 都至少存在一个 span 或 candidate miss，因此 complete path pieces 为 0。

报告 SHA-256：

- train：`b7b21b33426178f4087cc6714c80b8442ba879eaf332283d9daeaff8ce15bfa5`
- tune：`d1b2ab8e7208941699d6cf0bd6e33c384b8ec48f05e2e17aa80b899f7c9567d7`

`search.candidates` 明确是 `ranges × topK` 的槽位上界，不是实际生成对象数量。按当前未压缩内存估算，train 约 `1.25GB`、tune 约 `0.31GB`，也说明 Task 30 不能直接物化所有 range/candidate 对象。

## 性能问题与修复

Oracle 初版为每个 range 生成并缓存 candidates，Mozart train 连续被内存压力终止。第一次修复只停止缓存仍不足，因为它仍为 60 万个非-gold ranges 创建约 480 万组短命对象。最终实现只对 gold ranges 真实生成 candidates 来测 recall，其余 range 使用明确的 Top-K slot 上界计数。该优化不改变 boundary/span/candidate/path oracle 语义，train 从无法产出报告降到约 4 秒。

## 决定

Checkpoint E **不通过**，停止进入 Task 28：

1. `maxSpan=16` 的 train/tune span representability 均低于预登记的 `0.99`。
2. 当前 `maxSpan` 用“dense event 个数”限制和声持续时间，装饰密集的同等音乐时值会受到更严格限制，合同本身不稳定。
3. 直接把 maxSpan 提高到 train 最大值 84 会显著放大 exact Viterbi 和 records 状态空间；不能在已经查看 tune 后靠调大常数发布。

下一轮应先只用 train 分布设计按音乐时值/小节跨度约束的 search contract，并预登记状态预算，再用新的未污染 tune 或既有 tune 仅作 regression。不能在当前合同上继续训练 structured scorer。
