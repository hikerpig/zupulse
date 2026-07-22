# Implementation Plan: Harmony Analysis 下一轮数据驱动优化

## Overview

本轮目标不是简单减少 `unresolved`，而是在不牺牲已解析结果精度的前提下，提高真实可用覆盖率。当前冻结的 DCML K331-3 pilot 指标为：Top-1 50.00%、Top-8 oracle recall 73.36%、resolved precision 46.65%、resolved coverage 73.36%、boundary F1 79.05%、ECE 27.39%。这说明 K331 同时存在候选缺失、选择错误、置信度失真和边界错误；直接降低 `decisionThreshold` 只会把更多低质量答案标成 resolved。

K331 属于强制 eval group。本计划允许用它确认目标问题和做最终验收，但禁止根据 K331 gold 反复选择权重、阈值、模板或模型资产。训练只使用 train，候选选择只使用 tune，冻结后才运行一次 K331 和其他 eval corpus。

## Evidence and current constraints

- `tools/harmony-cli/src/adapters/dcmlEvaluation.ts` 只保存按乐谱顺序遇到的前 50 条错误，没有全量错误簇计数，不能支持“选择数量最大的错误簇”。
- 当前 gold-onset anchored 评测不会完整惩罚 gold 区间中间的额外预测边界，边界调优前需要增加 interval-overlap 诊断。
- `mergeHarmonySegments` 会直接拼接相邻 segment 的 alternatives，可能超过 Top-8，导致 oracle recall 不再具有“最多八个候选”的语义。
- primary path 来自规则序列解码；展示的 alternatives 由 bundled ranker 重新排序。两者不是同一选择过程，不能用 alternatives 的第一名替代 primary precision。
- 当前 primary confidence 本质上是局部候选分差，不能表达整条解码路径的竞争程度，也没有经过 train-only calibration。
- K331 已超过历史设计中的 70% coverage 下限，但 precision、boundary F1 和 ECE 均未达到发布目标，因此本轮采用 precision-first 的验收顺序。

## Architecture decisions

1. **先修评测，再调算法。** Top-8、错误簇和区间指标不可信时，不接受任何“指标提升”。
2. **将 abstention 分成可行动类别。** 至少区分 `unresolved-oracle-top1`、`unresolved-oracle-hit`、`unresolved-oracle-miss`、`resolved-wrong` 和 `boundary-misaligned`。
3. **置信度属于 primary path。** confidence 应估计 primary 完整结构化和弦正确率，不从 UI alternatives 的排序位置推导。
4. **候选召回先于阈值调节。** gold 不在候选集时，调阈值没有意义；gold 已在候选集中时，才处理排序、序列和 calibration。
5. **每轮只改变一个算法因素。** 候选生成、主序列、confidence calibration、threshold、boundary penalty 分开评测和提交。
6. **不新增在线或 Python runtime。** 生产路径保持确定性 TypeScript；如生成静态 calibration 资产，只允许构建时使用 train split，并记录来源、hash 和版本。

## Success criteria

### 本轮接受门槛

- 修正后的 Top-8 候选始终去重且不超过 8 个。
- Mozart tune 上，目标错误簇有预先声明的改善，resolved precision 不下降超过 0.005。
- 最终 K331 eval 的 resolved coverage 至少提高 0.02，且 resolved precision 不低于修正后 baseline 0.005 以上的容差下界。
- K331 的 ECE 必须下降；不能以降低 threshold 作为唯一变化。
- K331 Top-1、Top-8、boundary F1 不得下降超过 0.005。
- Mozart 全量、Schumann、Chopin、Beethoven 和 POP909 均通过各自 frozen no-regression 门禁。
- ASAP ingestion 与运行时间门禁保持通过。

### 长期发布目标（本轮不承诺一次达到）

- Top-8 oracle recall ≥ 95%。
- resolved precision ≥ 95%，resolved coverage ≥ 70%。
- boundary F1 ≥ 85%，ECE ≤ 10%。

## Dependency graph

