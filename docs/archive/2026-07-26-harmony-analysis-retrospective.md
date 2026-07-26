# Harmony Analysis 实现复盘：从启发式管线到 Paper-compatible Semi-CRF

> 归档文档，2026-07-26。本文记录已经删除的实现、失败原因、评测教训，以及当前方案相对旧方案的
> 可验证优势。它不定义当前工程合同；当前行为仍以代码、测试、Feature Contract 和架构文档为准。

## 摘要

早期 Harmony Analysis 的效果不佳，并不能说明 Semi-CRF 不适合和声分析。真正的问题是：项目先后
构建了多套彼此叠加的规则、候选排序、固定边界分类和自定义 structured decoding，而被称为
“Semi-CRF”的实验实现并没有忠实复现论文的 observation、label inventory、feature templates、
training objective 与 decoding contract。

这种偏离带来三个直接后果：

1. boundary、candidate、primary chord 和 confidence 分别由不同模块决定，局部优化经常破坏整条
   sequence；
2. 自定义 lattice 的 gold path 可表达率、candidate recall 和分段密度不足，模型容量再高也无法恢复
   搜索空间中不存在的正确答案；
3. 评测一度混用 candidate Top-1、最终 primary、resolved precision 和 boundary 指标，局部指标改善
   容易被误判为产品质量提升。

当前方案从作者实现反推精确合同，以 basic events 为 observation，在冻结的完整 label inventory 上
运行论文特征与 exact semi-Markov Viterbi。BaCh fold 1 的同权重与 fresh training 均复现到作者结果
±2pp 内；在当前 Mozart 可无损映射窗口上，event accuracy 从旧生产基线的 `59.89%` 提升到
`88.20%`，segment F1 从 `25.16%` 提升到 `80.19%`。在隔离的 K331-3 专家标注上，raw primary
accuracy 从 `60.86%` 提升到 `79.30%`。

这是一项显著但有边界的改进：当前 paper label contract 在 Mozart train/tune 上只能无损覆盖约
`39%` 的 gold labels，完整 K331-3 推理仍约需 28 秒，confidence 也尚未成为 Semi-CRF 概率。

## 一、旧实现的演进与问题

### 1. 规则分析与启发式边界

最早的生产链路以规则候选、局部打分、边界 evidence 和后处理为核心。它可以快速形成可解释的
baseline，但 sequence decision 被拆成多个相互弱耦合的步骤：

```text
legal moments
  → boundary heuristics
  → range candidates
  → local/sequence scores
  → postprocess
  → confidence threshold
```

主要问题不是某条规则权重不够精确，而是合同本身把 boundary 与 chord identity 分开决定。一个
局部看似合理的 boundary 会改变前后两个 segment 的全部和弦证据；后处理再合并或拆分 range，又会
使先前的 candidate score 和 confidence 失去原语义。

固定拍点稀疏化验证了这一点。Mozart tune 上，metric beats、metric half-beats，以及
metric + strong simultaneous onset 都减少了边界密度，却分别让 interval accuracy 下降约
`3.53pp`、`1.01pp` 和 `0.86pp`。统一拍点网格能够删除伪边界，也会同时删除真实的拍内和声变化。

### 2. Learned candidate ranker

后续加入 bundled learned ranker，在最终 range 上扩充并重排 Top-8 candidates。这条路线带来过一些
真实收益：

- 保留 source pitch spelling 后，Mozart tune 的 root-error duration 降低 `56.4%`；
- 为 observed-bass variant 保留候选槽位后，inversion candidate miss 降低 `43.0%`；
- 修复跨小节 written moment 后，Top-8 oracle 继续提高。

这些收益证明了特征语义和候选多样性的重要性，但 Top-8 oracle 的改善不等于最终 sequence path
改善。ranker 不决定 boundary；当正确和弦不在某个 range 的候选集里，后续 selector 无论使用线性
模型还是神经网络都无法选中它。

把 learned candidate pool 直接放入每个 DP range 后，Mozart tune 超过四分钟仍未完成。原本只在
最终 segment 执行一次的 ranking，被乘上完整 range/candidate lattice。这个实验揭示：候选生成
成本必须按搜索空间规模计算，不能用单个最终 range 的延迟外推 structured decoder 的成本。

### 3. 固定边界 MLP primary selector

项目随后使用 `59 → 16 ReLU → 1` 的量化 MLP，在规则已经冻结的 range 与 Top-8 上选择 primary。
它相对线性模型的 train/tune ranking 指标确有改善，aggregate oracle-hit Top-1 增加 `9.61pp`，
TypeScript 量化推理的运行成本也很低。

