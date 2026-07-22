# Harmony MLP calibration Task 16 pre-final checkpoint

## 冻结内容

- primary：Task 14 的 `59 → 16 ReLU → 1`、两位小数静态 JSON；生产运行时仍为纯 TypeScript，不依赖 PyTorch。
- confidence feature：MLP Top-1 softmax probability（`mlp-softmax-top-v1`）。
- calibration：按 corpus 与 group 等权的 train-only weighted PAVA（`weighted-pava-v2`）。
- calibration asset SHA-256：`ceecda20693bd62a5f5498421f7765c0f4cd1a86aded715a65f0a60a09105fd5`。
- threshold 选择规则在评估前声明为：aggregate precision 至少 `0.70`，随后最大化 coverage，同 coverage 取较低阈值；结果为 `0.46`。
- v3 final 命令同时运行冻结候选与旧 rule-only 基线，使用相同作品与 gold；rule-only 保留历史阈值 `0.60`。本 checkpoint 提交前未运行 final holdout。

## Tune calibration

| corpus    | raw ECE | calibrated ECE | threshold 0.46 precision | coverage |
| --------- | ------: | -------------: | -----------------------: | -------: |
| aggregate |  0.2291 |         0.0626 |                   0.7007 |   0.5041 |
| Beethoven |  0.2140 |         0.0446 |                   0.7122 |   0.4821 |
| Chopin    |  0.1911 |         0.0756 |                   0.7347 |   0.5843 |
| Mozart    |  0.2114 |         0.0462 |                   0.7434 |   0.5011 |
| POP909    |  0.3591 |         0.1949 |                   0.5152 |   0.4731 |

每个 tune corpus 的 ECE 都改善。precision floor 是 aggregate 选择规则；POP909 单 corpus 未达到 `0.70`，原因仍主要是 candidate recall，不能靠 calibration 修复。

## 冻结后的最终命令

```bash
pnpm -s harmony:cli eval-v3-final test-fixtures/harmony/datasets/manifest.json \
  --protocol test-fixtures/harmony/datasets/protocol-v3.json \
  --data-root /tmp/harmony-data \
  --output /tmp/harmony-v3-final-report.json
```

最终报告运行后只允许接受或拒绝本轮，不再修改模型、calibration 或 threshold。