```text
可信 Top-8 与全量诊断
  ├─> unresolved 根因切片
  │     ├─> candidate miss -> 候选召回优化
  │     ├─> oracle hit     -> primary 排序/序列优化
  │     └─> top1 correct   -> confidence calibration/threshold
  └─> interval-overlap 诊断 -> boundary 优化

候选/序列改善
  -> train-only confidence calibration
  -> tune-only threshold 选择
  -> frozen eval 一次性验收
```

## Task list

### Phase 1: 让评测结果可用于决策

#### Task 1: 恢复严格 Top-8 语义

**Description:** 修正 segment 合并后的 alternatives：按 chord 去重、保持确定性顺序并硬截断为 8。明确 primary chord 是否包含在 alternatives 中，并让 evaluator 与产品使用相同契约。

**Acceptance criteria:**

- [ ] 任意 analyzer 输出 segment 的 alternatives 数量均不超过 8，且没有重复 chord。
- [ ] 合并前后相同输入保持确定性；测试覆盖跨小节同和弦合并。
- [ ] 生成一份“评测语义修正前/后”diff，必要时建立新的 baseline，而不是伪装成算法回退。

**Verification:**

- [ ] `pnpm vitest run packages/web-core/src/harmony`
- [ ] `pnpm --filter @zupulse/harmony-cli test`

**Dependencies:** None

**Files likely touched:**

- `packages/web-core/src/harmony/postprocess.ts`
- `packages/web-core/src/harmony/__tests__/nonChordTones.test.ts`
- `tools/harmony-cli/docs/evaluation.md`

**Estimated scope:** S

#### Task 2: 增加全量错误簇统计和 precision/coverage 曲线

**Description:** 保留最多 50 条定位样本，但新增基于全部 observations 的 category counts、duration weights、confidence bins 和 precision/coverage curve。样本改为每类有上限的确定性抽样，避免前 50 条全部来自乐谱开头。

**Acceptance criteria:**

- [ ] report 能回答每个 unresolved 类别的数量、时长占比、family 和 confidence 分布。
- [ ] report 明确区分 gold 在 alternatives 第 1、2–8、缺失三种情况。
- [ ] report schema 版本化，旧 baseline 的迁移或兼容策略明确。

**Verification:**

- [ ] `pnpm vitest run tools/harmony-cli/src/__tests__/accuracyMetrics.test.ts tools/harmony-cli/src/__tests__/dcmlEvaluation.test.ts`
- [ ] 对 Mozart tune 生成可复现 report，两次输出完全一致。

**Dependencies:** Task 1

**Files likely touched:**

- `tools/harmony-cli/src/accuracyMetrics.ts`
- `tools/harmony-cli/src/adapters/dcmlEvaluation.ts`
- `tools/harmony-cli/src/schemas.ts`
- `tools/harmony-cli/src/__tests__/accuracyMetrics.test.ts`
- `tools/harmony-cli/src/__tests__/dcmlEvaluation.test.ts`

**Estimated scope:** M

#### Task 3: 增加 interval-overlap 边界诊断

**Description:** 在保留现有 gold-onset 指标用于 baseline 连续性的同时，增加预测/gold 联合切分后的 duration-overlap confusion、带合法时间容差的 boundary F1，以及 over-segmentation/under-segmentation 计数。

**Acceptance criteria:**

- [ ] gold 区间中间的错误预测变化会计入错误时长。
- [ ] 边界容差使用“八分音符或相邻 legal moment 中较小者”，不使用 gold 边界构造 model。
- [ ] 新旧指标在 report 中名称不同，避免静默改变既有语义。

**Verification:**

- [ ] 小型人工区间 fixture 覆盖额外边界、漏边界和容差命中。
- [ ] `pnpm --filter @zupulse/harmony-cli test`

**Dependencies:** Task 2

**Files likely touched:**

- `tools/harmony-cli/src/accuracyMetrics.ts`
- `tools/harmony-cli/src/adapters/dcmlEvaluation.ts`
- `tools/harmony-cli/src/__tests__/accuracyMetrics.test.ts`
- `tools/harmony-cli/docs/evaluation.md`

**Estimated scope:** M

### Checkpoint A: 选择唯一目标错误簇

