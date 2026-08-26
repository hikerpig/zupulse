# LEGATO OLiMPiC topology failure audit

> Status: completed development evidence，完成于 2026-08-26。审计只读取既有 immutable benchmark artifacts，
> 不重跑模型、不读取 holdout、不修改 predicted Draft。

## 结论

既有 46-item LEGATO development run 的 20 个 failures 已全部审计：

| Classification          | Count |
| ----------------------- | ----: |
| `contentful-extra-part` |    13 |
| `duplicate-extra-part`  |     2 |
| `empty-part`            |     1 |
| `engine-failure`        |     4 |

15 个 `part-count-mismatch` 的 ground-truth topology 都是 `1 part × 2 staves`。LEGATO 其中 14 项输出
`3 parts × 1 staff`，另一项输出 `4 parts × 1 staff`。13 项的所有 extra parts 都包含不同 musical facts，不能在
adapter 中删除、折叠或按 pitch range 选择。

其余两项虽然存在 byte-equivalent musical-fact duplicate：

- `olimpic-dev-6010916-p1-s1` 的两个 bass-clef parts 相同，但剩余 upper part 使用 percussion clef，不能证明
  删除哪一个 duplicate 后就得到正确 grand staff。
- `olimpic-dev-6409323-p1-s1` 的两个 bass-clef parts 相同，但删除一个后仍剩三个 contentful parts，仍不能映射为
  两个 staves。

因此本轮没有发现任何可唯一、无损应用的 adapter normalization pattern。T05 决策为 `STOP`：保持
`part-count-mismatch` fail closed，不修改 `alignDraftParts`，也不重算伪造的 comparable quality。LEGATO
comparable denominator 仍为 26/46。

## Evidence contract

新的 audit tool 只输出 predicted part 的结构聚合：staff/measure/voice/event counts、clef、pitch range 和移除
event IDs/source anchors 后的 musical-fact hash。Expected Draft 只输出 part/staff counts，不写 ground-truth note
facts。error message、raw exception、absolute run path 和 cache layout 均不进入 canonical report。

两次独立 audit 输出相同 SHA-256：
`8afa8c5ffef3b35f7ec046a8b0df44195d296af50130edb81cf9806a4238ab5c`。完整 item-level report 保留在
local cache，仓库只保留本 README 与 [`summary.json`](summary.json)。

## Next action

该 failure 属于 LEGATO model/processor output topology，不属于 engine-neutral identity 问题。后续若继续 LEGATO
路线，应在新 development experiment 中约束或训练模型稳定输出两个钢琴 staves；不得用 ground truth、part order
或 pitch range 在 adapter 中选择要丢弃的 part。
