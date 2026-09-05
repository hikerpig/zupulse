# Layout scan-domain candidate B v1

Status: completed / `STOP_SCAN_DOMAIN_V1`。本轮在冻结的 29 页 OLiMPiC development 上评测一个
scan-degraded compact UNet；未读取 holdout，未搜索 threshold，未修改产品 runtime。

## Protocol

- architecture：`compact-layout-unet-v1`（30,090 parameters）
- slice SHA-256：`dc64fe27d26a109ee20736d6e8fe028da44f7e399f0fcc9fd7ef339df26172e3`
- gapped system-band：`minimumInterSystemGapPx = 8`；train 排除 2 个并排/重叠页
- 本机 dataset 缺 8 个 train PNG 与 5 个 validation PNG，训练实际使用 502 / 123 页
- train-only scan degradation：show-through 8–12%、blur ≤ 1.8、noise σ ≤ 12、2× down/up；seed `20260905`
- validation 保持 clean；后处理仍为 `gaussianSigma=6`、`minimumCenterDistance=100`、`minimumCenterScore=0.5`
- `staffCount=3` 作为本 corpus 假设
- 3 epochs，MPS 训练，CPU 评测双跑

Experiment A 因 gapped target 在 Lieder 上是 no-op 而跳过，见
`reports/exploratory/gapped-system-band-target-v1/`。

## Result

合成 validation：system-band Dice `0.9120`，staff-line Dice `0.4423`（UNet 基线分别为 `0.9297` /
`0.4577`）。

| Metric                | compact-layout-unet-v1 | Scan-domain B |
| --------------------- | ---------------------: | ------------: |
| Topology-exact pages  |                22 / 29 |   **14 / 29** |
| Works with exact page |                  6 / 6 |     **5 / 6** |

`5862368` 从 UNet 的 4/7 掉到 **0/7**。两次 CPU evaluation 的 report SHA-256 均为
`04da08773d3334ecf3dcb41580351725ba15c982c4d1bbaf437b5423b067865c`。checkpoint SHA-256
`f7996a2b7796c552346fc1fc13ca4b57e95dfb6ce53491a9b3e85b9428384341`。

与 UNet 的页集合：both 11、UNet-only 11、B-only 3、neither 4。B 只额外恢复了 `4945954` p0、
`6007571` p2、`6011095` p2，同时把 `5862368` 的已通过页全部打掉。

## Decision

`STOP_SCAN_DOMAIN_V1`

预注册的 Lieder scan degradation 没有修好真实扫描上的相邻 system 粘连，还引入 work-level 回归。按计划
不搜索后处理、不把 7 个失败页加入训练、不换 DETR/OLA。`compact-layout-unet-v1` 仍是 29 页上最好的
research candidate。产品 runtime 保持 `STOP`。

逐页对照见 [`summary.json`](summary.json)。