- [ ] 用未改算法、已修正评测语义生成 Mozart train/tune 报告。
- [ ] 只用 K331 当前冻结报告做问题描述，不据此选参数。
- [ ] 按全量 duration weight 选择最大的单一簇，并写出一个可证伪假设。
- [ ] 在继续前冻结 corrected baseline 和本轮接受阈值。

### Phase 2: 按根因改善候选与 primary path

#### Task 4: 修复 feature correctness，再评估候选召回

**Description:** 优先修正不需要调权重的特征语义，例如跨小节 onset 判断应使用完整 written moment；bass 证据应避免被区间内短暂最低音永久支配。每项修复独立提交和评测。

**Acceptance criteria:**

- [ ] 跨小节 onset 统计有直接单元测试。
- [ ] bass 策略只在 train/tune 证据支持时改变，且 inversion slice 不回退。
- [ ] 每次只启用一个 feature 修复并保存候选 report。

**Verification:**

- [ ] `pnpm vitest run packages/web-core/src/harmony/__tests__/features.test.ts`
- [ ] Mozart tune 的目标 facet/slice 改善，其他主指标通过门禁。

**Dependencies:** Checkpoint A

**Files likely touched:**

- `packages/web-core/src/harmony/features.ts`
- `packages/web-core/src/harmony/__tests__/features.test.ts`
- `tools/harmony-cli/src/adapters/dcmlEvaluation.ts`

**Estimated scope:** S–M（每个 feature 单独一轮）

#### Task 5: 若 oracle miss 最大，增加候选多样性

**Description:** 仅在 `unresolved-oracle-miss` 或整体 oracle miss 为最大簇时执行。比较 root、family、extension、inversion 的缺失分布，再调整模板证据或 Top-8 槽位分配；禁止仅扩大 Top-K。

**Acceptance criteria:**

- [ ] Mozart tune 目标 family 的 Top-8 oracle recall 有预先声明的提升。
- [ ] alternatives 仍最多 8 个，runtime 与内存预算不回退。
- [ ] primary path 未因 alternatives-only 变化而被静默改变。

**Verification:**

- [ ] `pnpm vitest run packages/web-core/src/harmony/__tests__/candidates.test.ts packages/web-core/src/harmony/__tests__/extendedChords.test.ts`
- [ ] `pnpm harmony:benchmark`

**Dependencies:** Task 4；仅由 Checkpoint A 的簇分类触发

**Files likely touched:**

- `packages/web-core/src/harmony/candidates.ts`
- `packages/web-core/src/harmony/__tests__/candidates.test.ts`
- `packages/web-core/src/harmony/learnedRanker.ts`

**Estimated scope:** M

#### Task 6: 若 oracle hit 但 primary 错，改善序列选择

**Description:** 仅在 gold 已进入候选但 primary 选择错误为最大簇时执行。先比较局部分数、transition 和整条 path margin；一次只调整一个因素，例如持续性 prior、边界变化成本或 bass/inversion 证据。

**Acceptance criteria:**

- [ ] Mozart tune 的 Top-1 或 resolved precision 明确改善。
- [ ] boundary overlap 指标不回退，不能靠吞并短和弦提高 precision。
- [ ] beam width、max span 和 runtime 上限保持不变，除非有独立性能证据。

**Verification:**

- [ ] `pnpm vitest run packages/web-core/src/harmony/__tests__/decode.test.ts packages/web-core/src/harmony/__tests__/transitions.test.ts packages/web-core/src/harmony/__tests__/analyzeRules.test.ts`
- [ ] `pnpm harmony:benchmark`

**Dependencies:** Task 4；仅由 Checkpoint A 的簇分类触发

**Files likely touched:**

- `packages/web-core/src/harmony/decode.ts`
- `packages/web-core/src/harmony/transitions.ts`
- `packages/web-core/src/harmony/analyzeRules.ts`
- 相邻 `__tests__`

**Estimated scope:** M

### Checkpoint B: 冻结候选/序列算法

