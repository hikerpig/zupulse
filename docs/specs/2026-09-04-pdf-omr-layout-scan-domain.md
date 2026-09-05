---
status: implemented
date: 2026-09-04
approved: 2026-09-05
owner: Engineering
scope: PDF OMR CLI development experiment only
depends_on: 2026-08-26-pdf-omr-learned-layout-detector-proposal.md
---

# PDF OMR layout scan-domain 适配

## Problem

`compact-layout-unet-v1` 已在冻结的 6 works / 29 页 OLiMPiC development 上达到 22/29 topology-exact、6/6
works。失败集来自 `candidate.json`，共 7 页：3 页多峰（`4945954` p0、`6007571` p1、`5862368` p3），4 页数量
正确但 ordered center 出带（`6007571` p2、`5862368` p4–p5、`6011095` p2）。根因是 filled system-band 在真实
扫描上把相邻 system 连成高概率区域。现有 Lieder 增强（blur ≤ 0.65、noise σ ≤ 4）不足以制造这个域。

`pdf-omr-layout-topology-v2` 把下一目标设成「去掉 `staffCount=3` + 1/2/3-staff 各类 ≥ 0.85 + 超过 22/29」。
该合成 1-staff 门挡住了 DETR v1；后来跳过该门把同一 checkpoint 放到 29 页上，结果是 16/29、5/6 works，不能
替换 UNet。1-staff 在这 29 页上不存在，也不是钢琴产品主路径。

本提案只批准下一轮 research：在 **不换 detector 家族、不训练评测集、不把 1-staff 当总闸** 的前提下，修补
UNet 的 scan-domain system 分界。

## Goal

训练并评测一个 research-only compact layout candidate，在冻结的 29 页 OLiMPiC development 上超过 22/29
topology-exact，并保持 6/6 works 仍有至少一页 exact。`staffCount=3` 作为本 corpus 的显式假设保留。

## Non-goals

- 不修改 App、Bridge、Desktop runtime、detector default，不新增 `onnxruntime-node`。
- 不读取 frozen holdout，不用 6 个 OLiMPiC evaluation works 的页面训练。
- 不把 1-staff class exact、macro class exact 或 Lieder balanced slice 当作是否运行 OLiMPiC 的条件。
- 不继续 DETR、Deformable DETR、OLA-style、Ultralytics 或自定义 object-center head。
- 不搜索 Gaussian sigma、NMS distance、valley ratio 或按页路由。
- 不在本轮解决 Rokot/LEGATO 识别质量、3-staff 合同或 2-staff 钢琴产品路径。

## Locked decisions

1. **评测集与度量不变。** 仍用 `olimpic-scanned-full-page-dev-v1`、diagnostic truth SHA-256
   `977ae09486dd420bfaa7089fd7e071c03d65cbecf01a8af72f58c6a8e8b3526f`、render manifest SHA-256
   `fbc55413a9a5503bcb46a6cbbc57dbfc8662123c431dba6eba62df122adc81bc`，以及
   `evaluate_layout_segmenter.py` 的 Y-band topology（数量、`staffCount=3`、中心落在 truth 纵带）。
2. **模型家族不变。** 继续 `compact-layout-unet-v1`（30,090 parameters）与已冻结的
   `gaussianSigma=6`、`minimumCenterDistance=100`、`minimumCenterScore=0.5`。
3. **训练切片不变。** 复用 UNet 的 slice SHA-256
   `dc64fe27d26a109ee20736d6e8fe028da44f7e399f0fcc9fd7ef339df26172e3`（512/128），不改用 topology-v2 的
   1/2/3 平衡切片。
4. **`staffCount=3` 是假设，不是作弊。** 本 development corpus 的 121 个 system 全部是 voice + piano grand
   staff。候选必须在报告中声明该假设；不得据此宣称通用 staff-count detector，也不得进入产品 runtime。
