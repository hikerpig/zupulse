# Harmony MLP calibration Task 16 checkpoint（rejected）

## 冻结内容

- primary：Task 14 的 `59 → 16 ReLU → 1`、两位小数静态 JSON；生产运行时仍为纯 TypeScript，不依赖 PyTorch。
- confidence feature：MLP Top-1 softmax probability（`mlp-softmax-top-v1`）。
- calibration：按 corpus 与 group 等权的 train-only weighted PAVA（`weighted-pava-v2`）。
- calibration asset SHA-256：`ceecda20693bd62a5f5498421f7765c0f4cd1a86aded715a65f0a60a09105fd5`。
- threshold 选择规则在评估前声明为：aggregate precision 至少 `0.70`，随后最大化 coverage，同 coverage 取较低阈值；结果为 `0.46`。
- v3 final 命令同时运行冻结候选与旧 rule-only 基线，使用相同作品与 gold；rule-only 保留历史阈值 `0.60`。冻结提交为 `2f59666`，final 在该提交之后只运行一次。

## Tune calibration

| corpus    | raw ECE | calibrated ECE | threshold 0.46 precision | coverage |
| --------- | ------: | -------------: | -----------------------: | -------: |
| aggregate |  0.2291 |         0.0626 |                   0.7007 |   0.5041 |
| Beethoven |  0.2140 |         0.0446 |                   0.7122 |   0.4821 |
| Chopin    |  0.1911 |         0.0756 |                   0.7347 |   0.5843 |
| Mozart    |  0.2114 |         0.0462 |                   0.7434 |   0.5011 |
| POP909    |  0.3591 |         0.1949 |                   0.5152 |   0.4731 |

每个 tune corpus 的 ECE 都改善。precision floor 是 aggregate 选择规则；POP909 单 corpus 未达到 `0.70`，原因仍主要是 candidate recall，不能靠 calibration 修复。

## 一次性 final 结果

| corpus    | primary Top-1 | candidate precision | baseline precision | candidate coverage | baseline coverage | candidate ECE | baseline ECE |
| --------- | ------------: | ------------------: | -----------------: | -----------------: | ----------------: | ------------: | -----------: |
| Beethoven |        0.3375 |              0.7871 |             0.6078 |             0.5924 |            0.8854 |        0.0201 |       0.1757 |
| Chopin    |        0.4941 |              0.8595 |             0.6441 |             0.6407 |            0.8150 |        0.0360 |       0.1603 |
| POP909    |        0.1793 |              0.2343 |             0.2031 |             0.6119 |            0.5344 |        0.3642 |       0.3185 |

报告保存于本地 `/private/tmp/harmony-v3-final-report.json`。POP909 ECE 回退 `+0.0457`，触发逐 corpus ECE 硬门禁；本轮拒绝，不发布 calibration 或 threshold。

这里的现有 `top1Accuracy` 实际定义为 `alternatives[0]` 的 oracle accuracy，而不是最终 `predicted` primary，因此 candidate/rule baseline 的该字段相同，不能证明 MLP primary 没有效果。最终 primary 的结果应看 `resolvedPrecision`/`resolvedCoverage`；下一轮评测必须增加 threshold 前的 `predictedPrimaryAccuracy`，避免继续误读这个字段。

## 历史 regression 与回滚

- 完整 manifest 7/7 case 执行成功，ASAP ingestion 通过，benchmark 通过。
- POP909 baseline compare 通过。
- Mozart、Schumann、Chopin、Beethoven compare 均因 coverage 下降失败；Top-1、precision 与 ECE 均改善或保持，boundary 不变。
- 未移动任何 baseline。生产默认已回滚为 Task 15：MLP primary + 独立 rule confidence + threshold `0.60`。通用 PAVA、显式 calibration 注入、v3 evaluator 与失败证据保留。

## 执行命令

```bash
pnpm -s harmony:cli eval-v3-final test-fixtures/harmony/datasets/manifest.json \
  --protocol test-fixtures/harmony/datasets/protocol-v3.json \
  --data-root /tmp/harmony-data \
  --output /tmp/harmony-v3-final-report.json
```

最终报告只用于拒绝本轮，没有据此修改模型、calibration 或 threshold。