- [ ] 只保留在 Mozart tune 上通过门禁的单因素改动。
- [ ] Schumann、Chopin、Beethoven、POP909 暂不运行 eval 选择候选；只在最终冻结后运行。
- [ ] 记录所有失败假设，避免下一轮重复尝试。

### Phase 3: 重建 primary confidence 与拒识策略

#### Task 7: 定义 primary-path confidence features

**Description:** confidence 改为描述最终 primary，而不是 alternatives 的排序。首批特征保持小而可解释：选中候选的 normalized local margin、最佳路径与次佳路径 margin、support/conflict ratio、bass stability、segment duration 和 boundary evidence。

**Acceptance criteria:**

- [ ] 相同输入得到确定性的 raw confidence features。
- [ ] primary 不是局部第一名时，margin 仍有定义且不会错误地产生高置信度。
- [ ] 诊断信息不进入持久化 Harmony Analysis Document。

**Verification:**

- [ ] 新增 confidence feature 单元测试。
- [ ] Mozart train/tune report 能输出 feature 与 correctness 的分箱关系。

**Dependencies:** Checkpoint B

**Files likely touched:**

- `packages/web-core/src/harmony/decode.ts`
- `packages/web-core/src/harmony/analyzeRules.ts`
- `packages/web-core/src/harmony/confidence.ts`（仅在逻辑足够独立时新增）
- 相邻 `__tests__`

**Estimated scope:** M

#### Task 8: 用 train-only 数据拟合单调 calibration

**Description:** 在 Mozart train 上拟合版本化的单调 calibration（优先 isotonic/PAVA 或小型分箱模型），用 tune 比较候选 calibration。K331 及任何 eval group 不得进入资产生成。

**Acceptance criteria:**

- [ ] 训练命令拒绝 tune/eval records，并记录 training groups hash、corpus revision、feature version。
- [ ] calibration 输出单调、范围为 `[0,1]`，空 bin 有确定性回退。
- [ ] Mozart tune ECE 明显下降，precision/coverage curve 不恶化。
- [ ] 发布静态资产前完成 DCML 许可与派生资产边界检查。

**Verification:**

- [ ] calibration 训练与 schema 测试通过。
- [ ] 相同 train 输入重复生成字节一致的资产。

**Dependencies:** Task 7

**Files likely touched:**

- `scripts/` 下的 calibration 生成脚本
- `packages/web-core/src/harmony/` 下的静态 calibration loader/asset
- `tools/harmony-cli/src/evaluationProtocol.ts`
- 相邻测试与文档

**Estimated scope:** M

#### Task 9: 只在 tune 上选择 decision threshold

**Description:** 从固定 precision/coverage curve 中按预先声明的规则选择阈值：先满足 precision floor，再最大化 coverage。禁止以 K331 unresolved 数量直接选择 threshold。

**Acceptance criteria:**

- [ ] threshold 选择规则在运行前写入文档并自动化。
- [ ] Mozart tune resolved precision 不低于 corrected baseline，coverage 至少提升 0.02；达不到则不改 threshold。
- [ ] 阈值与 calibration asset/algorithmVersion 一起版本化。

**Verification:**

- [ ] threshold selector 单元测试覆盖并列、无可行阈值和空输入。
- [ ] 保存 Mozart tune candidate report，不运行 K331。

**Dependencies:** Task 8

**Files likely touched:**

- `tools/harmony-cli/src/` 下的 tune report/selector
- `packages/web-core/src/harmony/analyzeRules.ts`
- `packages/web-core/src/harmony/__tests__/confidence.test.ts`

**Estimated scope:** S–M

### Checkpoint C: 冻结候选

- [ ] 固定代码、资产 hash、threshold、algorithmVersion 和所有 tune reports。
- [ ] 在运行 eval 前确认没有任何基于 K331 gold 的未记录选择。
- [ ] 明确失败标准：任一 frozen corpus 超过 0.005 回退即整轮拒绝，不局部移动 baseline。

### Phase 4: 一次性 frozen eval 与交付

#### Task 10: 运行完整 no-regression 与一次性 K331 验收

**Description:** 对冻结候选依次运行 K331、Mozart 全量、跨 DCML corpus、POP909、ASAP 和性能门禁。保存 report/diff；只根据预先写下的门槛接受或回滚，不再继续调参。

