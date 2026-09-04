# Layout object-center candidate v1

本实验在 composer-isolated topology slice 上验证 OLA/CenterNet 启发的二维 object-center target。四个 heatmap channels
分别表示 1/2/3-staff systems 与 staff centers；训练复用既有 PyTorch 和 compact U-Net backbone，不新增 detector
dependency，不读取 frozen holdout，也不运行 OLiMPiC development。

## Target probe

固定二维 targets 在 512/512 train 与 128/128 validation pages 上均保持正确 component count，包括 row-energy 无法表达的
两个并排 system pages。这证明二维表示本身覆盖当前 synthetic annotation topology。

## Training probes

full-resolution head 使用 CenterNet focal loss 与 sparse prior initialization，在 10 epochs 内 validation loss 从
`3.3367` 降至 `2.8809`，但 object probabilities 普遍低于 0.1。15×15 local maximum 与全局 threshold
`0.03–0.50` 的所有组合均为 0/128 exact pages。

- checkpoint SHA-256: `1fed4c60531d61da118b141b286df078f9ca9b63ed2a82ed99b813e1abfe8aed`
- raw training summary SHA-256: `19bbb75143699501a3756f04f2068059b2560a79a37bcc3780b3ea95f5a0cda1`

为对齐常见 object detector 的 feature stride，最后一个 structural probe 把 head 移到 stride-4 decoder feature，target
缩为 128×192。模型为 23,764 parameters，10 epochs 的 validation loss 从 `2.3777` 降至 `2.1444`。7×7 local
maximum 与全局 threshold `0.03–0.30` 的最佳结果仍只有 3/128 exact pages；1-staff 类为 0 exact。大量局部 maxima
表明 compact backbone/head 没有学到稳定 instance assignment。

- checkpoint SHA-256: `2c6e73bce99e7fc9c41eadc246211e8bd5e4511ed4494c0d815662dc2b333b81`
- raw training summary SHA-256: `8a3eef2f668a94de0f534813acd5c9cc2051f64349a8ad7c8c56c26631829a9e`
- initial band checkpoint SHA-256: `03fe737f663a3381c4a26e21b083c00176e0b64fb746b3215ab0d905798aac15`
- input slice SHA-256: `452d828843d6b432cca80732bb5f668c2b3624b0677c987ccd193072d7bbc774`

## Decision

`STOP_CUSTOM_OBJECT_HEAD`

target 可表达性已通过，但从零实现的 tiny object head 缺少成熟 detector 的 pretrained representation、instance assignment
和 box regression/NMS 训练机制。继续增加 epoch、threshold 或自定义 loss 属于重新发明 detector，不符合本阶段的
奥卡姆边界。

下一步只能在新的明确批准下选择其一：

1. research-only 使用成熟、许可可接受的 pretrained object detector，并对当前 CC0 source 做 target-domain training；
2. 先按 region-based layout analysis 的建议增加少量 rights-cleared real/semi-synthetic layout data，再重开训练。

在依赖、weights license、训练预算或新增数据来源未确定前，产品 runtime 与 OLiMPiC gate 均保持 `STOP`。
