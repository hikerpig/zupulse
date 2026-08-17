# OLiMPiC real scanned cross-engine candidate evaluation

> Status: development evidence，完成于 2026-08-17。只覆盖 OLiMPiC scanned system corpus 的唯一 development
> item，不读取 holdout，不改变 App gate。

LEGATO 与 Rokot 均完成 `openscore-6586696-p1-s1` recognition。LEGATO 将钢琴谱表示为两个单谱表 part，Rokot
表示为一个双谱表 part；默认 strict comparison 因 part identity 不可用而 fail closed。显式启用
`ordered-staves` 后，comparison 仅按已声明的 part/staff 顺序构造临时 view，定位出 measure index `2` 的唯一
content disagreement，并生成一个不可自动应用的 Rokot-to-LEGATO `replace` candidate。

模拟候选后 Joint F1 从 `0.7500` 提升到 `0.7660`，但 Pitch F1 从 `1.0` 降到 `0.9892`，Onset/Duration F1
从 `1.0` 降到 `0.9787`，valid measure rate 保持 `0.5`。因此 assessment 为 `mixed`，且
`nonRegressive: false`。这个结果证明只看 Joint 增益会误判候选，不能自动 promotion 或写回。

结构化指标见 [`summary.json`](summary.json)。完整 runs、ABC、MXL、模型与 cache 不进入 Git。
