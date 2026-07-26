# Paper Semi-CRF 复现与分析方法重写规格

- 状态：approved for implementation
- 日期：2026-07-25
- 目标论文：Masada & Bunescu, _Chord Recognition in Symbolic Music: A Segmental CRF Model,
  Segment-Level Features, and Comparative Evaluations on Classical and Popular Music_（2018 扩展版）
- 参考实现：`kristenmasada/chord_recognition_semi_crf`

## 假设

1. “复现 semi-CRF 论文实现”指上面这篇论文及作者公开的 BaCh 参考代码，而不是 Harana 等后续
   neural semi-CRF。
2. 第一阶段只建立可独立验证的 paper-compatible analyzer，不立即替换 production
   `analyzeHarmonyRules`，也不改变 `HarmonyAnalysisInput`、`ChordSymbol`、
   `HarmonySegment`、Revision 或 Studio 数据结构。
3. 论文复现先使用论文同源的 BaCh 60 chorales 和原始 10 folds；复现成立后，再在当前 DCML /
   POP909 协议下比较泛化效果。
4. 现有已经查看过的 DCML/POP909 分组继续只作 historical regression。新的选择只使用
   `protocol-v3.json` 允许的 train/tune；final holdout 在实现和参数冻结前不读取。
5. 作者 Java 代码只作为离线参考，不进入产品依赖或 bundle。产品推理继续使用确定性的
   TypeScript 和版本化静态模型资产。

如果这些假设不成立，应在进入实现计划前修订本规格。

## Objective

先回答“论文效果为何没有在当前实现中出现”，再建立一条能验证论文方法本身、而不是当前
`semi-crf-linear-v1` 变体的实现路径。

完成后应具备：

- 可重复运行的 BaCh paper-reference 基线；
- 与论文方法一一对应的 event lattice、label inventory、segment features、transition features、
  CRF training objective 和 exact Viterbi；
- 复用现有领域输入输出结构的 TypeScript analyzer；
- 在 BaCh 与当前测试语料上使用明确且不可混名的 event、segment、interval 和 boundary 指标；
- 有证据支持“替换 production analyzer”或“保留为研究分支”的决定。

## 已确认的实现偏差

当前 `semi-crf-linear-v1` 不能被称为论文复现，至少存在以下实质差异：

| Contract            | 论文 / 作者实现                                                    | 当前实现                                            |
| ------------------- | ------------------------------------------------------------------ | --------------------------------------------------- |
| Observation unit    | 相邻 note onset/offset 之间的 basic event                          | dense legal written boundary range                  |
| Label space         | fold/corpus 的完整 chord label inventory，BaCh 约 90 labels        | 每个 range 的规则 Top-8                             |
| Segment features    | 离散 purity、coverage、figuration、bass、metric accent 特征族      | 73 维 chroma/scalar 向量                            |
| Transition features | chord mode + root interval bigram                                  | 29 维 root/bass/common-tone 向量并混入 rule prior   |
| Training objective  | L2-regularized conditional log-likelihood，exact network inference | 1 epoch averaged structured perceptron              |
| Training scale      | 最多 5000 iterations，收敛容差 `1e-6`                              | 1 epoch，learning rate `0.10`                       |
| Search limit        | 最长 20 basic events（BaCh fold 1）                                | 最长 8 quarter notes                                |
| Score semantics     | learned CRF potentials                                             | `ruleScale * ruleScore + modelScale * learnedScore` |
| Reference dataset   | BaCh/TAVERN/KP/Rock，论文同标签约定                                | DCML/POP909 的 canonical `ChordSymbol`              |

因此当前失败只否定了该变体，不能反证论文模型。

## Tech Stack

- Runtime and domain: TypeScript 5.5, Zod 4, `@zupulse/web-core`
- Tests and evaluation: Vitest 2, `@zupulse/harmony-cli`
- Offline reference only: authors' Java/StatNLP implementation with a temporary JDK
- Offline model training: prefer TypeScript unless profiling proves insufficient; any optimizer dependency requires
  a separate dependency review
- Product inference: deterministic TypeScript, no Java/Python/Torch/network dependency

## Commands

```bash
# Domain tests
pnpm vitest run packages/web-core/src/harmony

# CLI and evaluator tests
pnpm --filter @zupulse/harmony-cli test
pnpm --filter @zupulse/harmony-cli typecheck

# Existing frozen regressions
pnpm -s harmony:cli eval test-fixtures/harmony/datasets/manifest.json \
  --data-root /path/to/harmony-data

# Repository gates
pnpm verify:fast
pnpm format:check
git diff --check
```

新增命令的最终名称在计划阶段确定，但必须分别覆盖：

```text
paper-reference-eval
paper-semi-crf-records
paper-semi-crf-train
paper-semi-crf-eval
```

## Project Structure

```text
packages/web-core/src/harmony/
  paper-semi-crf-events.ts       basic event projection
  paper-semi-crf-labels.ts       finite label inventory and chord mapping
  paper-semi-crf-features.ts     paper-compatible segment/transition features
  paper-semi-crf-model.ts        strict model asset schema and scoring
  paper-semi-crf-decode.ts       exact semi-Markov Viterbi

packages/web-core/src/harmony/__tests__/
  paper-semi-crf-*.test.ts       behavior and parity fixtures

tools/harmony-cli/src/
  paper-semi-crf-*.ts            records, training, evaluation and reference reports

test-fixtures/harmony/
  paper-semi-crf/                small license-safe synthetic/parity fixtures only

docs/
  architecture/                  current runtime only after verified adoption
  adr/                           durable production replacement decision
```

