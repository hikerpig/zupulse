# Harmony MLP reranker Task 14 checkpoint

## 训练契约

- 输入与 Task 13 线性 v2 完全相同：59 维 candidate features、相同三份 train reports、相同四份 tune reports。
- 模型：`59 → 16 ReLU → 1 logit`，固定 seed `0`，Adam、240 epochs；不改变 candidate generation、range 或 boundary。
- PyTorch `2.13.0` 只用于离线训练。产品资产为两位小数 JSON，由 TypeScript 推理。
- v3 final holdout 未导出、未运行。

## 可复现性与等价性

- 两次固定 seed 训练的原始 JSON 字节一致。
- 去除负零后的生成文件 SHA-256：`7d878bc7e7e8748ecd35a46d64fac046646468da951f1629bd59c33f3518465c`。
- Prettier 格式化后的 bundled asset SHA-256：`502290416372b39c820e2d15fab7daf0e5cca57fb0de3dfce79108bebac928be`。
- 量化权重上的 PyTorch 与 TypeScript evaluator 对全部 6,229 条 tune oracle-hit records 得到完全相同的 aggregate 和逐 corpus Top-1。
- bundled asset 大小约 10KB，schema 会拒绝错误维度和超过两位小数的权重。

## Tune 结果

以下为 oracle-hit records 上的 duration-weighted Top-1：

| corpus    | linear v2 | MLP v1 | MLP vs linear | MLP vs rule |
| --------- | --------: | -----: | ------------: | ----------: |
| aggregate |    0.6210 | 0.7171 |       +0.0961 |     +0.1189 |
| Beethoven |    0.6674 | 0.7533 |       +0.0859 |     +0.0996 |
| Chopin    |    0.6199 | 0.7144 |       +0.0945 |     +0.1164 |
| Mozart    |    0.6284 | 0.7258 |       +0.0974 |     +0.1223 |
| POP909    |    0.4727 | 0.5962 |       +0.1235 |     +0.1660 |

Task 14 的门槛是相对线性 aggregate 至少 `+0.02`，且每个 corpus 不回退超过 `0.005`。量化 MLP 全部门禁通过，接受进入 Task 15。该结论只覆盖 oracle-hit 排序；POP909 较高的 candidate-miss 仍是独立问题。

## Task 15 固定边界集成

- MLP 在规则 decode、短片段抑制、confidence decision 和 merge 全部完成后运行；之后不再执行 boundary 或 merge 操作。
- rule-only 与 MLP 分支的 range、alternatives 和 decision confidence 由单元测试锁定；MLP 只替换 resolved segment 的 `chord`。
- 模型在一次分析开始时只校验一次，所有最终 range 复用现有 feature cache。
- 5,000 notes、20 samples benchmark：rule-only P95 `858.91ms`，MLP P95 `855.98ms`，ratio `0.9966`；heap delta `139.93MB/256MB`。
- bundled MLP 已成为默认 primary selector；`primaryRerankerModel: false` 是显式 rule-only 训练/回归路径。
- 新 Analysis Revision 的 `algorithmVersion` 同时记录 frequency ranker 与 MLP 版本。

Task 15 的 `1.25x` 性能、固定 boundary、损坏资产和分数语义门禁通过。MLP logit 没有写入 Segment；当前 confidence 仍是独立规则信号，Task 16 必须在冻结 primary 后重新校准。

## 复现命令

```bash
python3 scripts/train-harmony-mlp.py /tmp/harmony-mlp.json \
  /tmp/mozart-ranking-records-v3.json \
  /tmp/beethoven-ranking-records-v3.json \
  /tmp/chopin-ranking-records-v3.json \
  --tune-report /tmp/mozart-ranking-tune-v3.json \
  --tune-report /tmp/beethoven-ranking-tune-v3.json \
  --tune-report /tmp/chopin-ranking-tune-v3.json \
  --tune-report /tmp/pop909-ranking-tune-v3.json

pnpm -s harmony:reranker evaluate-mlp /tmp/harmony-mlp.json \
  /tmp/mozart-ranking-tune-v3.json \
  /tmp/beethoven-ranking-tune-v3.json \
  /tmp/chopin-ranking-tune-v3.json \
  /tmp/pop909-ranking-tune-v3.json
```
