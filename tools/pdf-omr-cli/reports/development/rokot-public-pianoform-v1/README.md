# Rokot public pianoform quick development evaluation

> Status: development evidence，完成于 2026-08-13。该结果使用 10-item quick profile，不读取 holdout，
> 不触发 gate，也不改变既有 frozen `STOP` 或 App 隔离边界。

## 结论

Rokot 已能完成当前 quick development set 的 10/10 recognition admission；此前 5/10 的主要损失不是
模型完全不可用，而是 system crop 被重复 segmentation、full-page detector 对密集谱面产生重复 staff
候选，以及单谱表输出缺少显式 voice declaration。修复这些边界后，CLI 不再产生 recognition failure。

这不等于结果已经可用于产品。10 项中只有 4 项的预测 Draft 同时达到 Harmony 与 MusicXML `ready`，
其余 6 项仍被 measure duration、voice duration、staff measure count 和缺失结构 header 等诊断阻断。
因此当前决策仍是 `INVESTIGATE`，下一步应改善模型输出和跨 staff/measure joining，不能放宽 validator。

## Admission progression

| Stage                                       | Succeeded | Failed | 主要变化                                     |
| ------------------------------------------- | --------: | -----: | -------------------------------------------- |
| Explicit staff layout                       |         5 |      5 | 建立 single/grand-staff 输入声明             |
| `inputScope` routing                        |         8 |      2 | OLiMPiC system crop 绕过二次 segmentation    |
| Detector v2 + single-staff canonicalization |        10 |      0 | 修复 dense full-page pairing 与 unvoiced ABC |

最终 canonical report SHA-256 为
`ff4a45aadf5388353a77053766267cf58a06633aeebbb1952d8292abcf5a25f9`。十项累计 item wall time 约
`218s`，最慢单项约 `46.9s`，满足 quick profile 的一小时预算。

## 质量边界

| Metric             | Overall | Oracle-system quality slice |
| ------------------ | ------: | --------------------------: |
| Pitch F1           |  0.8889 |                      0.7544 |
| Onset F1           |  0.9077 |                      0.7640 |
| Duration F1        |  0.8656 |                      0.6958 |
| Joint F1           |  0.4144 |                      0.1774 |
| Valid measure rate |  0.3829 |                      0.0750 |

Overall 包含 synthetic contract/full-page cases，不能用来替代真实 `oracle-system` quality slice。尤其是
quality joint F1 和 valid measure rate 仍低，说明 admission 的提升主要修复了 pipeline false negatives，
尚未证明 notation fidelity 达到产品可用水平。

完整结构化聚合见 [`summary.json`](summary.json)。本地完整 runs、失败 crop、raw ABC、PNG、MXL、模型、
cache 和 Python environment 均不进入 Git；`.gitignore` 只排除生成式 `rokot-evaluation-*` 与
`rokot-quick-*` 目录，后续 durable evidence 仍需显式提炼为 README 和小型 summary。