但它只能回答“给定这个边界和候选集，哪个候选更好”，不能纠正错误边界或 candidate miss。更严重
的是，primary 被替换后如果沿用旧 confidence，拒识语义就不再对应最终 selector。一次固定边界
hybrid rerank 使 coverage 从 `80.96%` 降到 `53.17%`，interval accuracy 从 `36.81%` 降到
`22.87%`。

这说明 primary、confidence 与 threshold 必须针对同一个冻结 selector 联合校准；不能替换 chord
label，却假定旧 confidence 仍然有效。

### 4. 瞬时 boundary classifier

尝试过的 5 维 boundary classifier 使用 metric strength、bass change、held-note continuity、
onset pitch-class mass 和前后 pitch-set change。在 boundary recall 达到 `99.30%` 时，precision
只有 `6.53%`；端到端 density 只下降 `6.5%`，boundary recall 仍回退约 `1.8pp`。

根因是单个时刻的局部特征无法稳定区分装饰音和真正的 harmonic change。需要的是 segment 两侧的
联合和声证据，而不是给每个时间点独立打一个“像不像边界”的分数。

### 5. 自定义 structured-feature “Semi-CRF”

旧 structured experiment 是最容易产生误解的一步。它有 segment、transition、exact/beam decoding
等 Semi-CRF 外观，但其关键合同与论文实现不同：

- observation 与论文的 adjacent note onset/offset basic events 不一致；
- candidate lattice 仍受旧规则候选召回率限制；
- label inventory 和 simplification 不是论文冻结合同；
- feature firing、span 定义和 supervision window 都是项目自定义；
- 大量 structured evidence 在 dense lattice 中临时构造，训练和推理成本失控。

该版本在 Mozart tune 上相对当时 dense baseline：

| Metric                     |       变化 |
| -------------------------- | ---------: |
| Interval accuracy          |  `-9.12pp` |
| Predicted-primary accuracy | `-14.60pp` |
| Predicted segment density  |   `+20.6%` |
| Runtime                    |   约十几倍 |

它的问题是 lattice candidate miss、过分段和 feature construction 成本，而不是“线性层不够强”。
追加 MLP 或改用 PyTorch 不会让缺失的 gold path 出现在 lattice 中，也不会自动修复 observation 与
feature contract。

因此，这次失败不能作为否定论文 Semi-CRF 的证据。它验证的是一个自定义 structured pipeline，
不是对论文方法的忠实复现。

### 6. Calibration 与 threshold 调优

Mozart-only weighted PAVA 曾让 tune ECE 从 `0.2365` 降到 `0.0587`，但 Schumann ECE 从
`0.0910` 恶化到 `0.1560`。多语料 calibration 也出现 tune 改善、POP909 final 回退的情况。

Calibration 只能改变分数到概率/拒识决策的映射，不能修复 candidate miss、错误 boundary 或错误
primary。只看 aggregate ECE 还可能掩盖单个 corpus 的域回退。正确流程必须先冻结 selector，再按
预登记 precision floor 选 threshold，并要求每个冻结 corpus 单独过门禁。

## 二、工程实现上的踩坑

### 指标语义混用

早期报告中 `top1Accuracy` 有时被当作最终 chord accuracy，但它实际衡量
`alternatives[0]`。完整评测至少需要区分：

- candidate recall / Top-8 oracle；
- threshold 前 predicted-primary accuracy；
- resolved precision 与 coverage；
- interval/duration accuracy；
- boundary precision、recall、F1；
- confidence calibration。

任何一个指标都不能单独代表整条分析链路。

### Gold-onset 指标遗漏额外边界

只在 gold onset 上检查预测，可以看见该时刻的 chord 是否正确，却看不见 gold segment 中间新增的
错误边界。因此必须同时报告 interval overlap、over/under segmentation 和 tolerant boundary
metrics。

### 评测口径变化与算法变化混在一起

Top-8 去重、source spelling、written moment 修复等属于 feature/evaluation correctness；模型权重、
threshold 和 boundary policy 属于算法变化。两者混在同一提交里，会把口径修复伪装成模型收益。

### Holdout 污染

K331 和已查看过的跨语料结果一旦用于方案选择，就只能作为 regression evidence，不能继续声称是
未见 holdout。train 只拟合资产，tune 只选方案；final 必须在代码、模型、scale、calibration 和
threshold 全部冻结后同批运行。

### Cache 扩张与对象分配

旧 structured pipeline 曾出现约 `2.37 GB` 的全曲 range cache 和约 `3.8 GB` 的 transition feature
cache。训练阶段，逐 edge 保存 JavaScript feature objects 的原型超过 `4.5 GB` RSS 后 OOM。

