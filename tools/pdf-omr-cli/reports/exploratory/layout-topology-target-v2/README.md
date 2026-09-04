# Layout topology target v2 audit

本报告在 composer-isolated topology slice 上比较旧 `filled system-band` row target 与 DWD 启发的
`row-center-energy-v1`，不训练模型、不读取 OLiMPiC annotation 作为训练数据，也不读取 frozen holdout。

固定 target geometry 为 768 rows、system sigma 6、staff sigma 2；以 `>= 0.5` 的连续 row components 检查每个
instance 是否仍可分。结果如下：

| Split      | Pages | Center-compatible | System component exact | Staff component exact | Filled active rows | Center system active rows |
| ---------- | ----: | ----------------: | ---------------------: | --------------------: | -----------------: | ------------------------: |
| Train      |   512 |               510 |                    510 |                   510 |            188,066 |                    31,155 |
| Validation |   128 |               128 |                    128 |                   128 |             45,771 |                     7,230 |

两种表示在可表达页面上都保留正确 system component count，但 center target 把 active rows 降至 filled target 的约
16%，并为每个 instance 提供唯一峰，直接对应当前 evaluator 的 ordered-center contract。OLA 风格二维 box objects
仍能表达并排版式，但会引入当前 compact candidate 不需要的通用 object detector；既有 OLA 29-page probe 也没有通过
target-domain admission。因此本阶段选择 `row-center-energy-v1`，不新增 detector framework。

两个 train pages（score `6613436` page index 1、score `6162644` page index 1）包含并排或量化后非严格 row order，
无法由一维 target 无损表达，必须从新 candidate slice 排除并记录；validation 为 128/128 compatible。这个排除只约束
下一候选，不删除原始 dataset artifacts。

- input slice SHA-256: `452d828843d6b432cca80732bb5f668c2b3624b0677c987ccd193072d7bbc774`
- raw canonical audit SHA-256: `db65c7a5426e8812cb2854cb4ed81426a875ddf6ad29c3aad5c69cd51c9c4dae`
- repository-formatted `summary.json` SHA-256: `4699a8b0038d7460c3127e7e524c214d24abe56b8e1afd002385e255af752b39`
- repeated raw runs: byte-identical；`summary.json` 与 raw canonical audit 的 parsed content 相同
- evaluator: `tools/pdf-omr-cli/scripts/audit_layout_topology_targets.py`

本结论只批准下一个 research candidate 的 target representation，不证明训练后能跨 synthetic-to-real domain，也不改变
产品 runtime `STOP`。
