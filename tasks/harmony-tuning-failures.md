# Harmony analysis 调优踩坑记录

本文只保留可复用的失败模式、已验证结论和重试前置条件。当前协议、指标定义与
冻结基线以 [`evaluation.md`](../tools/harmony-cli/docs/evaluation.md) 为准；实现细节以
runtime schema、测试和代码为准。临时报告、阶段 checklist、资产路径与提交流水账不在
这里长期维护。

## 评测与实验纪律

### 候选 Top-1 不等于最终 primary

- **现象：** `top1Accuracy` 曾被误读为最终 chord 的准确率，但它衡量的是
  `alternatives[0]`；MLP 或 structured decoder 选择的最终 chord 应看
  `predictedPrimaryAccuracy`。
- **教训：** candidate recall/ranking、primary selection、confidence/abstention 和
  boundary 必须使用不同指标，不能用一个 Top-1 代替整条决策链。
- **约束：** 每次报告必须同时保留 threshold 前 primary、resolved
  precision/coverage、Top-8 oracle、interval accuracy、boundary F1 和 ECE。

### 评测语义修正不能伪装成算法提升

- alternatives 合并后必须去重且硬限制 Top-8。
- gold-onset 指标不能发现区间中间的额外预测边界，因此必须同时看 interval-overlap、
  over/under segmentation 和 tolerant boundary。
- source spelling、跨小节 written moment 等 feature correctness 修复应单独提交并重新
  冻结 corrected baseline，不能与权重、阈值或模板调整混在同一轮。

### 已查看的 eval 不能再次充当 holdout

- K331 及已用于选择的跨语料结果只能作为 historical regression。
- train 只拟合资产，tune 只选择候选；final 必须在代码、模型、scale、calibration 和
  threshold 全部冻结后同批运行 candidate 与 baseline。
- final 结果只允许接受或拒绝，不能据此增加 corpus 特判或继续调参。

## 候选、primary 与 confidence

### source spelling 与候选槽位是有效改进

- 保留 source pitch spelling 后，Mozart tune 的 root-error duration 降低 `56.4%`，
  Top-8 从 `0.4444` 提升到 `0.6811`。
- 优先保留 observed-bass variant，并在 Top-8 中为它保留同 base chord 的槽位后，
  inversion candidate-miss 降低 `43.0%`，Top-8 从 `0.6913` 提升到 `0.7672`。
- 跨小节 onset 使用完整 written moment 后，Top-8 从 `0.7672` 提升到 `0.7975`。
- **教训：** 先修特征语义和 Top-K 多样性，再扩大词表或增加模型复杂度。

### learned candidate pool 不能直接放进每个 DP range

- **现象：** 将 nearest-prototype/hybrid Top-8 放进所有 legal range，Mozart tune
  运行超过四分钟仍未完成，而冻结候选约需 90–120 秒。
- **根因：** 原本只在最终 segment 执行的 ranking 被乘上整个 range/candidate 搜索空间。
- **结论：** 已回滚。没有 range-level feature/ranker cache 或固定边界二次通路前不得
  重试；准确率实验必须先过 runtime 门禁。

### 固定边界二次 hybrid rerank 也不是安全捷径

- **结果：** coverage `0.8096 → 0.5317`，interval accuracy
  `0.3681 → 0.2287`，precision 也略降。
- **根因：** learned-local confidence 不能表达 sequence-selected primary；替换 chord
  后沿用旧 confidence/threshold 会大量误拒识。
- **结论：** primary、confidence 和 threshold 必须按冻结后的最终 selector 重新校准，
  不能只替换 chord label。

### calibration 不能修复 candidate miss

- Mozart-only weighted PAVA 曾使 tune ECE `0.2365 → 0.0587`，但 Schumann ECE
  `0.0910 → 0.1560`，因此整体回滚。
- 多语料 MLP calibration 在 tune 上改善，但一次性 final 的 POP909 ECE 比 baseline
  回退 `0.0457`，历史 DCML coverage 也未过门禁，因此仍拒绝发布。
- **教训：** threshold 只能在 calibration 后按预登记 precision floor 选择；每个 frozen
  corpus 都必须单独过门禁，不能用 aggregate 掩盖域回退。candidate miss 高的语料不能
  靠校准补救。

### 线性 reranker 必须能表达 identity policy

- 第一版 58 维模型遗漏 rule-primary indicator，train-fit Top-1
  `0.6254 → 0.5485`，属于 feature contract 错误而非有效模型对照。
- 加入 indicator 后，线性模型在所有 tune corpus 同向改善，aggregate `+0.0228`，但未达
  `+0.05` 发布门槛。
- 同 records 上的 `59 → 16 ReLU → 1` 小型 MLP 相对线性提升 `+0.0961`，证明该固定边界
  ranking 问题存在稳定非线性交互。PyTorch 只用于离线训练；产品只加载两位小数 JSON，
  TypeScript 与量化模型推理等价。
