# OLiMPiC real full-page detector v2 baseline

> Status: development evidence，完成于 2026-08-26。该结果只使用
> `olimpic-scanned-full-page-dev-v1` development split，不读取 holdout，不改变历史 report。

## 结论

当前 `rokot-staff-system-v2` 在相同的 6 works、29 real-scanned pages 上仍为 0/29 segmentation admission。
所有页面均在 `grand-staff-pairing` fail closed；detector 找到 9–58 个 staff-group candidates，但每页仍有
1–32 个 group 无法唯一配对，因此没有发布任何 system crop，也没有调用 recognition engine。

本结果说明 quick profile 中 detector v2 对 synthetic full-page 的改善不能外推到真实整页扫描。当前
real-scanned full-page decision 仍为 `STOP`，但这是 layout pipeline 结论，不是 Rokot 或 LEGATO transcription
质量结论。

## Identity

| Field | Value |
| --- | --- |
| Corpus | `olimpic-scanned-full-page-dev-v1` |
| Manifest SHA-256 | `4cbd78411f15f73bf548a50f2af125e29c6cc42297b43a8616934a08a2cb0a1f` |
| Render | `targetWidth=1400`, landscape allowed |
| Preprocess | `none@1.0.0` |
| Detector | `rokot-staff-system-v2` |
| Canonical pilot SHA-256 | `41565eb8288278913169109556ec56f29728b1fb3391ddab3d3ded4345772390` |
| Repeated-run agreement | `1.0` |

两次独立运行生成 byte-identical canonical report。完整 local pilot 含逐页 render hash、失败 context 与 bounded
staff-group evidence，不进入 Git；仓库只保留本 README 与 [`summary.json`](summary.json)。

## Decision

不通过降低 connector threshold、忽略 unpaired groups 或人工 crop 绕过失败。下一步先在相同 development inputs
上执行版本化的 deterministic preprocessing ablation；若 deskew、local contrast 和 adaptive threshold 均不能
产生无回归的 segmentation improvement，再为 learned layout detector 单独设计模型、许可、hash、runtime 与
artifact contract。

Ground truth readiness 和 symbolic/Harmony quality 未在本 pilot 中评估，因此不得从 0/29 segmentation
admission 推导 note-level F1。
