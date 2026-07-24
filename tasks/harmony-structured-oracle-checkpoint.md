# Harmony Semi-CRF Task 27 oracle checkpoint

## 冻结合同

- Dataset：Mozart v2.3，v3 完整作品级 train/tune split。
- Boundary policy：`dense-note-events`。
- Search contract：dense boundaries、`maxQuarterNotes=8`、rule-only Top-8。`8 QN` 由 train `P99.5=6.5 QN` 向上取到完整 4/4 小节倍数得到；查看新 tune 结果前已冻结。
- Gold 只进入 CLI oracle；没有进入 analyzer、lattice 或 candidate generator。
- 继续条件：
  - boundary representability `>= 0.99`
  - span representability `>= 0.99`
  - segment Top-8 oracle 不低于同批现有 Top-8 `-0.005`

## 报告与规模

| split | pieces | mapped | boundary |   span | candidate oracle | path ratio |    ranges | Top-8 slots |
| ----- | -----: | -----: | -------: | -----: | ---------------: | ---------: | --------: | ----------: |
| train |     30 |  7,691 |   1.0000 | 0.9984 |           0.8104 |     0.8091 | 1,014,502 |   8,116,016 |
| tune  |      9 |  1,886 |   1.0000 | 0.9931 |           0.8329 |     0.8271 |   256,103 |   2,048,824 |

同批 dense tune 的现有 Top-8 oracle 为 `0.7975`，因此 structured candidate oracle 的门禁通过。Boundary 也全部存在。旧 boundary-count 合同失败的根因是事件密度而非音乐时值；新合同下 train/tune 的 span 门禁均超过 `0.99`。所有 piece 仍至少存在一个 candidate miss，因此 complete path pieces 为 0；这不阻止学习，但说明 candidate generation 仍是可见的准确率上限。

报告 SHA-256：

- train：`c91f6799591fb1bbaae3bd1ceca1eb35fbf0002abe7041930daf4dce5228e8d3`
- tune：`3257406bd01ad4e80a6f6adfd6f66df9eb045449a0b5b442dc0c08e59812b103`

`search.candidates` 明确是 `ranges × topK` 的槽位上界，不是实际生成对象数量。按当前未压缩内存估算，train 约 `2.11 GB`、tune 约 `0.53 GB`，也说明 Task 28/30 必须惰性生成、紧凑索引，不能直接物化所有 range/candidate 对象。

## 性能问题与修复

Oracle 初版为每个 range 生成并缓存 candidates，Mozart train 连续被内存压力终止。第一次修复只停止缓存仍不足，因为它仍为 60 万个非-gold ranges 创建约 480 万组短命对象。最终实现只对 gold ranges 真实生成 candidates 来测 recall，其余 range 使用明确的 Top-K slot 上界计数。该优化不改变 boundary/span/candidate/path oracle 语义，train 从无法产出报告降到约 4 秒。

## 决定

Checkpoint E **通过**，可以进入 Task 28：

1. `maxQuarterNotes=8` 的 train/tune boundary 与 span representability 均超过 `0.99`。
2. Candidate oracle 高于预登记下限，且换 span 合同没有损害 candidate recall。
3. 搜索空间增长明确，Task 28 必须以惰性 cache 和 `1.5x` runtime/峰值内存门禁控制成本。

`maxQuarterNotes=8` 是本阶段冻结合同；后续不能根据 tune/final 结果调整。Production 默认、algorithmVersion 与现有 beam 输出仍未改变。
