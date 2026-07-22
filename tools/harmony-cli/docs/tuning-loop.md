# Harmony 数据驱动调优循环

本流程的目标是让后续人或 agent 改善一个明确错误簇，同时不破坏已经冻结的古典与流行域。开始修改 analyzer 前，先由人工选择目标错误簇和可证伪假设；数据角色、指标和当前基线见 [`evaluation.md`](evaluation.md)。

## 数据角色

| 数据                           | 角色                               | 可进入和弦 accuracy      | 当前固定范围                      |
| ------------------------------ | ---------------------------------- | ------------------------ | --------------------------------- |
| DCML Mozart                    | 首要古典 holdout                   | 是                       | v2.3；K331 整部 eval              |
| DCML Schumann/Chopin/Beethoven | 跨作曲家 frozen eval               | 是                       | manifest 中固定子集               |
| POP909                         | 流行钢琴独立 holdout               | 是，但不与古典域合成总分 | commit `d83e6ed…` 的 4-song pilot |
| ASAP                           | MusicXML ingestion、结构和 runtime | 否                       | v1.1 的 5 首跨作曲家样本          |
| ChoCo                          | 标签映射与 progression prior 研究  | 否                       | 尚未接入 active manifest          |
| WJazzD                         | 后续爵士专项                       | 否                       | 延后                              |

POP909 adapter 从 MIDI 音符、`beat_midi.txt` 建立内部时间网格，再独立映射 `chord_midi.txt` gold；不能用 chord interval 反向构造 analyzer 边界。ASAP 报告 files/parsed/failed、notes、measures、segments 和 runtime，不输出 chord accuracy。ChoCo/WJazzD 的 label-only 记录即使未来接入，也只能经 `buildTrainLabelPrior` 从 train split 生成带版本的频率资产；tune/eval 输入会被拒绝。

## 每轮步骤

1. 用未改动代码生成目标 case 的 baseline report，并对现有 frozen baseline 执行 `compare`。
2. 从最多 50 条定位错误及 chord-family/corpus slices 中选择数量最大的单一错误簇。
3. 写下一个可证伪假设，只改变一个算法因素；不得用 eval gold 选择权重、阈值、词频或模型资产。
4. 只在 train 上拟合资产，只用 tune 选择候选。保存候选 report JSON。
5. 最后一次运行 frozen eval。目标 slice 必须改善；Mozart、已冻结 DCML corpus 与 POP909 的主指标必须通过各自 0.005 容差门禁，ECE 按越低越好检查。
6. 通过则提交 report diff 和变更说明；失败则回滚该候选，不移动 baseline。

## 命令与产物

```bash
pnpm -s harmony:cli eval test-fixtures/harmony/datasets/manifest.json \
  --data-root /path/to/harmony-data --case pop909-piano-v1 > artifacts/pop909-candidate.json

pnpm -s harmony:cli eval test-fixtures/harmony/datasets/manifest.json \
  --data-root /path/to/harmony-data --case dcml-mozart-v2.3 --split tune > artifacts/mozart-tune-candidate.json

pnpm -s harmony:cli compare \
  test-fixtures/harmony/baselines/pop909-piano-v1.json \
  artifacts/pop909-candidate.json > artifacts/pop909-diff.json
```

每轮变更说明至少记录：目标错误簇、假设、改动参数或代码、train/tune 证据、所有 frozen diff、接受或回滚结论。原始 corpus 和临时 report 留在 git 外；只提交 manifest、固定小型 baseline/diff 和说明。

## 已验证的经验

1. **先区分候选缺失、primary 选错和 boundary 错。** Mozart tune 的 Top-1 为 `0.3727`、Top-8 为 `0.7975`，当前最大机会不是继续无差别扩大模板，而是让 primary selector 从已有 Top-8 中选对。Top-8 miss 仍需按 root、kind、extension、bass 和 boundary 分开处理。
2. **学习分不能直接混入规则序列分。** 将 hybrid candidate pool 放进每个 DP range 会把运行时间从约两分钟放大到四分钟以上；固定 boundary 的二次 hybrid rerank 又使 coverage 和 interval accuracy 大幅下降。重试前必须先缓存 range features，并让候选 logits、transition 和 confidence 使用明确的独立尺度。
3. **局部 calibration 通过不等于可发布。** Mozart train-only PAVA 在 Mozart tune 和 K331 上通过，但 Schumann ECE 从 `0.0910` 回退到 `0.1560`，因此已整体回滚。未来 confidence 资产必须使用多语料 train，并对每个 frozen corpus 单独验收，不能只看合并均值。
4. **评测修复与算法提升必须分开。** Top-8 去重上限、全量错误簇、interval overlap 和跨小节 onset correctness 都先独立提交；否则无法判断提升来自模型还是指标语义变化。
5. **低 threshold 不是准确率方案。** threshold 只能在 calibration 后按预先声明的 precision floor 选择；任何 frozen corpus 超过 `0.005` 回退都应整轮拒绝，不得在看到 eval 后增加域特判。
6. **学习工具和产品运行时是两个决策。** 可以用 PyTorch 离线训练和比较模型，但第一版发布资产应优先导出为小型 JSON，由确定性 TypeScript 推理。只有小模型已经证明准确率收益、且 TypeScript 推理成为瓶颈时，才评估 ONNX/WASM；当前没有引入 PyTorch runtime 的证据。

完整失败记录见仓库根目录的 [`tasks/harmony-tuning-failures.md`](../../../tasks/harmony-tuning-failures.md)。
