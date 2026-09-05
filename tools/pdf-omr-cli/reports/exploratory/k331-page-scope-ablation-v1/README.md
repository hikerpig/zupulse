# K331 Rokot page-scope ablation v1

> Status: development evidence。使用 derived-controlled K331 fixture，不读取 holdout，不改变 frozen `STOP` 或 App gate。

## 方法

同一份 6 页纯钢琴 grand-staff PDF 与 reviewed MXL truth 比较：

- `direct-page`：每个完整 PDF page 作为一个 model unit，绕过 segmentation；
- `verified-systems`：使用历史 `rokot-grand-staff-v1` 物化并复核的 27 个 ordered system crops，每个 crop 作为一个
  model unit，再走当前 Rokot normalizer joining。

两侧固定 model revision `7add305aade6fb3a64ad4dde77d410fa68381089`、prompt、`ctxSize=4096`、
`maxNewTokens=1600`、temperature `0` 与 converter。verified crops 的系统数按页为 `6/6/1/6/6/2`，与既有 K331
冻结 evidence 一致；完整 crops、ABC、MusicXML fragments 与 Draft 不进入 Git。

## 结果

Ground truth 每个 staff 有 137 measures，共 274 staff-measures。

| Variant          | Model units | Measures/staff | Diagnostics | Pitch F1 | Onset F1 | Duration F1 | Joint F1 | Valid measures | Elapsed |
| ---------------- | ----------: | -------------: | ----------: | -------: | -------: | ----------: | -------: | -------------: | ------: |
| direct-page      |           6 |        140/140 |         362 |   0.3407 |   0.5820 |      0.5486 |   0.0750 |          0/274 |  129.4s |
| verified-systems |          27 |        138/138 |         193 |   0.4919 |   0.7632 |      0.7182 |   0.1567 |         19/274 |  200.2s |

逐 system 输入在 measure count、全部 symbolic F1、diagnostics 与 valid measures 上都优于整页直接输入，代价是 inference
次数与 wall time 增加。

## Previous-system header context probe

在相同 27 crops 上追加 development-only 单变量：首个 system 使用原 prompt；后续 prompt 只携带上一份 prediction 中
唯一合法的 `L/M/K`，不读取 truth、其他 engine 或人工 header。该 variant 得到 137/137 measures、148 diagnostics，
Pitch/Onset/Duration/Joint F1 为 `0.7525 / 0.9162 / 0.9484 / 0.3768`，valid measures 为 `57/274`（`20.80%`）。

该提升支持把 previous-system header context 集成到 Rokot runtime。上下文只接受格式安全的 `L/M/K`；任一 header
不安全时，下一 system 回退到基础 prompt，normalizer 不变。
集成后的真实 adapter 对 27-page verified-systems PDF 重跑得到 137/137 measures、148 diagnostics、57/274 valid
measures，Joint F1 `0.3765`，确认 runtime 路径复现了 probe。

上下文仍可能传播音乐上错误但格式合法的 header；本轮确实出现中途预测 `K:G` 后持续传播的现象。该风险作为已知限制
保留，下一步需在第二个合同内 work 上复现，并单独修复当前 full-page detector。

## Detector observation

当前 runtime 使用 `rokot-staff-system-v2 + allowFragmentedRuns=true` 时，在 K331 第 1 页
`grand-staff-pairing` fail closed：16 groups 中有 5 个 unpaired。相同 detector 在非 fragmented 模式的现有测试仍得到
27 systems。为隔离 transcription，本实验使用历史已复核 crops；这不代表当前 full-page detector regression 已解决。

结构化结果见 [`summary.json`](summary.json)。
