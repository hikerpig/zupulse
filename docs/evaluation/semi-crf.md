# Semi-CRF 当前验证

本文记录当前生产模型的可重复证据，不保留已删除 analyzer 的实验历史。

## 生产资产

- Model SHA-256:
  `6fb18d1245aea9d89f5568a9b384b405c5326cb37015cc2caa5ade8dad5f7515`
- Label inventory: 62 labels
- Maximum span: 20 basic events
- Decoder: factorized exact semi-Markov Viterbi
- Observation: adjacent note onset/offset basic events
- Training source: approved Mozart train groups 的 faithful windows

## 论文复现

BaCh fold 1 的 TypeScript 实现使用作者相同权重时，event accuracy 为 `81.17%`，segment F1 为
`73.39%`；fresh TypeScript 训练得到 event accuracy `80.82%`、segment F1 `73.20%`。四项结果均在
作者归档的 ±2pp reproduction gate 内。

Fresh fold 1 训练使用 54 首 train songs、5,107 basic events、2,801 gold segments、423 retained
features、`l2=0.125` 与 165 iterations。完整十折 fresh training 未在本次资源预算内执行。

## Current-corpus train/tune

冻结 paper label contract 对 Mozart train/tune gold 的无损映射覆盖分别为 `39.37%` 与 `39.36%`。
Faithful-window 训练与比较不读取 final holdout，在 unsupported、unaligned 与 span>20 处切断窗口。

| Metric            | Current Semi-CRF |
| ----------------- | ---------------: |
| Event accuracy    |           88.20% |
| Duration accuracy |           87.01% |
| Segment F1        |           80.19% |
| Boundary F1       |           79.77% |

## K331-3 隔离验证

`test-fixtures/musicxml/K331-3_reviewed.mxl` 是结构 fixture，准确率 gold 来自相同乐章的 DCML Mozart
v2.3 专家标注。128 个 gold 中 118 个可映射，mapping coverage 为 `92.19%`。

| Metric                         | Current Semi-CRF |
| ------------------------------ | ---------------: |
| Raw predicted-primary accuracy |           79.30% |
| Raw interval accuracy          |           71.93% |
| Gold-start boundary F1         |           83.87% |
| Tolerant interval boundary F1  |           77.42% |

默认 `decisionThreshold=0.6` 时，gold-start resolved precision 为 `90.79%`、coverage 为 `80.12%`；
duration resolved precision 为 `89.11%`、coverage 为 `71.52%`。把 unresolved 计为不正确时，
interval accuracy 为 `63.73%`。

同一 `.mxl` 输出 121 segments，其中 100 resolved、21 unresolved。

### Production performance

基线 production 入口为 `27.87 s`、最大 RSS `516,849,664 bytes`。完成 numeric weights、range
evidence、figuration prefix evidence 与 allocation reduction 后，在相同 Apple M2 Max、Node
`v22.22.1` 上对 commit `ce98a2914e7dfe70d37f51991e28711d6575a32a` 执行一次 warm-up，再用隔离
process 采集五次 production `analyzeHarmony`：

| Sample | Analysis-only |
| -----: | ------------: |
|      1 | `5,054.43 ms` |
|      2 | `4,797.78 ms` |
|      3 | `4,925.84 ms` |
|      4 | `4,913.62 ms` |
|      5 | `4,774.76 ms` |

Median 为 `4,913.62 ms`，最大 RSS 为 `484,098,048 bytes`。输入包含 1,607 pitched notes、793 basic
events、62 labels、最长 20-event span 与 971,540 segment-label potentials。五次均输出 121
segments，canonical checksum 均为
`9b0d56e25913116c1a44b460432280a681dc6dcfc2ed9812ab3c3178bb927ff0`。

Post-prefix cold profile 为 `4,887.48 ms`；最大 self-time entry
`collectPaperSemiCrfSegmentFeatures` 为 `1.093 s`（约 22%），其后为 figuration `forRange`
`0.448 s` 与 `addPrefixRange` `0.350 s`。没有单一 typed-array-ready kernel 达到 40% WASM spike
门禁。TypeScript 已满足 5 秒 required gate，即使无限加速最大 entry 也达不到 30% incremental
adoption gate，因此当前不采用 WASM。

Browser 与 Desktop 使用相同 module Worker 和协议。真实 Chromium/Electron K331 E2E 验证分析期
事件循环最大延迟不超过 50 ms、取消会终止 job 并保留已保存 Document。

## 已知边界

- Paper inventory 不完整表达 inversion、dominant 与 half-diminished families。
- Confidence 是 alternatives adapter 的拒识证据，尚未按 Semi-CRF 概率校准。
- 不得用 label pruning、beam search 或 silent fallback 掩盖性能问题。