外部 BaCh/DCML/POP909 数据和作者仓库不得提交到本仓库。

## Code Style

使用 named exports、double quotes、严格 Zod 边界和 `exactOptionalPropertyTypes` 兼容写法。
Absent optional fields 必须省略。

```ts
export type PaperSemiCrfPotential = {
  segmentScore: number;
  transitionScore: number;
};

export function scorePaperSemiCrfSegment(model: PaperSemiCrfModel, features: readonly PaperSemiCrfFeature[]): number {
  return features.reduce((score, feature) => score + (model.weights[feature] ?? 0), 0);
}
```

## Behavioral Contract

### Event projection

- A basic event MUST span two adjacent unique note onset/offset partition points.
- Event notes MUST include sounding pitch, duration within the event, held-from-previous, bass and metric accent
  evidence.
- Gold boundaries MUST NOT create or remove observation events.
- Written-time conversion MUST remain exact and use existing safe tick semantics.

### Label inventory

- The paper reproduction MUST score every label in the frozen inventory for every legal segment; it MUST NOT use
  the current rule Top-8 as a proposal filter.
- Labels MUST map losslessly to the existing `ChordSymbol` schema or be reported as unsupported.
- Enharmonic normalization and label simplification MUST be versioned model contracts.

### Features

- The first faithful candidate MUST implement the paper's enabled feature families: purity, accented purity,
  duration purity, figuration-aware variants, chord-tone coverage, weighted coverage, bass-role features,
  beginning accent and chord bigrams.
- Feature quantization/binning MUST match the reference implementation and be tested at bin boundaries.
- Gold MUST only supply target paths; it MUST NOT influence runtime feature extraction.

### Training

- The primary training objective MUST be L2-regularized conditional log-likelihood over the complete semi-CRF
  lattice.
- Forward/backward log-partition, gradient and exact Viterbi MUST share the same local potential definition.
- Numerical code MUST use log-space operations and fail on non-finite objective, gradient or weights.
- A tiny exhaustive lattice MUST pass partition, gradient finite-difference and Viterbi parity tests.

### Product adaptation

- Paper reproduction metrics MUST be reported before adding current rule priors, confidence rejection,
  postprocessing or Top-8 alternatives.
- Any product adapter MUST keep CRF primary/boundaries unchanged during the first comparison.
- `HarmonySegment.alternatives` and confidence require a separate calibrated policy; CRF path score MUST NOT be
  persisted as confidence.

## Testing Strategy

1. **Small parity tests:** event construction, label mapping, every feature family, exact path, log-partition and
   gradient.
2. **Reference parity:** selected BaCh songs must match the author parser's event count, gold segments and feature
   activations.
3. **Fresh fold reproduction:** train and test at least BaCh fold 1 from scratch before port evaluation.
4. **Full paper baseline:** run the original 10 folds or explicitly report why resource limits prevent it; archived
   author outputs may be reported separately but never mislabeled as a fresh run.
5. **TypeScript reproduction:** run the same folds and compare event accuracy and segment P/R/F with the fresh
   reference.
6. **Current corpora:** after freezing the faithful implementation, run allowed train/tune groups and then frozen
   regressions with interval accuracy, predicted primary, boundary F1, density and runtime.

Tests assert outcomes and serialized contracts, not call order or internal cache implementation.

## Success Criteria

- Fresh author fold 1 completes on the published split. Its event accuracy and segment F1 are within 2 absolute
  percentage points of the archived fold 1 output (`80.64%`, `72.85%`), or any larger mismatch is explained by a
  reproducible source-level cause.
- The TypeScript implementation matches a tiny exhaustive oracle exactly and passes analytic-gradient finite
  difference checks.
- On BaCh fold 1, the TypeScript port is within 2 absolute percentage points of the fresh author run for event
  accuracy and segment F1.
- The paper-compatible analyzer never uses rule Top-8 to prune the CRF label space.
- Peak memory and P95 runtime are measured separately from accuracy. A slow faithful reference is acceptable for
  the reproduction checkpoint but cannot become the production default.
- Production replacement occurs only if every preregistered current-corpus no-regression gate passes and runtime
  meets an explicitly approved product budget.
- Existing Studio persistence, corrections, source harmony precedence and export contracts remain unchanged.

## Boundaries

- Always: preserve current domain/storage structures; keep datasets out of git; validate assets with Zod; keep
  train/tune/final roles isolated; write failing tests before behavior code; report fresh and archived results
  separately.
- Ask first: add an optimizer dependency; change label simplification; change product confidence/alternatives;
  read final holdouts; replace `analyzeHarmonyRules`; revise an accepted ADR.
- Never: train on final/eval data; inject gold candidates or boundaries; call a Top-8 proposal system a paper
  reproduction; use CRF score as confidence; silently fall back from a malformed model.

## Open Questions

- 是否确认目标就是 Masada & Bunescu 2018 及其公开 BaCh 实现？
- 第一轮 production comparison 是否只要求 BaCh + Mozart tune，还是必须从一开始加入 Beethoven、
  Chopin 和 POP909？
- 论文复现通过但 product runtime 超预算时，是否接受“离线研究实现 + 后续蒸馏/裁剪”作为阶段性结果？