- **教训：** learned selector 必须包含“保持现状”的可表达路径。只有线性在 train/tune
  稳定欠拟合且 residual 指向特征交互时，才值得引入离线 MLP。

## Boundary 与 harmonic rhythm

### 固定拍点稀疏化会同时删除伪边界和真实边界

Mozart tune 上：

| policy                             | density 变化 | interval accuracy 变化 | 结论 |
| ---------------------------------- | -----------: | ---------------------: | ---- |
| metric beats                       |     明显下降 |              `-0.0353` | 拒绝 |
| metric half-beats                  |     明显下降 |              `-0.0101` | 拒绝 |
| metric + strong simultaneous onset |     `-24.2%` |              `-0.0086` | 拒绝 |

K331 单独更偏好 metric beats，但它已是 regression，不能推翻 Mozart tune 门禁。统一网格
不是 harmonic-rhythm 模型，拍内和声变化必须由 score evidence 保留。

### 瞬时线性 boundary evidence 不够

- 5 维模型使用 metric strength、bass change、held-note continuity、onset pitch-class
  mass 和 before/after pitch-set change。
- 在 boundary records 上，为达到 recall `0.9930`，precision 只有 `0.0653`。
- 端到端 density 只下降 `6.5%`，boundary recall 回退约 `0.0180`，两项硬门禁失败。
- **根因：** 单一时刻特征无法稳定区分装饰音与真实 harmonic change。
- **重试前置条件：** 使用可缓存的短窗口证据，例如前后 chord-candidate divergence、
  bass duration、voice/staff 同步终止与起音、相邻边界间距；gold 只能生成 label，不能
  构造产品边界。

## Semi-CRF / structured decoding

### span 必须按音乐时值定义

- boundary-count `maxSpan=16` 在装饰密集织体上不稳定，Mozart train/tune span
  representability 只有 `0.9853/0.9836`。
- 仅依据 train 冻结 `maxQuarterNotes=8` 后提升到 `0.9984/0.9931`，candidate oracle
  为 `0.8104/0.8329`。
- **结论：** span/search contract 使用 quarter-note duration，不能用 dense event 数量
  近似。

### cache 生命周期比 cache 命中率更重要

- 全曲 range cache 曾达到约 `2.37 GB` RSS；整乐章 transition feature cache 又达到约
  `3.8 GB` RSS。
- 按 end-boundary window 缓存并及时释放不再可能成为前驱的 state 后，同合同 exact
  search P95 是 beam 的 `0.68x`，RSS `423.61 MB` 对 `965.84 MB`。
- learned scorer 仍很慢，因为它为 dense lattice 的每个 candidate 构造完整 structured
  evidence；瓶颈不在 dot product，更不在 TypeScript 是否换成 PyTorch。
- **重试前置条件：** 先实现 prefix/incremental range evidence cache，并测量 feature
  construction 与 candidate proposal 的独立成本。

### 大型 structured records 必须分片和流式处理

- 单个全语料 JSON 对象在约 4 GB V8 heap 上 OOM。
- manifest + piece shards、逐 piece hash/count 校验和 streaming loader 可完成约
  `0.94 GB` Mozart train records。
- 训练时必须 piece-balanced；否则 candidate miss 少、窗口多的作品会被过度采样。
- **结论：** 不再尝试 monolithic object，也不在内存中同时保留全部 records。

### 完整整首 gold path 不是可用监督单位

- Top-8 candidate miss 分散在每首作品中，要求整首 gold path 完全可表达会得到零个训练
  piece。
- 正确做法是由 miss/unsupported gap 切出连续可表达 gold 子路径；子路径内部仍保留完整
  lattice negatives，不能注入 gold candidate 或用 gold 删除 range。

### 当前 linear Semi-CRF 已被否定

- Mozart tune 相对 dense：interval `-0.0912`、predicted-primary `-0.1460`、
  segment density `+20.6%`；boundary F1 仅持平，runtime 约为 dense 的十几倍。
- 按序贯协议在首个 corpus 停止，没有运行 Beethoven/Chopin/POP909 tune、MLP、final
  holdout 或 K331 选择，也没有改变 production 默认。
- **结论：** 当前问题是 lattice candidate miss、过分段和 feature construction 成本；
  追加 PyTorch/MLP 不能解决这些结构问题。

## 何时再考虑 PyTorch

当前不需要 PyTorch 产品 runtime。只有同时满足以下条件，才值得用 PyTorch 做一次离线
小模型比较：

1. candidate/path oracle 已足够高，主要错误不再是 lattice miss；
2. prefix/incremental cache 已把 learned exact runtime 拉回预算；
3. 线性模型在 train 与至少一个未污染 tune corpus 稳定优于 rule-only；
4. residual 明确来自非线性交互，而不是 boundary 或 density；
5. 量化 JSON 可由 TypeScript 等价推理，PyTorch 不进入产品依赖。

在此之前，更高价值的方向依次是：优化 range evidence cache、改善 Top-8 root/inversion
proposal、加入显式 segment-count/boundary loss。
