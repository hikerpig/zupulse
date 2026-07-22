# Harmony module

`src/harmony/` 是 Harmony Analysis Studio 的纯领域模块：接收已经投影的乐谱、音符和 MusicXML 数据，生成结构化和声分析，并处理来源和弦、用户修正、持久化与导出。它不依赖 React、Browser、Electron、IndexedDB 或在线服务。

外部 workspace 应从 `@zupulse/web-core` 公共入口使用这些能力，不要深导入 `src/harmony/`。

## 核心流程

```text
乐谱与选中轨道
  → analysisInput：校验并建立稳定的分析输入
  → boundaries：生成合法时间边界 lattice
  → features：按候选区间汇总 pitch-class、时值、onset 与 bass
  → candidates：规则生成并评分结构化和弦候选
  → decode + transitions：用有界 beam search 选择整段和弦序列
  → learnedRanker：仅扩充和排序每段的 Top-8 alternatives
  → postprocess：抑制短暂非和弦、合并相邻段、应用 confidence 拒识
  → Primary Harmony Reranker：在冻结 range 上从 Top-8 选择 primary
  → HarmonySegment[]
```

生产入口是 [`analyzeRules.ts`](../src/harmony/analyzeRules.ts)。规则候选负责主序列、boundary、后处理和暂时的拒识 confidence；frequency ranker 构造 alternatives，量化 MLP 只在最终冻结 range 上选择 primary chord。两种学习分都不进入序列累计，model logit 也不充当 confidence。

`alternatives` 是独立排序的候选列表，不承诺第一项等于或一定包含 primary chord。相邻同和弦 segment 合并时，候选按原顺序稳定去重并始终限制为最多 8 个；评测不得把合并前多个列表拼接成大于 Top-8 的 oracle。

## 核心文件

| 文件                                                                              | 职责                                                                                  |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`schemas.ts`](../src/harmony/schemas.ts)                                         | Chord Symbol、Segment、Correction、Revision 和 Analysis Document 的 Zod 事实边界。    |
| [`writtenTime.ts`](../src/harmony/writtenTime.ts)                                 | 小节内书写时间、区间比较和位置语义。                                                  |
| [`analysisInput.ts`](../src/harmony/analysisInput.ts)                             | 将轨道、staff、音符和小节整理成确定性的分析输入。                                     |
| [`analyzeRules.ts`](../src/harmony/analyzeRules.ts)                               | 编排候选边界、规则解码、学习 alternatives 和后处理。                                  |
| [`boundaries.ts`](../src/harmony/boundaries.ts)                                   | 从小节与音符事件生成去重、合法且有预算上限的边界 lattice。                            |
| [`features.ts`](../src/harmony/features.ts)                                       | 缓存区间内 pitch-class duration、onset count 和 bass 等特征。                         |
| [`candidates.ts`](../src/harmony/candidates.ts)                                   | 生成 major/minor、6/7/9/11/13、add、alteration、slash bass 等结构化候选并计算规则分。 |
| [`decode.ts`](../src/harmony/decode.ts)                                           | 有界 beam search 序列解码，限制 beam、跨度和 segment 数量。                           |
| [`transitions.ts`](../src/harmony/transitions.ts)                                 | 相邻和弦的转换成本，用于减少不自然切换和伪边界。                                      |
| [`postprocess.ts`](../src/harmony/postprocess.ts)                                 | 短片段抑制、相邻段合并、confidence threshold 与 unresolved。                          |
| [`learnedRanker.ts`](../src/harmony/learnedRanker.ts)                             | 37 维移调归一化特征和 `frequency-ranker-v2` 原型评分。                                |
| [`bundledHarmonyRanker.ts`](../src/harmony/bundledHarmonyRanker.ts)               | 加载并校验随应用发布的静态模型 JSON。                                                 |
| [`harmony-ranker-model.json`](../src/harmony/harmony-ranker-model.json)           | 版本化只读模型资产；包含 corpus、训练 group 和算法摘要。                              |
| [`mlpReranker.ts`](../src/harmony/mlpReranker.ts)                                 | 校验两位小数 MLP 资产，并在固定 Top-8 上执行确定性 TypeScript 推理。                  |
| [`harmony-primary-mlp-model.json`](../src/harmony/harmony-primary-mlp-model.json) | 59→16→1 的量化 primary 模型与训练来源 hash。                                          |

## 分析方法

### 书面时间与边界

来源 MusicXML 的 divisions 不假设固定为 960。`writtenTime.ts` 对实际 divisions 计算安全 LCM，并要求 source divisions 与内部 tick 往返完全相等；不可整除或超出安全整数的位置会被拒绝。分析在不展开 repeat 的 written timeline 上运行，range 均为左闭右开。

