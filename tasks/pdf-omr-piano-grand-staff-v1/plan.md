# Task: 在 K331 钢琴大谱表上测量现有 full-page layout，再决定修 pairing 还是修识别

## Goal

用现有 detector（经典 pairing + compact UNet，固定 `staffCount=2`）在 K331 六页上交出可复现的 2-staff
system crops，并在同一套 crops 上报告 Rokot/LEGATO 质量。不为超过 OLiMPiC 22/29 再训练。

## Non-goals

- 不训练新模型，除非测量证明钢琴页是 localization 崩溃而不是 pairing。
- 不上 DETR/OLA，不继续 Lieder scan-domain，不用 OLiMPiC 29 页当门。
- 不修改 App / runtime default，不新增 `onnxruntime-node`，不读 holdout。
- 不把 Library F1 门槛降到当前识别质量。

## Canonical context

- `docs/specs/2026-09-05-pdf-omr-piano-grand-staff-slice.md`
- `docs/evaluation/pdf-omr.md` 节「当前结论（2026-09-05）」
- `test-fixtures/musicxml/K331-3_reviewed.pdf` / `.mxl`
- `tools/pdf-omr-cli/reports/exploratory/k331-page-scope-ablation-v1/`
- `tools/pdf-omr-cli/scripts/evaluate_layout_segmenter.py`
- `tools/pdf-omr-cli/reports/development/olimpic-layout-multihead-v1/`（UNet checkpoint，仅作权重来源）

## Why this is a new scheme

上一轮把产品门设成「扫描 3-staff mixed 的通用 layout」。证据表明：

- 再训 Lieder 不能迁移到扫描粘连；
- 3-staff crop 喂不进 Rokot；
- 钢琴路径上，经典 detector 在 clean MuseScore 钢琴谱已经能切 system，K331 的已知缺口是第 1 页
  `grand-staff-pairing`，以及 crop 之后的识别 F1。

因此本 plan 第一刀是 **测量**，不是新网络。

## Frozen identities

- 输入：`test-fixtures/musicxml/K331-3_reviewed.pdf`
- 历史 system 数：`6/6/1/6/6/2`（27 systems，2-staff）
- UNet：`compact-layout-unet-v1`，后处理 `sigma=6 / distance=100 / score=0.5`，本 slice 固定
  `staffCount=2`
- Rokot context：保持 `previous-prediction-headers-v1`（L/M/K）
- 识别对照：verified-systems Joint F1 `0.1567`；header-context `0.3768` / valid `57/274`

## Execution plan

1. [ ] 冻结 K331 六页的 2-staff topology truth（每页 system 数与纵带）。以历史 verified 27 crops 的页内
       顺序为起点，人工复核 `staffCount=2`；不读取 holdout。输出 development sidecar + SHA。
2. [ ] 扩展 layout evaluator，允许固定 `staffCount=2`（不要写死 3）。无训练。验证：相关 Python unittest。
3. [ ] 一次跑经典 `rokot-staff-system-v2` 与 UNet（staffCount=2）全六页。全局参数冻结。报告逐页
       pairing / count / center 失败，以及 topology-exact。双跑 hash。
4. [ ] Human checkpoint（按测量选路，不回头刷 OLiMPiC）：- 仅第 1 页 pairing、其余 exact → 最小 pairing 修复或失败页用 UNet，不训练。- UNet 六页 localization 可用 → 用它物化 2-staff crops，进入识别。- localization 崩溃 → 停止本 slice，另立 2-staff 钢琴 typeset 训练；仍禁止 OLiMPiC 29 页。
5. [ ] 若至少 5/6 页 admitted，或「5 页 exact + 1 页 pairing-only」：物化 2-staff system PDFs，Rokot 与
       LEGATO 跑同一套 crops，报告 Pitch/Onset/Duration/Joint 与 valid measures。不得用 process success
       代替 F1。
6. [ ] 识别数字只记录。产品 runtime 保持 `STOP`。若 F1 仍远低于发布线，下一投资写进报告：LEGATO 2-staff
       topology/tie，而不是 layout。

## Acceptance criteria

- [ ] K331 六页有冻结的 2-staff topology truth 与双跑 detector 报告。
- [ ] 失败类区分 pairing vs localization vs count；测量前不训练。
- [ ] 未使用 OLiMPiC 29 页作为本 slice 的通过条件。
- [ ] 未读 holdout；未改产品 dependency。
- [ ] 若进入识别，Rokot 与 LEGATO 使用同一 ordered crop hashes。

## Verification

- 最小测试：layout evaluator 的 `staffCount=2` unittest。
- Candidate gate：K331 六页双跑 +（过测量门后）识别对照。
- 完成门禁：`pnpm format:check`、`git diff --check`。

## Stop conditions

- 用 OLiMPiC 22/29 或 1-staff exact 当本 slice 的门：禁止。
- 测量尚未完成就开始训练：禁止。
- pairing-only 失败却新开神经网络：禁止。
- 把 process success 写成识别质量：禁止。

## Open decisions

- MuseScore OMR Benchmark ID 4/9 clean PDF 是否并入同一 development 分母：测量 K331 之后再决定，不挡第一刀。
- UNet 的 ONNX / `onnxruntime-node` 体积仍不自动进入产品。
