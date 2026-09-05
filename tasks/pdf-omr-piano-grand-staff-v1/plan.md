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

1. [x] 冻结 K331 六页 2-staff topology truth：`6/6/1/6/6/2`，mapping SHA-256
       `0f9b66aa464d4985087b5dc6c56e530a2f95e20f5c99c09c02c72e935ec1f0e8`。
2. [x] evaluator 支持 `staffCount=2`。unittest：`test_evaluate_layout_segmenter.py`、
       `test_evaluate_piano_layout.py`。
3. [x] 经典 detector 四组 flags + UNet staffCount=2 全六页。UNet 3/6，双跑 SHA
       `2f239be433f2f75c1049f22a57e3528da2159e6854611a71e5637f244ae7af6f`。runtime fragmented 最多 2/6；
       **non-fragmented grand-staff 6/6**。
4. [x] Checkpoint：不训练。钢琴 full-page 缺口是 `allowFragmentedRuns=true`，不是缺网络。UNet 3/6
       不足以替换。不改 runtime default。
5. [x] 未重跑 Rokot/LEGATO：27-system 分母已有
       `k331-page-scope-ablation-v1` 的 Joint F1 `0.1567` / header-context `0.3768`。
6. [x] 产品 runtime 保持 `STOP`。下一投资：钢琴路径改用 non-fragmented grand-staff（另立 runtime Spec），
       以及 2-staff 识别质量，不是 layout 训练。

## Acceptance criteria

- [x] K331 六页有冻结的 2-staff topology truth 与双跑 detector 报告。
- [x] 失败类区分 pairing vs count；测量前不训练。
- [x] 未使用 OLiMPiC 29 页作为本 slice 的通过条件。
- [x] 未读 holdout；未改产品 dependency。
- [x] 识别沿用既有 27-system K331 证据，不把 process success 当 F1。

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