有效的修正包括：

- 只缓存当前 end-boundary window，并及时释放不可能再成为前驱的 state；
- 将 local potential 分解为 segment 与 chord-bigram 部分；
- 使用 packed offsets 与 typed arrays，而不是数百万个 feature objects；
- 让 line search 复用与权重无关的编译结果；
- 大型 records 使用 manifest + piece shards 流式读取。

这些优化解决的是 faithful exact computation 的可执行性，不能用 beam search 或 label pruning
替代，否则算法合同会再次漂移。

### 完整整首 gold path 不是可行监督单位

当 unsupported label、unaligned boundary 或超长 span 分散在一首作品中时，要求整首 gold path
完全可表达会得到零个训练 piece。正确做法是在这些 gap 处切出连续、可表达的 faithful windows；
窗口内部仍保留完整 lattice negatives，不能把 gold candidate 注入搜索空间。

## 三、当前 Paper-compatible Semi-CRF

当前生产路径重新以论文实现为事实源：

```text
MusicXML notes
  → adjacent onset/offset basic events
  → all segments up to 20 basic events
  → frozen label inventory and paper features
  → segment score + chord bigram
  → exact semi-Markov Viterbi
  → primary chord and boundaries
```

关键约束如下：

- observation 是相邻 note onset/offset 形成的 basic events；
- maximum span 是论文合同中的 20 basic events；
- 当前 Mozart 资产使用冻结的 62-label inventory；
- model 与 chord bigram 随应用发布；
- decoder 在完整 label inventory 上运行 exact semi-Markov Viterbi；
- Semi-CRF path 独占 primary chord 与 boundary；
- alternatives adapter 只在冻结 range 上生成 Top-8 alternatives；
- confidence threshold 只能决定 resolved/unresolved，不能改写 path；
- 模型损坏明确失败，不存在另一套 analyzer 或 silent fallback。

生产模型 SHA-256：

```text
6fb18d1245aea9d89f5568a9b384b405c5326cb37015cc2caa5ade8dad5f7515
```

## 四、为什么新方案更好

### 1. 先复现论文，再讨论产品效果

BaCh fold 1 使用作者权重时：

| Metric         | Author | TypeScript |      差值 |
| -------------- | -----: | ---------: | --------: |
| Event accuracy | 80.64% |     81.17% | `+0.53pp` |
| Segment F1     | 72.85% |     73.39% | `+0.54pp` |

Fresh TypeScript training：

| Metric         | Author | Fresh TypeScript |      差值 |
| -------------- | -----: | ---------------: | --------: |
| Event accuracy | 80.64% |           80.82% | `+0.18pp` |
| Segment F1     | 72.85% |           73.20% | `+0.35pp` |

四项结果均在预设的 ±2pp reproduction gate 内。这把“论文方法是否有效”和“项目适配是否正确”拆成
两个可验证问题，避免继续在未对齐实现上调参。

### 2. Boundary 与 chord identity 联合解码

旧链路先选 boundary，再在固定 range 上选 chord；当前 decoder 对 segment 与 chord sequence 做联合
全局优化。真正的 harmonic change 可以由 segment 内外全部证据共同决定，不再依赖瞬时 boundary
classifier 或固定拍点网格。

### 3. 搜索空间与监督合同一致

旧 structured lattice 受规则候选限制，gold path 经常不可表达。当前方案用冻结 label inventory
直接构造论文搜索空间，并只在无损可表达的 faithful windows 上训练。unsupported、unaligned 和
span>20 都显式切断，而不是静默简化或注入 gold。

### 4. 当前语料上的量化改善

在 Mozart train/tune 中，paper label contract 的无损 mapping coverage 约为 `39%`。只比较这些
faithful windows，且不读取 final holdout：

| Metric                   | Current Semi-CRF | 旧生产基线 |      Delta |
| ------------------------ | ---------------: | ---------: | ---------: |
| Event accuracy           |           88.20% |     59.89% | `+28.30pp` |
| Duration accuracy        |           87.01% |     58.11% | `+28.90pp` |
| Segment F1               |           80.19% |     25.16% | `+55.03pp` |
| Boundary F1              |           79.77% |     28.42% | `+51.35pp` |
| Predicted / gold density |            1.012 |      1.751 |   `-0.739` |

结果直接支持了最初诊断：旧实现效果不佳来自对论文 observation、labels、features 和 objective 的
偏离，而不是 Semi-CRF 方法本身无效。

### 5. K331-3 隔离验证

