# Piano evaluation corpus suitability v1

> Status: development evidence，完成于 2026-08-29。只检查公开 development 候选，不读取 frozen holdout，
> 不修改 Rokot runtime default、detector 或 App gate。

## 结论

DCML 与 ASAP 都不能未经适配直接加入当前 PDF OMR quality gate。MuseScore 官方 OMR Benchmark 可以直接复用
CC0 的 MSCZ ground truth，但必须先按 topology 与 readiness 筛选；其增强 PDF 与当前 classical detector 不兼容，
clean transcription 与 augmented layout admission 必须分开报告。

## DCML

固定的 `DCMLab/mozart_piano_sonatas` v2.3 archive SHA-256 为
`70c401e1aa48843326400992c3a61225e4425190d39d64b242a6c1d0fdc3ef87`。archive 含 58 份 `MS3/*.mscx` 与
54 份 `reviewed/*.mscx`。对 `K282-1` 用 MuseScore 4.7.4 实际渲染后确认：`MS3` 页面带 DCML harmony labels，
`reviewed` 页面还包含红色审校音符。因此 DCML 适合已有的 derived-controlled research，但视觉输入必须先确定性
移除 analysis/review markup；不能把原始渲染称为普通 clean score。

Source: <https://github.com/DCMLab/mozart_piano_sonatas/tree/v2.3>

## ASAP

对仓库 `test-fixtures/harmony/datasets/manifest.json` 已登记的 5 份 ASAP v1.1 piano MusicXML 做当前
ground-truth audit：Bach BWV 846、Beethoven 17-1、Debussy Pour le Piano 1、Mozart 11-3 与 Schumann Arabeske
均未通过 readiness，结果为 0/5 ready。用 MuseScore 4.7.4 重导 MXL 后仍为 0/5；主要阻断为
`VOICE_DURATION_MISMATCH`、tie diagnostics，Debussy 原始输入还触发 `ENGINE_OUTPUT_INVALID`。

ASAP 页面本身干净，可用于 ingestion 或独立 symbolic evaluation，但在修复当前 MusicXML timing boundary 前，
不能直接进入现有 PDF OMR gate。

Source: <https://github.com/fosfrancesco/asap-dataset/tree/v1.1>

## MuseScore OMR Benchmark pilot

官方数据 revision `e27f6a8634e80ad0997af8a806c8dc00e45c4a07` 提供 1,077 对 augmented PDF + MSCZ，许可为
CC0-1.0。metadata 只含文件路径，不含 instrument/topology；在 IDs 0–11 的最小 pilot 中，从 MSCZ 检出 5 个
`piano / 1 part × 2 staves`，经 MuseScore 4.7.4 重导 MXL 后 IDs 4、9 为 2/5 readiness-ready。

两份官方 augmented PDF 都在当前 detector 的 `staff-groups` 阶段得到 0 groups，不能进入 Rokot transcription。
使用同一 MSCZ 确定性重渲染 clean PDF 后，两份 case 均通过 segmentation 并完成两种 header policy：

| Case                    | Systems | Policy  |   Pitch F1 |   Joint F1 | Valid measures |
| ----------------------- | ------: | ------- | ---------: | ---------: | -------------: |
| `musescore-omr-4-clean` |      15 | `L/M/K` |     0.8686 |     0.4238 |         46/184 |
| `musescore-omr-4-clean` |      15 | `L/M`   | **0.9266** | **0.4623** |     **69/184** |
| `musescore-omr-9-clean` |       4 | `L/M/K` | **0.9521** | **0.3683** |          10/40 |
| `musescore-omr-9-clean` |       4 | `L/M`   | **0.9521** |     0.3538 |          10/40 |

ID 4 支持省略 `K`，ID 9 则有小幅 Joint regression。加上既有 K331 改善与 K280 明显回归，当前证据仍不支持
全局切换为 `L/M-only`。两个 clean case 作为新的 development evidence 保留；完整 MSCZ、PDF、MXL、crops 与
engine artifacts 不进入 Git。

Source: <https://github.com/musescore/omr_benchmark>，
dataset: <https://huggingface.co/datasets/musegroup/omr_benchmark>

结构化结果见 [`summary.json`](summary.json)。
