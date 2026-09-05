---
status: implemented
date: 2026-09-05
approved: 2026-09-05
owner: Engineering
scope: PDF OMR CLI development experiment only
depends_on: 2026-08-26-pdf-omr-learned-layout-detector-proposal.md
---

# PDF OMR 钢琴大谱表 vertical slice

## Problem

Lieder → OLiMPiC 29 页 3-staff mixed 的 layout 投资已经结案。最好结果 `compact-layout-unet-v1` 22/29 仍假设
`staffCount=3`；DETR 与 scan-domain 更差。该评测集不是产品：Rokot 不能表达第三谱表，36 个 detector crop 上
Rokot 0/36 ready、LEGATO 1/36。产品是钢琴练习，合同是 1–2 staff。

已有更贴近产品的证据，但被 29 页总闸挡住了：

- K331 纯钢琴 grand-staff：verified 27 个 system crop 的 Rokot 明显好于整页；第 1 页当前
  `rokot-staff-system-v2` 在 `grand-staff-pairing` fail closed。
- MuseScore OMR Benchmark 的 clean 钢琴重渲染，经典 detector 已能切 system；augmented 扫描 PDF 不能。
- 即便 oracle/verified 2-staff crop，Joint F1 大约 0.15–0.46，合法小节 21–43%。layout 过了也不是可练习谱。

本提案换分母：只做合同内 2-staff 钢琴。先测现有工具，不为刷 OLiMPiC 再训练。

## Goal

在 K331 六页 derived-controlled 钢琴谱上，用现有 detector 得到可复现的 full-page 2-staff system crops，并在
同一套 crops 上报告 Rokot 与 LEGATO 的符号质量。成功不定义为 Joint F1 ≥ 0.90；成功是：不再用 3-staff
扫描页决定钢琴路径，并得到一份能指导下一步是修 pairing 还是修识别的冻结数字。

## Non-goals

- 不把超过 OLiMPiC 22/29 当作本轮门。
- 不训练新的 1/2/3-staff 通用 detector，不上 DETR/OLA，不在 Lieder 上继续 scan degradation。
- 不读取 `piano-eight` holdout，不用 OLiMPiC 6 个 evaluation works 训练。
- 不修改 App、Bridge、runtime default，不新增 `onnxruntime-node`。
- 不把 Library 导入质量线降到当前 F1。
- 第一刀不训练模型。只有测量证明 **localization** 在钢琴页上崩溃，才允许另立 2-staff 训练实验。

## Locked decisions

1. **评测集是 K331-3_reviewed，不是 OLiMPiC 29 页。** 输入
   `test-fixtures/musicxml/K331-3_reviewed.pdf`，truth 为同目录 MXL。历史 verified 系统数为
   `6/6/1/6/6/2`，共 27 个 2-staff system。
2. **`staffCount=2` 是本 slice 的显式假设**（钢琴大谱表），写进报告，不是通用计数器。
3. **先测后训。** 比较两个已有 detector，全局参数冻结，禁止按页路由：
   - `rokot-staff-system-v2`（当前 runtime，已知第 1 页 pairing 失败）；
   - `compact-layout-unet-v1` 只把固定 staffCount 从 3 改成 2，不重训。
4. **失败分类必须分开：** unpaired/pairing、system count、center 出带。pairing 失败走最小 pairing 修复，
   不新开神经网络。
5. **识别质量在 layout 能交出 2-staff crops 之后才评。** 同一套 crops 跑 Rokot（保持 `L/M/K`）与 LEGATO，
   对照已有 K331 verified-crop 基线（Joint F1 `0.3768` / valid `57/274` 为 header-context 上界参考，
   无 context 的 verified-systems 为 `0.1567` / `19/274`）。不得用 process success 代替 F1。

## Admission（本 slice 的 research gate，不是产品发布）

测量阶段通过，当且仅当：

1. 六页都有合法 fail-closed 输出（允许部分页 not-admitted，但必须有稳定 error）；
2. 至少 5/6 页 topology-exact（数量、中心在 truth 纵带、`staffCount=2`），或第 1 页被明确归类为 pairing-only
   且其余 5 页 exact；
3. 双跑 crop/report hash 一致；
4. 未读 holdout，未改产品 dependency。

过测量门之后才允许跑识别。识别数字只报告，不设本轮发布阈值。产品 runtime 保持 `STOP`。

## Follow-up（测量之后才选）

- pairing-only：最小 grand-staff pairing 修复或对失败页使用 UNet，不训练。
- localization 崩溃：另立 2-staff 钢琴 typeset 训练 Spec，训练数据不得使用 OLiMPiC 29 页。
- layout 已够、F1 仍低：下一投资是 LEGATO 2-staff 的 time-signature / tie / output topology，不是 layout。

## 2026-09-05 implementation outcome

测量完成，未训练。K331 六页 truth 为 `6/6/1/6/6/2`。runtime fragmented 最多 2/6；UNet staffCount=2 为
3/6。non-fragmented grand-staff 为 6/6。决策：不为钢琴再训 layout；下一步若改代码，是钢琴路径使用
non-fragmented grand-staff，以及识别质量。产品 runtime 保持 `STOP`。
