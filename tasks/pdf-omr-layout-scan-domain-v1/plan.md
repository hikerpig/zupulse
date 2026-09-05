# Task: 用 scan-domain 适配把 compact UNet 做到超过 22/29

## Goal

在不换 detector 家族、不训练 29 页评测集、不把 1-staff 当总闸的前提下，训练一个 gapped system-band
compact layout candidate，使冻结 OLiMPiC development 的 topology-exact 超过 22/29，并保持 6/6 works 仍有
至少一页 exact。

## Non-goals

- 不修改 App、Bridge、Desktop runtime 或 detector default。
- 不新增 `onnxruntime-node`。
- 不继续 DETR / Deformable DETR / OLA-style / 自定义 object head。
- 不搜索 page-specific 后处理，不读取 holdout，不用 6 个 evaluation works 训练。
- 不在本轮做 1/2/3-staff 泛化、2-staff 钢琴 layout 或 recognition 优化。

## Canonical context

- `docs/specs/2026-09-04-pdf-omr-layout-scan-domain.md`
- `docs/specs/2026-08-26-pdf-omr-learned-layout-detector-proposal.md`
- `tools/pdf-omr-cli/scripts/train_layout_segmenter.py`
- `tools/pdf-omr-cli/scripts/evaluate_layout_segmenter.py`
- `tools/pdf-omr-cli/scripts/build_openscore_layout_dataset.py`
- `tools/pdf-omr-cli/reports/development/olimpic-layout-multihead-v1/`
- `tools/pdf-omr-cli/reports/exploratory/detr-v1-olimpic-topology-v1/`

## Why this plan

topology-v2 已经结案：通用 1/2/3 detector 不是当前缺口。DETR v1 在同一 29 页上是 16/29，UNet 仍是真实域
最好的模型。UNet 的 7 个失败页是 filled-band 在扫描域粘连，不是缺少 pretrained assignment。下一刀应切在
**target 分界** 和必要时的 **scan degradation**，并复用 UNet 的架构、切片和后处理。

UNet 失败页（来自 `candidate.json`，覆盖 README 里「4 多峰 / 3 出带」的计数误差）：

| item      | page | expected | detected | 类                 |
| --------- | ---: | -------: | -------: | ------------------ |
| `4945954` |    0 |        4 |        5 | extra peak         |
| `6007571` |    1 |        4 |        6 | extra peak         |
| `6007571` |    2 |        4 |        4 | center-out-of-band |
| `5862368` |    3 |        4 |        5 | extra peak         |
| `5862368` |    4 |        4 |        4 | center-out-of-band |
| `5862368` |    5 |        4 |        4 | center-out-of-band |
| `6011095` |    2 |        5 |        5 | center-out-of-band |

这些页只用于评测与 overlay 诊断，禁止写入训练集。

## Frozen identities

- architecture：`compact-layout-unet-v1`
- slice SHA-256：`dc64fe27d26a109ee20736d6e8fe028da44f7e399f0fcc9fd7ef339df26172e3`
- UNet checkpoint SHA-256：`03fe737f663a3381c4a26e21b083c00176e0b64fb746b3215ab0d905798aac15`
- post-process：`gaussianSigma=6`、`minimumCenterDistance=100`、`minimumCenterScore=0.5`
- `staffCount=3`（corpus 假设）
- diagnostic truth SHA-256：`977ae09486dd420bfaa7089fd7e071c03d65cbecf01a8af72f58c6a8e8b3526f`
- render manifest SHA-256：`fbc55413a9a5503bcb46a6cbbc57dbfc8662123c431dba6eba62df122adc81bc`
- UNet baseline：22/29 pages，works admitted `2/3, 2/2, 5/5, 2/4, 4/7, 7/8`

## Execution plan

1. [x] Target prototype（不训练）：实现 `minimumInterSystemGapPx = 8` 的 gapped system-band mask。冻结
       512/128 切片双跑 report SHA-256 `a080270377a2d64e8b5d26f296bc4b2b2ddce92647768c754ba513da8855d507`。
       train 510/512 已满足 ≥21 行间距故 mask 不变；2 页并排/重叠 fail closed。validation 128/128 不变。
2. [x] Human checkpoint：没有 silently merge。排除 `6613436` pageIndex 1 与 `6162644` pageIndex 1。
3. [x] Experiment A 训练跳过：prototype 已证明 gapped target 在当前 Lieder 页上是 no-op（`GAP_TARGET_NOOP_ON_LIEDER`）。
       再跑 3 epoch 不会改变 supervision。gapped mask 仍作为后续训练不变量，并排除上述 2 页。
4. [x] Experiment A 评测跳过，理由同上。
5. [x] 因 A 不能产生新信号，直接进入 B；不回头改 gap=8。
6. [x] Experiment B 训练：gapped target + 预注册 scan degradation，3 epochs。合成 Dice system-band
       `0.9120` / staff-line `0.4423`。实际 train/validation 502/123（缺 PNG 8+5，gap 排除 2）。
       checkpoint SHA-256 `f7996a2b7796c552346fc1fc13ca4b57e95dfb6ce53491a9b3e85b9428384341`。
7. [x] Experiment B 评测：14/29 topology-exact、5/6 works；`5862368` 掉到 0/7。双跑 report SHA-256
       `04da08773d3334ecf3dcb41580351725ba15c982c4d1bbaf437b5423b067865c`。结论
       `STOP_SCAN_DOMAIN_V1`。未 materialization，未换 detector 家族。

## Acceptance criteria

- [ ] topology-exact pages > 22/29。**未达到（14/29）。**
- [ ] 6/6 works 至少一页 exact；UNet 基线 admitted>0 的 work 不得掉到 0。**未达到（`5862368` 为 0）。**
- [x] 后处理全局冻结；`staffCount=3` 在报告中声明为 corpus 假设。
- [x] 未使用 6 个 evaluation works 或 holdout 训练。
- [x] 双跑 report hash 一致。
- [x] 未修改产品 dependency、runtime default 或 App surface。

## Outcome

`STOP_SCAN_DOMAIN_V1`。UNet 22/29 仍是当前 research baseline。durable evidence：
`tools/pdf-omr-cli/reports/exploratory/gapped-system-band-target-v1/`、
`tools/pdf-omr-cli/reports/exploratory/layout-scan-domain-b-v1/`。

## Verification

- 最小测试：相关 Python `unittest`（gapped mask、degradation seed、evaluator 回归）。
- Candidate gate：29-page OLiMPiC development 双跑，对照 UNet `candidate.json`。
- 完成门禁：`pnpm format:check`、`git diff --check`；若改了 CLI TypeScript 再跑对应 Vitest。

## Stop conditions

- Target prototype 无法在不 merge 的前提下保证 8px gap：停止，汇报哪些页被排除，不降低 gap 去迁就。
- A 与 B 都未过 22/29 或把某一 work 打成 0：`STOP_SCAN_DOMAIN_V1`。下一投资不自动成立。
- 禁止的补救：在 29 页上搜 sigma/NMS、把失败页加入训练、上 DETR/OLA、放宽 Y-band 合同。

## Open decisions

- 未过 22/29，不做 materialization。
- 2-staff 钢琴 full-page layout 仍是独立 initiative。
- 产品 Library 导入质量线不因本轮结果下调。
