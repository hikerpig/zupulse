# Harmony linear reranker Checkpoint D

## 冻结输入

- v3 protocol：`test-fixtures/harmony/datasets/protocol-v3.json`
- train records：Mozart 全量 train；Beethoven、Chopin 各按 group ID 取前三组。
- tune records：Mozart、Beethoven、Chopin、POP909 各按 group ID 取前三组。
- final holdout 未导出、未运行。
- v2 model SHA-256：`e9eda25b695409bf69a490b14ae65695a1124e7c312b090aaf7dd224da654169`

Tune record SHA-256：

| corpus    | records | oracle hit | oracle miss | SHA-256                                                            |
| --------- | ------: | ---------: | ----------: | ------------------------------------------------------------------ |
| Mozart    |   3,566 |      2,166 |       1,400 | `ce44e7769d0bf2c3ebd5b1a6f64dc8ac5b42af1891191e16d39875e497db1f28` |
| Beethoven |   3,793 |      2,346 |       1,447 | `2c49dc0502d4656b77a45fdddf52ab47f23d74efa0ca18bcd10a40a0ead69e15` |
| Chopin    |   1,395 |      1,017 |         378 | `3e7860eb2f11a98cef482eee7eefd3610d26a467115efe62a566b071171b16d0` |
| POP909    |   1,385 |        700 |         685 | `e7c19165cf75a4536491f7d91a9916ca4e6238f35c71998867a035e89bbc0073` |

## 线性实验结果

第一版 58 维模型遗漏 rule-primary indicator，无法表达“默认保留规则 primary”，在 train-fit 上也退化，因此作为特征契约错误否定。v2 增加这一布尔特征，其余数据、优化器和门禁不变。

以下均为 oracle-hit records 上的 duration-weighted Top-1；candidate miss 不会被模型重排掩盖。

| split / corpus  | rule primary | linear v2 |   delta |
| --------------- | -----------: | --------: | ------: |
| train aggregate |       0.6254 |    0.6505 | +0.0251 |
| tune aggregate  |       0.5982 |    0.6210 | +0.0228 |
| Beethoven tune  |       0.6537 |    0.6674 | +0.0138 |
| Chopin tune     |       0.5980 |    0.6199 | +0.0220 |
| Mozart tune     |       0.6034 |    0.6284 | +0.0249 |
| POP909 tune     |       0.4301 |    0.4727 | +0.0426 |

## Checkpoint D 结论

线性 v2 在所有 tune corpus 都改善，没有跨域回退，但 aggregate `+0.0228` 未达到预登记的 `+0.05` 发布门槛。train 与 tune 增益接近，说明主要不是 held-out 过拟合；同一组单特征权重对多种候选结构的表达能力不足，仍有稳定的非线性交互信号。

结论：**触发 Task 14 的离线小型 MLP**。MLP 使用相同 records、split、59 维输入和固定 boundary，最多两层；只有相对线性 v2 在 tune 再提升 `0.02`、且每个 corpus 不回退超过 `0.005` 才能进入 Task 15。PyTorch 不进入产品依赖，最终资产必须量化为两位小数 JSON 并由 TypeScript 等价推理。

POP909 tune 的 oracle miss 接近一半，另行保留 candidate-recall 风险；本轮 MLP 只评估 oracle-hit 排序能力，不宣称解决该问题。
