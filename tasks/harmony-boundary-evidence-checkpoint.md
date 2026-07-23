# Harmony boundary evidence Task 26 checkpoint

## 冻结设置

- 选择 corpus：Mozart v2.3 tune；K331 仍为 historical regression，本轮未用于选择。
- production 对照：`dense-note-events`、MLP primary、rule confidence、threshold `0.60`。
- learned policy：固定保留 barline 与 musical beat，只分类其他 dense note-event boundary。
- feature contract：`boundary-evidence-v1`，依次为 metric strength、bass change、held-note continuity、onset pitch-class mass、before/after pitch-set change。
- 发布门禁：density 至少下降 10%；interval accuracy 与 predicted-primary 回退不超过 `0.005`；boundary recall 回退不超过 `0.01`。

## 数据与资产

原始 Mozart archive SHA-256 与 manifest 一致：`70c401e1aa48843326400992c3a61225e4425190d39d64b242a6c1d0fdc3ef87`。

| artifact                     |               records / role | SHA-256                                                            |
| ---------------------------- | ---------------------------: | ------------------------------------------------------------------ |
| `mozart-boundary-train.json` | 26,398 train；1,325 positive | `6879e88f2388e9b288b3abf915616b3c20f70ce08624c5fdd45fdc07d2370687` |
| `mozart-boundary-tune.json`  |     6,177 tune；287 positive | `ec73e97fbdfc243d1a027eb3f4e75e679317cd965053272156d016edb26a9cff` |
| `mozart-boundary.json`       |                 linear model | `80d151badd21a47f141694f31b3920da31746f0c9aeb6fc92e6af22f0bf3da0d` |
| dense tune report            |                      control | `28623e0ed7a4d2ee9919e497f13ef4c770b67acd29b52c944ba3420bd34da400` |
| learned tune report          |                    candidate | `ba2623a4d4bea14c7f6decfe263129c4e1d92543cb9691f0fa16fe23011267b2` |

线性权重为 `[0.44, 0.98, -0.75, 3.89, 1.15]`，bias `-1.89`。tune 按 recall `>= 0.99` 选择的 threshold 为 `0.19`。在 boundary records 上，tune precision `0.0653`、recall `0.9930`、F1 `0.1226`、retained rate `0.7062`。高 recall 下低 precision 表明当前瞬时 5 维特征的线性可分性不足。

## Mozart tune 端到端结果

| policy  | segments / measure | predicted primary | precision | coverage | interval accuracy | boundary recall | boundary F1 |
| ------- | -----------------: | ----------------: | --------: | -------: | ----------------: | --------------: | ----------: |
| dense   |             3.7290 |            0.5842 |    0.6057 |   0.8096 |            0.4275 |          0.8908 |      0.5836 |
| learned |             3.4854 |            0.5980 |    0.6153 |   0.7950 |            0.4249 |          0.8727 |      0.5993 |

learned policy 的 predicted primary、precision 与 boundary F1 有改善，interval 回退 `0.0026` 也在容差内；但 density 只下降 `6.5%`，且 boundary recall 回退约 `0.0180`。两项硬门禁失败，因此候选 **不发布**。按序贯协议没有运行 Beethoven、Chopin、POP909 tune，也没有读取 final holdout、移动 baseline 或修改 production 默认。

## 经验与下一方向

1. 单一时刻的 bass/onset/pitch-set 特征能提供方向，但不足以区分装饰音与真实 harmonic rhythm；提高阈值会很快损失真实边界。
2. learned lattice 初版在每个候选时刻扫描全曲音符，真实 corpus 上无法实用；改为按小节缓存后语义不变并完成评测。未来任何窗口特征都必须先设计缓存。
3. 下一次可行尝试应加入短窗口的前后 chord-candidate divergence、低音持续时长、声部同步终止/起音比例和相邻边界间距；先比较线性 residual。只有 train/tune 都显示稳定非线性交互时，才离线训练小型 MLP，产品端仍保持 JSON + TypeScript 推理，不引入 PyTorch runtime。