5. **变量隔离，最多两次训练。** 第一次只改 system-band target；第二次仅在第一次未过 OLiMPiC 门时加入更强
   scan degradation。每次训练结束后只读一次 29 页，失败即停，不在评测集上搜参。

## Experiment A: gapped system-band target

当前 `draw_system_band_mask` 把每个 `normalizedBBox` 画成实心矩形。相邻 system 在 768 行分辨率上可能只隔
数像素，resize 后连成一条带，模型没有监督信号去学分界。

新 target 必须：

- 仍按 reading-order 覆盖每个 system 的纵带；
- 同一页相邻 system 在 model 分辨率 `(512, 768)` 上至少保留 `minimumInterSystemGapPx = 8` 行背景；
- 若现有间距已经 ≥ 8，不扩大 gap、不移动中心；
- 若间距 < 8，两个 box 各自向中心收缩，直到 gap 为 8；任一 system 高度变为非正时 fail closed 并排除该页，
  不得 silently merge；
- 横向仍用原 bbox；不引入 staff-count head。

先做不训练的 target-level prototype：在 512/128 切片上检查 gap 不变量、排除页清单、canonical mask hash
双跑一致。prototype 通过后才允许训练。

训练：cold-start 同一 architecture，3 epochs，其余优化与 UNet 训练协议相同。合成 validation 只报告
system-band Dice 作为诊断，**不设 1/2/3-staff 门**。然后用冻结后处理跑 29 页 OLiMPiC。

## Experiment B: stronger scan degradation

仅当 Experiment A 的 OLiMPiC 未过门时执行。在现有几何 jitter 之外，对 **train 页** 增加确定性 scan-like
退化；validation 保持 clean。预注册、不得按 29 页回写：

- show-through：把本页向下平移 6–14 px 的 8–12% 透明度叠回；
- Gaussian blur radius 上限 1.8（现 0.65）；
- Gaussian noise σ 上限 12（现 4）；
- 一次 2× down/up 模拟印刷网点。

seed 必须写入 artifact。只训练一个 candidate，再读一次 29 页。

## Admission gate

同时满足才算本 initiative 的 research investment 通过：

1. topology-exact pages > 22/29；
2. 6/6 works 仍至少有一页 exact（不得把某一 work 打成 0）；
3. `staffCount` 仍来自本 corpus 的固定假设 3，后处理全局冻结；
4. 非法 bbox/顺序 fail closed；同一 identity 双跑 report 与 overlay hash 一致；
5. 未读取 holdout，未修改产品 dependency。

过门只表示可以讨论 materialization 与是否另立 integration Spec。产品 runtime 保持 `STOP`。任一 work 的
admitted 页数相对 UNet 基线下降时必须写入报告，但不单独否决，只要该 work 未掉到 0 且总分超过 22。

## Follow-up tracks（本提案不执行）

- 2-staff 钢琴 full-page layout（K331 / MuseScore OMR Benchmark piano）。那是产品主路径，但不得与本轮
  3-staff mixed OLiMPiC 评测绑成同一 gate。
- LEGATO time-signature / tie / output topology。layout 过 22/29 也不会让 36 个 3-staff crop 变成可练习谱。
- 通用 1/2/3-staff detector。需要单独的产品假设和评测集。

## 2026-09-05 implementation outcome

gapped system-band prototype 在冻结 Lieder slice 上为 `GAP_TARGET_NOOP_ON_LIEDER`：510/512 train 与
128/128 validation 的 mask 与 filled-band 相同，2 个并排页 fail closed。Experiment A 因此不训练。

Experiment B 使用同一 compact UNet、冻结后处理、train-only scan degradation，29 页结果为 14/29
topology-exact、5/6 works，`5862368` 为 0/7。Admission gate 未过。决策 `STOP_SCAN_DOMAIN_V1`；产品
runtime 保持 `STOP`。`compact-layout-unet-v1` 的 22/29 仍是当前 research baseline。
