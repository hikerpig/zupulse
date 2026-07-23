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
7. **训练记录必须复用生产 range，不能用 gold 修正边界。** v3 exporter 已能从冻结 analyzer range 导出 Top-8、gold overlap、oracle hit/miss 和候选特征。Mozart train 有 `15,359` 条记录，其中 `8,990` 条 oracle-hit；三个 Beethoven train group 有 `5,218/3,307` 条，三个 Chopin train group 有 `1,132/840` 条。后两项只是确定性上限采样，不是语料准确率，但足以证明跨语料存在可训练的候选排序信号。
8. **数据量和可复现性要在模型复杂度之前解决。** 完整语料导出可能耗时数十分钟，任何序列化错误若在末尾才暴露会浪费整轮运行。score 在生成边界统一用十进制定点语义保留最多两位小数，完整 group-set hash 先校验，再按排序后的 group ID 做确定性上限采样；相同输入的 Chopin 导出已经验证为字节一致。
9. **旧 eval 不能因改名继续充当新 holdout。** K331、Schumann、Chopin、Beethoven 和 POP909 的既有指标已参与过选择，只能作为 historical regression。v3 已在训练前预登记 Beethoven `01`、Chopin `BI105` 和 POP909 `225` 为 final holdout；在代码、模型、calibration 和 threshold 全部冻结前不得查看其 gold 指标。
10. **最终对照必须同批运行。** v3 final evaluator 在同一冻结命令里产出 candidate 与 rule-only baseline，确保作品、映射和 gold 完全一致；查看结果后只做接受/拒绝，不再改变 feature、模型、calibration 或 threshold。
11. **候选 Top-1 不等于生产 primary。** 当前 `top1Accuracy` 使用 `alternatives[0]`，不会反映 MLP reranker 改选的 chord。Task 16 final 暴露了这一评测盲点；下一轮必须增加 threshold 前 predicted-primary accuracy，并把候选排序与最终决策指标分开命名。
12. **统一稀疏网格不是 harmonic-rhythm 模型。** Mozart tune 上 metric beats、half-beats 和“至少两个 pitch class 同步起音”都显著降低 segment density 并改善 predicted primary，但 interval accuracy 分别回退 `0.0353`、`0.0101`、`0.0086`，全部拒绝。下一步必须在 train split 学习 boundary evidence；不能因 K331 regression 单独改善就发布。
13. **模型选择要有停止条件。** 线性 reranker 达标就停止增加复杂度；若线性失败而主要错误是 oracle miss 或 boundary misalignment，也应停止 reranker 路线。只有 oracle-hit 子集上 train 与 tune 都显示稳定、跨语料的非线性剩余误差，才触发离线 MLP。
14. **Boundary gold 只能生成标签。** `boundary-evidence-v1` 的 metric strength、bass change、held-note continuity、onset pitch-class mass 和 pitch-set change 全部可由 score notes 独立计算；产品端只加载 5 权重 JSON。训练导出仍需 archive checksum 与完整 group hash，不能因为解压目录存在就绕过前置校验。

完整失败记录见仓库根目录的 [`tasks/harmony-tuning-failures.md`](../../../tasks/harmony-tuning-failures.md)。

## 下一步尝试：v3 primary reranker

下一轮按以下顺序执行，每一步都有独立退出条件：

1. **冻结线性特征契约。** 使用现有 37 个候选特征，加有限的 chord kind、extension、degree operation、归一化 rule score 和原始候选 rank；特征长度、顺序、模型 schema 和损坏资产行为由单元测试锁定。模型权重和所有持久化 score 最多两位小数。
2. **训练 corpus/group-balanced 线性基线。** 只读取 v3 train reports，仅在 oracle-hit records 上做 listwise softmax；按 corpus 和 group 等权或限额，避免 Mozart 数量支配。相同 seed 与输入必须生成字节一致的模型资产。
3. **只在 v3 tune 作选择。** 保存逐 corpus 的规则 primary 与线性 primary Top-1、oracle miss、interval/boundary 和 runtime。接受门槛为跨语料 tune Top-1 绝对提升至少 `0.05`，且每个 corpus 不下降超过 `0.005`；boundary 固定，因此 interval 与 boundary 不应变化。
4. **执行 Checkpoint D。** 线性达标则直接进入集成，不引入 PyTorch。线性未达标时，先按 oracle-hit/miss、chord family 和 feature residual 切片：若错误主要来自候选缺失或边界，停止并另立候选/边界任务；只有线性在 train 和各 corpus tune 都欠拟合、残差呈稳定交互模式时，才训练最多两层的离线 MLP。
5. **仅在必要时比较 MLP。** MLP 必须在相同 records 和 split 上相对线性再提升至少 `0.02`，每 corpus 回退不超过 `0.005`。PyTorch 只属于开发训练环境；导出两位小数 JSON 后，必须验证 PyTorch 与 TypeScript logits 在量化容差内一致。
6. **固定 boundary 接入 primary。** 模型只重排 decoder 已选 range 的 Top-8，不进入 DP、不改变 range search。rule score、model logit 和 primary confidence 保持不同字段和语义；接入后重新测 P95，预算不超过当前 analyzer 的 `1.25x`。
7. **重新校准再一次性验收（已执行并拒绝）。** primary 冻结后，多语料 PAVA 在全部 tune corpus 改善 ECE，threshold `0.46` 满足 aggregate precision floor；但一次性 v3 final 的 POP909 ECE 回退，历史 DCML coverage 也未过门禁。资产和阈值已回滚，baseline 未移动。

Task 13–16 的逐项验收清单见仓库根目录 [`tasks/plan.md`](../../../tasks/plan.md) 与 [`tasks/todo.md`](../../../tasks/todo.md)。
