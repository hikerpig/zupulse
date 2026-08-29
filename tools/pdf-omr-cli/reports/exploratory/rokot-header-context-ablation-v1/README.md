# Rokot header-context ablation v1

> Status: development evidence。K331 为 derived-controlled piano grand-staff，melody-eight 为 development
> synthetic single-staff。不读取 holdout，不改变 frozen `STOP`、App gate 或 runtime default。

## 方法

在同一份已物化的 ordered system-crop PDF 上比较四个无 truth 的 prompt 策略：

| Policy                           | 注入的上一 system 上下文                                       |
| -------------------------------- | -------------------------------------------------------------- |
| `previous-prediction-headers-v1` | 安全的 `L/M/K`（当前 runtime）                                 |
| `previous-lm-headers-v1`         | 只注入 `L/M`                                                   |
| `first-system-key-v1`            | `L/M` 来自上一 prediction，`K` 冻结为首个安全 key              |
| `key-consensus-v1`               | 默认同 runtime；上一 key 与再上一 key 不一致时改为只注入 `L/M` |

K331 使用 `rokot-staff-system-v2`、`allowFragmentedRuns=false` 物化 27 个 grand-staff crops，分页为
`6/6/1/6/6/2`。这与历史 `rokot-grand-staff-v1` 系统数一致，crop hash 不同；baseline 的 Pitch/Onset/Duration/Joint
F1 与 valid measures 仍复现了上一轮 `L/M/K` 结果。melody-eight 物化为 2 个 single-staff crops。两侧均声明真实
topology，并以 `inputScope=system-crop` 隔离 transcription。

评测在 ground truth Harmony-blocked 时仍计算 symbolic metrics（K331），并额外报告 staff / voice / tie / tuplet
F1 与 raw/validated diagnostics-by-code。

## K331 结果

Ground truth 每个 staff 137 measures，共 274 staff-measures。K.331 第三乐章书面调性为 A 小调/A 大调。

| Policy                           |      Pitch |  Onset | Duration |      Joint |      Staff |      Voice |        Tie |     Tuplet |       Valid | Key sequence         | Elapsed |
| -------------------------------- | ---------: | -----: | -------: | ---------: | ---------: | ---------: | ---------: | ---------: | ----------: | -------------------- | ------: |
| `previous-prediction-headers-v1` |     0.7525 | 0.9162 |   0.9484 |     0.3768 |     0.6872 |     0.3781 |     0.6811 |     0.6825 |      57/274 | `C`×8 then stuck `G` |  101.3s |
| `previous-lm-headers-v1`         | **0.9296** | 0.9156 |   0.9421 | **0.4922** | **0.8482** | **0.4935** | **0.8460** | **0.8474** | **117/274** | `C`/`A` 交替，无 `G` |  103.1s |
| `first-system-key-v1`            |     0.7375 | 0.9170 |   0.9465 |     0.3665 |     0.6712 |     0.3679 |     0.6632 |     0.6646 |      57/274 | 冻结 `C`，输出仍抖动 |  137.7s |
| `key-consensus-v1`               |     0.8567 | 0.9157 |   0.9402 |     0.4432 |     0.7763 |     0.4446 |     0.7738 |     0.7752 |      95/274 | `C→G` 后出现 `A`     |  110.3s |

当前 runtime 在第 8 个 system 预测 `K:G` 后把错误 key 传到结尾。首个 system 冻结 `K:C` 没有修复这个问题，因为
`C` 本身已经不是该乐章调性。去掉 `K` 之后，后续 system 开始写出 `A`，Pitch F1 从 0.75 升到 0.93，valid measures
从 20.8% 升到 42.7%。consensus 介于两者之间：它能在 `C→G` 跳变后停止注入 `K`，但仍弱于始终不传 `K`。

Onset / duration 几乎不变。Joint 与 voice F1 始终接近（baseline 0.377 / 0.378，L/M-only 0.492 / 0.494），说明
在 header 稳定之后，joint 的剩余损失主要来自 voice 归属，而不是 pitch 或 duration。validated diagnostics 仍以
`MISSING_EVENT_TIMING`、`ROKOT_MEASURE_DURATION_MISMATCH` 和 `VOICE_DURATION_MISMATCH` 为主。

## melody-eight 结果

四个 policy 的 Draft SHA-256 完全相同，Pitch/Onset/Duration/Joint/Staff/Voice/Tie/Tuplet 均为 1，8/8 measures
valid，predicted key 均为 `C`。该 fixture 只有两个 system 且书面调性就是 C，因此不能区分 `K` 传播策略。它只证明
同一协议在合同内 single-staff development work 上没有 regress。

仓库内没有第二份 development piano grand-staff + MusicXML truth；`piano-clean` 属于 frozen holdout，OLiMPiC
full-page development works 为 vocal+piano mixed topology，均不能作为本合同内对照。

## 决策

`previous-lm-headers-v1` 是 K331 上唯一同时提升 Pitch/Joint/staff/voice/valid measures、且不损伤 onset/duration
的策略。本次不修改 runtime default：还需要另一份合同内钢琴谱复现 `K` 省略的收益，不能把 melody-eight 的满分当成
该收益的复现。完整 crops、ABC、MusicXML fragments 与 Draft 留在本地 run，不进入 Git。

结构化结果见 [`summary.json`](summary.json)。