**Acceptance criteria:**

- [ ] K331 coverage、precision、Top-1、Top-8、boundary 和 ECE 满足本计划门槛。
- [ ] 所有 frozen baseline compare 通过 0.005 容差。
- [ ] 失败时回滚候选，不更新 baseline；成功时提交小型 report diff 和变更说明。

**Verification:**

- [ ] `pnpm verify:fast`
- [ ] `pnpm --filter @zupulse/harmony-cli test`
- [ ] 所有 `harmony:cli eval` 与 `compare` 命令记录在变更说明中。
- [ ] `pnpm harmony:benchmark`

**Dependencies:** Checkpoint C

**Files likely touched:**

- `test-fixtures/harmony/baselines/*.json`（仅在评测语义有意升级或候选被正式接受时）
- `tools/harmony-cli/docs/evaluation.md`
- `tools/harmony-cli/docs/tuning-loop.md`
- 小型 report diff/变更说明

**Estimated scope:** M

## Risks and mitigations

| Risk                            | Impact               | Mitigation                                                     |
| ------------------------------- | -------------------- | -------------------------------------------------------------- |
| 反复查看 K331 形成 eval leakage | 指标失去泛化意义     | K331 只在 Checkpoint C 后运行一次；所有选择证据来自 train/tune |
| 降阈值制造“覆盖率改善”          | 错误 resolved 增多   | precision-first 门槛；threshold 必须在 calibration 后单独评估  |
| Top-8 合并泄漏导致虚高          | 错判候选召回         | Phase 1 先去重、截断并重建 corrected baseline                  |
| gold-onset 指标掩盖额外边界     | 序列看似改善实际更碎 | 增加 interval-overlap 与 over-segmentation 诊断                |
| 多因素同时修改                  | 无法归因、难以回滚   | 一轮一因素，每轮保存 report 和结论                             |
| 古典域优化伤害 POP909           | 产品域外退化         | 最终候选必须通过独立 POP909 frozen gate                        |
| 训练资产许可不清晰              | 无法随产品发布       | 生成前审查许可；必要时只保留无语料资产的规则 confidence        |

## Open questions

- 当前详细 K331 report 和外部 DCML `data-root` 不在工作区中；执行阶段需要重新提供本地路径或重新生成 report。
- corrected Top-8 baseline 很可能低于现有 oracle recall；这是评测语义修复，应单独评审后再开始算法优化。
- 若 Mozart tune 的最大错误簇不是 unresolved，而是 resolved-wrong，本轮应优先提升 precision，不应强行追求减少 unresolved。

---

# 下一轮计划：跨语料 Primary Candidate Reranker

## 目标与边界

下一轮只解决“正确和弦已在 Top-8、但 primary 选错”的问题。Mozart tune 当前 Top-1 `0.3727`、Top-8 `0.7975`，约 42 个百分点的差距证明这一目标优先于继续扩张模板。boundary、candidate generation、confidence 和 threshold 在本轮保持冻结，避免再次混合多个因素。

PyTorch 只作为可选的离线训练工具，不进入 Browser、Electron 或 CLI 运行时。先建立无需新依赖的线性 reranker 基线；只有小型 MLP 明确超过线性基线时，才导出两位小数权重并用 TypeScript 推理。当前静态 ranker 继续只服务 alternatives，直到新模型通过完整门禁。

K331 和本轮已经查看过指标的 Schumann、Chopin、Beethoven、POP909 case 只能作为历史回归集，不能再作为无污染的泛化声明。开始训练前必须先用确定性 group hash 登记新的最终 holdout，之后不得查看其 gold 指标直至冻结。

## 成功标准

- 新 holdout 在训练前登记并保持作品级隔离；train/tune/eval group hash 和 corpus revision 全部写入资产。
- 固定 rule boundary 下，跨语料 tune Top-1 至少绝对提升 `0.05`；Top-8、interval overlap 和 boundary 指标不得下降超过 `0.005`。
- 每个 tune corpus 的 Top-1 不下降超过 `0.005`，不能用 Mozart 的收益覆盖其他风格回退。
- 推理 P95 不超过当前 analyzer 的 `1.25x`，资产损坏明确失败。
- frozen eval 任一 corpus 的主指标或 ECE 回退超过 `0.005`，整轮拒绝且不移动 baseline。

