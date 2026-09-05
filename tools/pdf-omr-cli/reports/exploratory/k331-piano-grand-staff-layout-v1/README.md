# K331 piano grand-staff layout measurement v1

Status: completed / `USE_NON_FRAGMENTED_GRAND_STAFF_FOR_PIANO`。只读取 K331 derived-controlled 六页，未训练，
未读取 holdout，未改 runtime default。

## Truth

人工复核渲染页：system 数为 `6/6/1/6/6/2`，全部是钢琴大谱表 `staffCount=2`。纵带来自非 fragmented
`grand-staff` detector（复现历史 27 systems）。mapping SHA-256
`0f9b66aa464d4985087b5dc6c56e530a2f95e20f5c99c09c02c72e935ec1f0e8`。

## Classic detector

当前 runtime（`allowFragmentedRuns=true`）在 K331 上不是「只有第 1 页 pairing 失败」：

| Variant                                | Admitted pages | Notes                                |
| -------------------------------------- | -------------: | ------------------------------------ |
| runtime fragmented + auto              |          2 / 6 | p3、p6；其余 `staff-system-topology` |
| runtime fragmented + grand-staff       |          1 / 6 | 仅 p6；其余 `grand-staff-pairing`    |
| **non-fragmented + grand-staff**       |      **6 / 6** | `6/6/1/6/6/2`，全部 staffCount=2     |
| pair-adjacent fragmented + grand-staff |          3 / 6 | 不能修 p1/p2                         |

## UNet（不重训，只把固定 staffCount 改成 2）

3 / 6 topology-exact，双跑 report SHA-256
`2f239be433f2f75c1049f22a57e3528da2159e6854611a71e5637f244ae7af6f`。失败全是 count-mismatch
（p1 检出 4、p5 检出 5、p6 检出 1），不是单独的 pairing。

## Decision

不要为 K331 再训练 layout 模型。现成 `rokot-staff-system-v2` 在 **non-fragmented grand-staff** 模式下已经
切出全部 27 个 2-staff system。当前 runtime 的 `allowFragmentedRuns=true` 才是钢琴 full-page 的失败源。

未在本轮重跑 Rokot/LEGATO：这 27 个 system 的识别质量已有
`k331-page-scope-ablation-v1`（verified-systems Joint F1 `0.1567`，header-context `0.3768`）。layout 一旦用
non-fragmented 模式交出同一分母，下一投资是识别，不是网络。

产品 runtime 保持 `STOP`，本轮不改 default。结构化结果见 [`summary.json`](summary.json)。
