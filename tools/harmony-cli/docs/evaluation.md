# Harmony evaluation contract

本文只描述当前 Semi-CRF 的评测语义。

## 数据角色

- `train` 只用于拟合模型与 feature counts。
- `tune` 只用于选择已经声明的参数。
- `final` 只允许在实现、模型、阈值与指标冻结后读取，并要求显式授权。
- Split 必须按作品 group，而不是按 segment 或窗口切分。
- 外部语料不进入 Git；manifest 固定 revision、license 与 archive SHA-256。

## 指标

| 指标                         | 语义                                                 |
| ---------------------------- | ---------------------------------------------------- |
| `predictedPrimaryAccuracy`   | threshold 前 Semi-CRF primary 在 gold onset 的准确率 |
| `top1Accuracy`               | alternatives 第一名准确率，不是 primary accuracy     |
| `top8OracleRecall`           | gold 是否出现在最多八个 alternatives 中              |
| `resolvedPrecision`          | 已解析结果的准确率                                   |
| `resolvedCoverage`           | gold 中得到已解析结果的比例                          |
| `intervalOverlap.accuracy`   | 按完整 gold duration 统计的 primary 准确率           |
| `intervalOverlap.boundaries` | 容差范围内的一对一 boundary precision/recall/F1      |
| `expectedCalibrationError`   | confidence 与实际正确率的偏差                        |

完整 chord 相等要求 root、bass、kind、extension 与 degrees 一致。Unsupported gold 不进入准确率分母，
但必须进入 mapping coverage。

## Primary、alternatives 与 confidence

Semi-CRF path 决定 primary 与 boundary。Alternatives 独立生成，第一项不等于 primary 也不构成错误；
列表最多八项。Confidence 是冻结 range 上的拒识证据，不是 CRF path score。改变 threshold 只能改变
resolved/unresolved，不能改变 range 或 primary。

## Boundary

Dataset report 的 `boundaryPolicy` 固定为 `paper-basic-events`。Legal moments 来自同一输入上的 basic
event starts 与最终 event end；评测不得使用 gold 构造产品边界。

## 当前证据边界

BaCh fold 1 已完成 same-weight 与 fresh TypeScript reproduction。当前 Mozart production model 使用
faithful windows 训练，因此只覆盖 paper label inventory 可无损表达的 slice。K331-3 的专家 gold
已作为隔离验证读取，不能再次用于调参。

当前数值、模型 hash 与性能风险见
[`docs/evaluation/semi-crf.md`](../../../docs/evaluation/semi-crf.md)。