## 依赖顺序

```text
新 holdout + 当前生产 baseline
  → 固定 range 的 ranking records
  → 线性 reranker baseline
  → 可选 PyTorch 小型 MLP
  → TypeScript 等价推理
  → sequence integration（仍保持 boundary 冻结）
  → 独立 calibration
  → 一次 frozen eval
```

## Task 11：建立未污染的 v3 评测协议

**Description:** 在读取新 gold 指标前，用现有 deterministic split 函数登记新的作品级 holdout；保留 K331 和当前 baseline 作为 regression，不再将它们用于选择或新的泛化声明。

**Acceptance criteria:**

- [ ] manifest 明确区分 regression cases 和未查看的 v3 final holdout。
- [ ] 每个 accuracy corpus 都有 train/tune/eval group，且同一作品不跨 split。
- [ ] 生成并提交 group ID hash、corpus revision 和协议说明，但不提交原始 corpus。

**Verification:**

- [ ] `pnpm vitest run tools/harmony-cli/src/__tests__/evaluationProtocol.test.ts`
- [ ] split 重复生成字节一致。

**Dependencies:** None

**Files likely touched:**

- `test-fixtures/harmony/datasets/manifest.json`
- `tools/harmony-cli/src/evaluationProtocol.ts`
- `tools/harmony-cli/docs/evaluation.md`

**Estimated scope:** S–M

## Task 12：导出固定范围的候选排序训练记录

**Description:** 从当前生产 analyzer 的冻结 range 和 Top-8 导出 train-only ranking records，记录候选特征、gold candidate index、duration weight 和 candidate miss；不得用 gold boundary 构造产品输入。

**Acceptance criteria:**

- [ ] records 区分 `oracle-hit` 与 `oracle-miss`，reranker 只在 hit records 上训练。
- [ ] 导出器拒绝 tune/eval，且记录 source/group/feature hash。
- [ ] 相同输入重复导出字节一致，所有数字最多两位小数。

**Verification:**

- [ ] 新增 train-only、hash 和 deterministic serialization 测试。
- [ ] Mozart 与至少两个非 Mozart train corpus 能生成 records。

**Dependencies:** Task 11

**Files likely touched:**

- `tools/harmony-cli/src/` 下的 ranking-record exporter
- `tools/harmony-cli/src/schemas.ts`
- 相邻 `__tests__`

**Estimated scope:** M

## Task 13：训练无新运行依赖的线性 reranker

**Description:** 先用 pairwise logistic 或 listwise softmax 建立最小基线，输入复用现有 candidate features，并按 corpus/group 做等权或上限采样，避免 Mozart 数量支配模型。

**Acceptance criteria:**

- [ ] 训练只读取 Task 12 records，模型包含训练 group hash 和算法版本。
- [ ] 跨语料 tune Top-1 比当前规则 primary 至少提升 `0.05`，每个 corpus 不回退超过 `0.005`。
- [ ] 固定 boundary 下 interval 与 boundary 指标保持不变，推理预算通过。

**Verification:**

- [ ] 模型训练、schema、损坏资产和 TypeScript score 等价测试通过。
- [ ] 保存逐 corpus tune report，不运行 v3 final holdout。

**Dependencies:** Task 12

**Files likely touched:**

- `scripts/` 下的线性训练脚本
- `packages/web-core/src/harmony/` 下的候选 reranker 与静态资产
- 相邻测试

**Estimated scope:** M

## Checkpoint D：决定是否需要 PyTorch

- [ ] 若线性模型达到成功标准，优先发布线性方案，不增加 PyTorch。
- [ ] 若线性模型未达标，但 train/tune loss 和错误切片显示明显非线性剩余信号，才执行 Task 14。
- [ ] 若 candidate miss 或 boundary error 才是剩余主因，停止 reranker 路线并重新立项，不用更大模型掩盖输入问题。

