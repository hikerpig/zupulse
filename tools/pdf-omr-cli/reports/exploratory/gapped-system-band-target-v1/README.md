# Gapped system-band target v1

Status: completed / `GAP_TARGET_NOOP_ON_LIEDER`。本轮不训练、不读取 OLiMPiC holdout，只在冻结的
512/128 Lieder slice 上检查 `minimumInterSystemGapPx = 8` 的 target 是否可表达。

## Protocol

在 `compact-layout-unet-v1` 的 model 分辨率 `(512, 768)` 上，把 filled system rectangles 改成：相邻
system 至少隔 8 行背景；间距不足时两边向中心收缩；高度非正或中心落到 band 外则 fail closed，不 merge。
横向 bbox 不变。slice SHA-256 `dc64fe27d26a109ee20736d6e8fe028da44f7e399f0fcc9fd7ef339df26172e3`。

## Result

两次独立 audit 的 canonical report SHA-256 均为
`a080270377a2d64e8b5d26f296bc4b2b2ddce92647768c754ba513da8855d507`。

| Split      | Pages |  OK | Unchanged | Actually gapped | Excluded |
| ---------- | ----: | --: | --------: | --------------: | -------: |
| train      |   512 | 510 |       510 |           **0** |        2 |
| validation |   128 | 128 |       128 |           **0** |        0 |

保留页里，train 多 system 页的最小背景间距是 21 行，validation 是 28 行，都已经大于 8。因此 8px gap
**不会改变** 这些排版页的 supervision。

排除的 2 个 train 页是并排/重叠 system，不是 silently merge：

- `6613436` pageIndex 1：18 个 system，含与宽 3-staff 重叠的短 1-staff 片段
- `6162644` pageIndex 1：一个 3-staff 与两个并排 1-staff

这与 topology-v2 排除过的非严格 row-order 页同类。

## Decision

`GAP_TARGET_NOOP_ON_LIEDER`

prototype 通过 fail-closed 合同，但 Experiment A（只改 target、仍用当前 Lieder 增强）不会产生新的训练信号。
不把这 3 epoch 当成一次有信息量的 OLiMPiC 尝试。gapped mask 仍作为后续训练的不变量（排除这 2 页，禁止
merge）。下一刀是预注册的 scan-domain degradation。

结构化摘要见 [`summary.json`](summary.json)。