`K331-3_reviewed.mxl` 只作为结构 fixture；准确率 gold 来自相同乐章的 DCML Mozart v2.3 专家标注。
128 个 gold 中有 118 个可映射，mapping coverage 为 `92.19%`。

| Metric                        | Current Semi-CRF | 旧规则实现 |      Delta |
| ----------------------------- | ---------------: | ---------: | ---------: |
| Raw primary accuracy          |           79.30% |     60.86% | `+18.44pp` |
| Raw interval accuracy         |           71.93% |     58.40% | `+13.52pp` |
| Gold-start boundary F1        |           83.87% |     79.05% |  `+4.82pp` |
| Tolerant interval boundary F1 |           77.42% |     41.45% | `+35.97pp` |

默认 `decisionThreshold=0.6` 时：

- gold-start resolved precision：`90.79%`，coverage：`80.12%`；
- duration resolved precision：`89.11%`，coverage：`71.52%`；
- unresolved 也计为不正确时，interval accuracy：`63.73%`；
- 输出 121 segments，其中 100 resolved、21 unresolved。

### 6. 架构语义更单一

旧实现同时存在 rules、boundary policy、ranker、MLP、structured decoder 和多种 CLI 开关，很难
回答“生产结果到底由谁决定”。当前生产入口只有一条分析路径：

```text
Semi-CRF path
  ├─ owns primary chord
  └─ owns boundary

Alternatives/confidence adapter
  ├─ may propose Top-8 alternatives
  └─ may abstain, but may not rewrite the path
```

这使 Revision 的 `algorithmVersion`、模型损坏行为、测试预期和离线评测都能够对应同一个实现。

## 五、不能被优势掩盖的限制

### Label coverage

当前 paper inventory 不完整表达 inversion、dominant 与 half-diminished families。在 Mozart
train/tune 上，无损 gold mapping coverage 只有约 `39%`。faithful-window 指标不能外推成完整语料
准确率。

### Runtime

完整 `K331-3_reviewed.mxl` 的 factorized exact Viterbi 约需 28 秒，峰值 RSS 约 595 MB，仍超过原
5 秒目标。性能优化必须保持 exact decoder 和论文 feature semantics；不能用 Top-K label pruning、
beam search 或 silent fallback 把预算问题隐藏成算法变化。

### Confidence

当前 confidence 来自冻结 range 上的 alternatives adapter，是产品拒识证据，不是 Semi-CRF path
probability。resolved precision 较高不等于概率已经校准。

### Reproduction scope

已完成 BaCh fold 1 fresh training，同权重与 fresh 指标均过门禁；没有在本次资源预算内 fresh
训练全部 10 folds。单折训练约 48.6 分钟、峰值 RSS 约 1.76 GB，十折训练线性外推超过 8 小时。

### Same-weight 并非逐路径完全一致

作者权重在 TypeScript 中的 aggregate metrics 已通过 ±2pp parity，但一首测试曲仍存在局部 path
差异，定位到 candidate-path feature multiplicity，而不是 label order、浮点精度或 Viterbi
tie-break。复现结论是指标级 faithful reproduction，不宣称逐路径 bit-identical。

## 六、今后不应重复的做法

1. 不在没有 paper parity 的自定义实现上继续堆模型容量。
2. 不把 candidate Top-1 当作最终 primary accuracy。
3. 不用 calibration 修复 candidate miss、boundary error 或 selector error。
4. 不替换 primary 后沿用旧 confidence。
5. 不用固定拍点网格冒充 harmonic-rhythm model。
6. 不把 final holdout 或已查看的 K331 用于继续调参。
7. 不把 feature correctness 修复与模型收益合并报告。
8. 不让全曲 range/transition cache 无界增长。
9. 不为数百万 sparse vectors 创建独立 JavaScript objects。
10. 不用 beam、Top-K pruning 或 silent fallback 冒充 exact decoder 的性能优化。
11. 不要求含 unsupported gaps 的整首作品形成单一可表达 gold path。
12. 不因为旧 structured experiment 失败，就推断论文 Semi-CRF 失败。

## 七、后续研究优先级

1. 在不改变 exact result 的前提下优化 range feature 编译、prefix evidence 与 allocation。
2. 扩展 label contract 前，先定义 inversion/dominant simplification 的产品语义与评测口径。
3. 将 confidence 改为与最终 Semi-CRF path 一致、可校准的拒识信号。
4. 在明确算力预算下完成 BaCh 全十折 fresh reproduction。
5. 扩大未污染的跨作曲家、跨体裁 final evaluation，逐 corpus 报告而非只看 aggregate。