## Task 14：可选的离线 PyTorch 小型 MLP

**Description:** 仅在 Checkpoint D 触发时，用同一 records 训练最多两层的小型 MLP；不引入时序 Transformer，不改变候选和 boundary。训练完成后导出量化到两位小数的 JSON 权重。

**Acceptance criteria:**

- [ ] MLP 相对 Task 13 线性模型的跨语料 tune Top-1 再提升至少 `0.02`。
- [ ] 每个 corpus 无超过 `0.005` 的回退，模型体积和 P95 满足预算。
- [ ] Python/PyTorch 仅存在于开发训练环境，生产依赖树不包含 Torch。

**Verification:**

- [ ] 固定 seed 重复训练的导出资产和指标在声明容差内一致。
- [ ] PyTorch logits 与 TypeScript 推理在量化容差内一致。

**Dependencies:** Checkpoint D

**Files likely touched:**

- `scripts/` 下的可选训练脚本
- `packages/web-core/src/harmony/` 下的静态 MLP inference
- 相邻测试和许可说明

**Estimated scope:** M

## Task 15：在冻结 boundary 上接入 primary reranker

**Description:** reranker 只重排当前 decoder 已选 range 的 Top-8，并以独立、可解释的 logits 选择 primary；不重新运行 range search，不把模型分直接混入旧 rule sequence score。

**Acceptance criteria:**

- [ ] feature cache 每个 range 只计算一次，运行时间不超过 `1.25x`。
- [ ] primary、alternatives 和 confidence 的分数语义分离，低置信度不会因换 primary 被误拒识。
- [ ] 通过跨语料 tune 门禁后才允许默认启用。

**Verification:**

- [ ] unit test 覆盖规则第一名与模型第一名不同、并列和损坏资产。
- [ ] `pnpm harmony:benchmark`

**Dependencies:** Task 13 或 Task 14

**Files likely touched:**

- `packages/web-core/src/harmony/analyzeRules.ts`
- `packages/web-core/src/harmony/` 下的 reranker
- 相邻测试

**Estimated scope:** M

## Task 16：重新校准并执行一次 v3 frozen eval

**Description:** primary 冻结后再用多语料 train 拟合 confidence calibration，只在 tune 选择 threshold；最后一次运行预登记的 v3 holdout，并将历史 cases 仅作为 regression compare。

**Acceptance criteria:**

- [ ] calibration 在每个 tune corpus 改善或保持 ECE，而非只改善加权总分。
- [ ] threshold 满足 precision floor 后最大化 coverage，规则在查看结果前冻结。
- [ ] v3 holdout、历史 regression、ASAP 和 benchmark 全部门禁通过，否则整轮回滚。

**Verification:**

- [ ] `pnpm verify:fast`
- [ ] `pnpm --filter @zupulse/harmony-cli test`
- [ ] `pnpm harmony:benchmark`
- [ ] 保存全部 compare 结果和接受/拒绝说明。

**Dependencies:** Task 15

**Files likely touched:**

- `tools/harmony-cli/src/confidenceCalibration.ts`
- `tools/harmony-cli/docs/tuning-loop.md`
- `test-fixtures/harmony/baselines/*.json`（仅全部通过后）

**Estimated scope:** M

## 下一轮风险

| Risk                         | Impact                   | Mitigation                                        |
| ---------------------------- | ------------------------ | ------------------------------------------------- |
| 已查看的 eval 被继续用于选择 | 泛化结论失真             | 预登记 v3 holdout；旧 cases 降级为 regression     |
| 单一作曲家支配训练           | 跨风格 ECE/Top-1 回退    | corpus-balanced sampling；逐 corpus tune gate     |
| 模型改善局部排序却破坏时长   | 产品结果更碎或更短       | 本轮冻结 boundary；单独检查 interval overlap      |
| PyTorch 进入产品依赖         | 包体、兼容与部署成本上升 | 只离线训练；导出 JSON + TypeScript inference      |
| DCML 派生资产许可不清楚      | 无法发布模型             | 训练前审查每个 corpus 许可并在资产写入 provenance |
