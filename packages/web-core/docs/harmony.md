# Harmony module

`src/harmony/` 是 Harmony Analysis Studio 的纯领域模块。它接收已经投影的乐谱数据，运行
paper-compatible Semi-CRF，并处理来源和弦、用户修正、持久化与 MusicXML/MXL 导出。该模块不依赖
React、Browser、Electron、IndexedDB 或在线服务。

外部 workspace 必须从 `@zupulse/web-core` 公共入口使用这些能力，不得深导入 `src/harmony/`。
Harmony module Worker 只使用受支持的 `@zupulse/web-core/harmony-worker` 窄入口，避免把 alphaTab
宿主代码带入 Worker graph。

## 生产分析流程

```text
HarmonyAnalysisInput
  → paper basic events
  → segment features + chord bigram
  → factorized exact semi-Markov Viterbi
  → primary chord + boundary
  → Top-8 alternatives + independent confidence threshold
  → HarmonySegment[]
```

生产入口是 [`analyzeHarmony.ts`](../src/harmony/analyzeHarmony.ts)。它只调用
[`analyzePaperSemiCrf.ts`](../src/harmony/analyzePaperSemiCrf.ts)，不存在第二套 analyzer 或运行时
fallback。

### Semi-CRF

- Basic event 由相邻 note onset/offset 构成，只读取选中且非打击乐的轨道。
- 冻结 label inventory 包含 62 个可支持标签，最大 span 为 20 events。
- Segment 与 transition 使用论文特征族；decoder 在完整 label inventory 上执行 exact Viterbi。
- Production scorer 把模型 feature names 编译成 numeric weight tables。Range evidence 与 figuration
  evidence 使用 prefix-addressable typed arrays；retained-note context cache 使用有界 compact storage。
  这些实现优化不得改变 feature multiplicity、浮点加法顺序、tie-break 或 serialized result。
- Semi-CRF path 独占 primary chord 与 boundary 决策。
- 模型是静态 JSON + 确定性 TypeScript；解析失败必须明确失败。

### Alternatives 与拒识

[`paper-semi-crf-alternatives.ts`](../src/harmony/paper-semi-crf-alternatives.ts) 只在已经冻结的
Semi-CRF range 上生成最多八个候选。
[`paper-semi-crf-confidence.ts`](../src/harmony/paper-semi-crf-confidence.ts) 按阈值把低置信度结果转为
`unresolved`。这两步不得改变 primary chord、range 或 boundary；CRF path score 也不作为
confidence。

## 文件导航

| 文件                                                                                                  | 职责                                             |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| [`schemas.ts`](../src/harmony/schemas.ts)                                                             | Chord、Segment、Correction、Revision 与 Document |
| [`writtenTime.ts`](../src/harmony/writtenTime.ts)                                                     | 精确书面时间与左闭右开区间                       |
| [`paper-semi-crf-events.ts`](../src/harmony/paper-semi-crf-events.ts)                                 | Basic-event observation                          |
| [`paper-semi-crf-labels.ts`](../src/harmony/paper-semi-crf-labels.ts)                                 | 冻结 label inventory 与 Chord 映射               |
| [`paper-semi-crf-features.ts`](../src/harmony/paper-semi-crf-features.ts)                             | Segment 与 transition 特征                       |
| [`paper-semi-crf-range-evidence.ts`](../src/harmony/paper-semi-crf-range-evidence.ts)                 | Label-independent range evidence                 |
| [`paper-semi-crf-figuration-evidence.ts`](../src/harmony/paper-semi-crf-figuration-evidence.ts)       | Figuration prefix 与 retained-note evidence      |
| [`paper-semi-crf-compiled-weights.ts`](../src/harmony/paper-semi-crf-compiled-weights.ts)             | Numeric production weight tables                 |
| [`paper-semi-crf-model.ts`](../src/harmony/paper-semi-crf-model.ts)                                   | 模型 schema、partition、objective 与 gradient    |
| [`paper-semi-crf-decode.ts`](../src/harmony/paper-semi-crf-decode.ts)                                 | Exact factorized decoder                         |
| [`bundledPaperSemiCrf.ts`](../src/harmony/bundledPaperSemiCrf.ts)                                     | 生产模型加载与 SHA-256                           |
| [`paper-semi-crf-alternative-features.ts`](../src/harmony/paper-semi-crf-alternative-features.ts)     | Frozen range 的候选证据                          |
| [`paper-semi-crf-alternative-ranker.ts`](../src/harmony/paper-semi-crf-alternative-ranker.ts)         | Alternatives 模型 schema 与评分                  |
| [`harmony-paper-semi-crf-alternatives.json`](../src/harmony/harmony-paper-semi-crf-alternatives.json) | Alternatives 静态资产                            |
| [`sourceHarmony.ts`](../src/harmony/sourceHarmony.ts)                                                 | MusicXML 来源和弦投影                            |
| [`effectiveProjection.ts`](../src/harmony/effectiveProjection.ts)                                     | Correction > source > analysis                   |
| [`repository.ts`](../src/harmony/repository.ts)                                                       | Document CAS repository contract                 |
| [`exportMusicXmlHarmony.ts`](../src/harmony/exportMusicXmlHarmony.ts)                                 | 标注副本导出                                     |

## 不变量

- Analysis Revision 不可变；重分析创建新 Revision。
- Top-8 是硬上限，低 confidence 只能成为 unresolved，不能伪造 N.C.
- Score Written Range 不绑定 playback occurrence 或算法 segment ID。
- 删除 Library Score 必须同时删除 Harmony Analysis Document。
- 导出不得修改 Managed Score Copy。
- 不得增加 approximate decoder、label pruning 或 silent fallback。
- Numeric/prefix 优化必须由 named feature oracle、golden checksum 与完整 exact decoder tests 证明等价。

## 当前性能证据

Apple M2 Max、Node `v22.22.1`、commit
`ce98a2914e7dfe70d37f51991e28711d6575a32a` 的 K331 五个隔离 warm samples 为
`5,054.43 / 4,797.78 / 4,925.84 / 4,913.62 / 4,774.76 ms`，median `4,913.62 ms`，最大 RSS
`484,098,048 bytes`。五次结果均为 121 segments 与 checksum
`9b0d56e25913116c1a44b460432280a681dc6dcfc2ed9812ab3c3178bb927ff0`。

TypeScript 已满足 required gate。WASM 未进入 production：最新 profile 最大单一 self-time kernel
约占 22%，低于 40% spike gate，也无法支持至少 30% 的增量收益。

## 验证

```bash
pnpm vitest run packages/web-core/src/harmony
pnpm --filter @zupulse/web-core exec tsc -p tsconfig.test.json --noEmit
pnpm benchmark:harmony
```

系统边界见
[`docs/architecture/harmony-analysis-system.md`](../../../docs/architecture/harmony-analysis-system.md)，
当前验证证据见
[`docs/evaluation/semi-crf.md`](../../../docs/evaluation/semi-crf.md)。