boundary lattice 的小节和必要事件边界不会被剪枝，可选音符边界按稳定顺序受每小节预算限制。后续 decoder 只在这张合法 lattice 上搜索，不产生无法写回来源谱的位置。

### 规则候选

分析只读取选中且非打击乐的轨道，并优先使用 sounding pitch。每个候选区间会统计十二个 pitch class 的累计时值和 onset，结合最低音、重要和弦音是否存在、非和弦音比例、扩展音证据与结构复杂度生成候选。

候选必须先通过结构化 Chord Symbol schema，模型和规则都不能产生任意文本标签。复杂 extension 和 alteration 需要对应色彩音证据，避免仅凭基础三和弦推断出过度复杂的符号。

### 序列解码

`decodeHarmonySequence` 不逐窗口贪心选择，而是在合法边界上搜索整段路径。当前生产参数为 beam width 16、最大跨度 16，并对相邻和弦变化应用弱转换成本。这样可以利用上下文，同时通过硬预算控制浏览器运行时间。

### 本地学习排序

ranker 是静态 JSON + TypeScript 实现，不使用 Torch、Python runtime 或网络服务。每个“特征 + 候选和弦”被转换为 37 维向量：

- 相对候选根音的 12 维 pitch-class duration presence；
- 相对候选根音的 12 维 onset presence；
- 12 个相对 bass 音程加“无 bass”的 13 维 one-hot。

模型按 chord kind、extension、degrees 和 slash-bass interval 保存频次原型，以原型频次和特征距离评分。当前 Top-8 通常保留六个学习候选和两个规则候选。

量化 Primary Harmony Reranker 使用同一 37 维候选证据，加 chord shape、归一化规则分、alternative rank 和 rule-primary indicator，共 59 维输入，经 16 个 ReLU hidden units 输出独立 logit。它只重排 postprocess 后的最终 Top-8，不重新运行 range search 或 merge；PyTorch 只用于离线训练。

这个边界是有意的：早期实验把学习分混入序列累计时，分数尺度差异会降低 resolved precision 和 boundary 稳定性。固定 boundary 的 MLP 已通过 v3 tune 和 `1.25x` 性能门禁，但新的 primary confidence 仍需在多语料 train/tune 上独立校准。

## 来源、修正与有效结果

自动分析 Revision 不是最终展示结果。相关文件：

| 文件                                                                  | 职责                                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`sourceHarmony.ts`](../src/harmony/sourceHarmony.ts)                 | 读取并投影 MusicXML `<harmony>`；不支持或冲突的来源信息保持 unresolved。 |
| [`corrections.ts`](../src/harmony/corrections.ts)                     | 用户 Correction 的基础操作与叠加语义。                                   |
| [`correctionCommands.ts`](../src/harmony/correctionCommands.ts)       | 编辑器使用的结构化修正命令。                                             |
| [`effectiveProjection.ts`](../src/harmony/effectiveProjection.ts)     | 按 `Correction > source harmony > analysis Revision` 生成有效和声。      |
| [`repository.ts`](../src/harmony/repository.ts)                       | Analysis Document repository contract、版本 CAS 和内存参考实现。         |
| [`exportMusicXmlHarmony.ts`](../src/harmony/exportMusicXmlHarmony.ts) | 将有效和声写入 MusicXML，同时保持原始 Managed Score Copy 不变。          |
| [`musicXmlRoundTrip.ts`](../src/harmony/musicXmlRoundTrip.ts)         | MusicXML/MXL 容器往返与非和声内容保护。                                  |

来源冲突、微分音或不支持的符号不会伪装成 `N.C.`。用户 Correction 明确覆盖来源和弦；没有 Correction 时来源和弦优先于自动分析。

## 不变量

- 所有持久化和跨宿主数据先经过 Zod schema。
- Analysis Revision 不可变；重分析生成新 Revision。
- Top-8 是硬上限，低 confidence 应成为 unresolved，而不是伪造确定答案。
- 删除 Library Score 时必须同时删除 Analysis Document，禁止重建孤儿数据。
- Browser 与 Desktop 使用同一领域逻辑，Renderer 不获得本地绝对路径。
- 模型资产损坏必须明确失败，不静默切换算法。

## 验证与延伸阅读

相邻的 `src/harmony/__tests__/` 覆盖 schema、候选、解码、ranker、来源和弦、Correction、repository 与 MusicXML 往返。最小验证：

```bash
pnpm vitest run packages/web-core/src/harmony
```

训练、真实语料评估和性能 benchmark 见 [`scripts/README.md`](../../../scripts/README.md)，完整系统边界见 [`docs/architecture/harmony-analysis-system.md`](../../../docs/architecture/harmony-analysis-system.md)。架构决策见 [`ADR 0053`](../../../docs/adr/0053-use-bundled-learned-harmony-ranker.md)。运行时代码和测试结果高于文档；若实现边界变化，应同步更新本文和 ADR。
