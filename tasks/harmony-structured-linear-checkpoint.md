# Phase 8 linear Semi-CRF checkpoint

## Frozen candidate

- Records manifest SHA：`527c770067c6fa07a19491f831cd13d66380a82d3bd3a44f5ebf9ce9511d3d21`
- Groups SHA：`3e3656de00eea5ecb18482b89726d3b2dc6c5be3824b560c23e9bf5198532141`
- Model SHA：`f937f60506f72e14c4974276fa5b4a89c558c5d5601d824602a2f22d04758fa4`
- Feature/search：`semi-crf-linear-v1`、dense boundaries、`8 QN`、Top-8、exact
- Trainer：averaged structured perceptron，1 epoch，learning rate `0.10`
- Scale：rule `1.00`、model `1.00`

原计划尝试 3 epochs，但第一个完整 epoch 实测约 12 分钟、峰值约 2.6 GB。整乐章 transition cache 曾达到 3.8 GB，已否定并改为窗口 cache。Epoch 数在读取 tune 前因资源门禁冻结为 1；没有根据 tune 调整。

Train 在线诊断（30 pieces / 1,793 windows）：

- interval accuracy `0.57`
- predicted-primary `0.57`
- boundary F1 `0.41`
- segment density ratio `2.14`
- exact paths `411 / 1,793`

这些指标在作品依次更新过程中统计，只用于确认训练有效执行，不用于发布选择。

## Mozart tune sequential gate

| metric             | dense production | exact zero | linear Semi-CRF | linear − dense |
| ------------------ | ---------------: | ---------: | --------------: | -------------: |
| interval accuracy  |           0.4967 |     0.4044 |          0.4055 |        -0.0912 |
| predicted-primary  |           0.5842 |     0.4569 |          0.4383 |        -0.1460 |
| boundary F1        |           0.8250 |     0.8349 |          0.8257 |        +0.0007 |
| segments / measure |             3.73 |       4.91 |            4.50 |         +20.6% |
| alternatives Top-1 |           0.3727 |     0.4565 |          0.4319 |        +0.0592 |

Alternatives Top-1 上升不代表最终路径正确；structured final label 是 predicted-primary，后者显著下降。Linear 相对 exact-zero 只使 interval 增加约 `0.0011`，同时 primary 继续下降。

Runtime 观察：

- dense tune：约 1.7 分钟
- exact zero：约 2.3 分钟
- learned linear：约 25 分钟

Learned runtime 远超 dense `1.5x` 门禁。主要成本是对完整 dense lattice 的每个 candidate 即时构造 structured range features，不是 dot product，也不是缺少 PyTorch。

## 决定

Task 33 在 Mozart 首个 corpus 失败，按预登记顺序立即停止：

- 不运行 Beethoven、Chopin、POP909 tune。
- 不按 corpus 调 scale、epoch 或特征。
- Task 34 小型 MLP 不触发：线性候选没有稳定改善 exact rule-only，更没有满足 dense runtime/primary/density 门禁。
- 不读取 final holdout，不运行 K331 选择性诊断，不移动 production 默认或 baseline。
- 保留 strict-schema model、records、trainer 和 opt-in runtime，供后续 range-feature 增量化实验使用。
