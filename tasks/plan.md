# Implementation Plan: Paper-compatible Semi-CRF

## Overview

在不改动现有 Harmony 数据结构和 production analyzer 的前提下，先建立可独立验证的
paper-compatible Semi-CRF 核心，再接入离线训练、BaCh 复现和现有语料对比。实现按风险优先：
先证明 observation lattice 与 exact inference 正确，再扩展论文特征和优化器。

## Architecture Decisions

- 新实现位于 `packages/web-core/src/harmony/paper-semi-crf-*`，只依赖纯领域类型；未完成复现前不接入
  `analyzeHarmonyRules`。
- observation lattice 仅由选中轨道的 note onset/offset 构造，使用现有 written-time 安全语义；gold
  只提供目标路径。
- label inventory 是冻结且完整的模型契约，每个 legal segment 都遍历全量 label，不借用规则 Top-8。
- local potential 是 forward/backward、gradient 与 exact Viterbi 的单一事实源；数值计算使用 log-space。
- BaCh、DCML 和 POP909 外部数据不进入 Git，仓库只保留小型合成或许可清晰的 parity fixtures。

## Task List

### Phase 1: Observation and State Contracts

- [x] Task 1: 建立 paper basic-event 投影。
  - Acceptance: 相邻唯一 onset/offset 形成 event；每个 event 保留 sounding pitch、event 内 duration、
    held-from-previous、bass 和 metric evidence；scope 与 percussion 过滤正确。
  - Verification: `pnpm vitest run packages/web-core/src/harmony/__tests__/paper-semi-crf-events.test.ts`
  - Dependencies: None
  - Files: `paper-semi-crf-events.ts`、相邻测试、公共导出。
  - Scope: Medium
- [x] Task 2: 建立完整 label inventory 与 `ChordSymbol` 无损映射。
  - Acceptance: inventory 稳定去重且不裁剪；不支持 label 明确报错；normalization/simplification 版本化。
  - Verification: `pnpm vitest run packages/web-core/src/harmony/__tests__/paper-semi-crf-labels.test.ts`
  - Dependencies: Task 1
  - Files: `paper-semi-crf-labels.ts`、相邻测试、公共导出。
  - Scope: Medium

### Checkpoint: Contracts

- [x] Phase 1 focused tests pass.
- [x] `pnpm --filter @zupulse/web-core exec tsc -p tsconfig.test.json --noEmit` passes.
- [x] Review model contracts before feature implementation.

### Phase 2: Exact Inference Core

- [x] Task 3: 建立共享 local-potential contract 与 exact semi-Markov Viterbi。
  - Acceptance: tiny lattice 的最佳路径与 exhaustive oracle 完全一致；tie-break 确定；非有限分数失败。
  - Verification: `pnpm vitest run packages/web-core/src/harmony/__tests__/paper-semi-crf-decode.test.ts`
  - Dependencies: Task 2
  - Files: `paper-semi-crf-model.ts`、`paper-semi-crf-decode.ts`、相邻测试。
  - Scope: Medium
- [x] Task 4: 实现 log-partition、expected counts 与 L2 objective/gradient。
  - Acceptance: partition 与 exhaustive oracle 一致；analytic gradient 通过 finite difference；非有限输入失败。
  - Verification: `pnpm vitest run packages/web-core/src/harmony/__tests__/paper-semi-crf-model.test.ts`
  - Dependencies: Task 3
  - Files: `paper-semi-crf-model.ts`、相邻测试。
  - Scope: Medium

### Checkpoint: Inference

- [x] Phase 1-2 focused tests pass.
- [x] Tiny exhaustive parity covers partition、gradient 和 Viterbi.
- [x] `pnpm verify:fast` passes.

### Phase 3: Paper Features

- [x] Task 5a: 实现 reference purity、base coverage、beginning accent 与离散 binning。
  - Acceptance: count/accent/duration purity、root/third/fifth/added/all coverage 和每个 bin 边界具有 parity tests；
    feature extraction 不读取 gold。
  - Verification: `pnpm vitest run packages/web-core/src/harmony/__tests__/paper-semi-crf-features.test.ts`
  - Dependencies: Tasks 1-4
  - Files: `paper-semi-crf-features.ts`、相邻测试。
  - Scope: Medium
- [x] Task 5b: 实现 weighted coverage 与 bass feature families。
  - Acceptance: duration/accent/event-duration coverage、first/segment/weighted bass 与 reference parity。
  - Verification: paper feature focused tests.
  - Dependencies: Task 5a
  - Files: `paper-semi-crf-features.ts`、相邻测试。
  - Scope: Medium
- [x] Task 5c: 实现 suspension/anticipation/passing/neighbor figuration variants。
  - Acceptance: 每种 figuration 判定有正反 fixture，全部 `FIG_*` enabled families 与 reference parity。
  - Verification: paper feature focused tests and selected author XML parity.
  - Dependencies: Task 5b
  - Files: `paper-semi-crf-features.ts`、相邻测试、parity fixtures。
  - Scope: Medium
- [x] Task 6: 实现 mode/root-interval chord bigram features 与严格模型资产 schema。
  - Acceptance: transition features 与 reference parity fixture 一致；malformed/non-finite asset 明确失败。
  - Verification: paper feature/model focused tests.
  - Dependencies: Tasks 2-5
  - Files: `paper-semi-crf-features.ts`、`paper-semi-crf-model.ts`、相邻测试。
  - Scope: Medium

### Checkpoint: Faithful Core

- [x] Reference-selected songs 的 event count、gold segments 与 feature activations 匹配。
  - [x] BaCh fold 1 train event count 5107、gold segments 2801，与作者归档逐项一致。
  - [x] BaCh fold 1 test event count 563、gold segments 291，并通过完整 records schema。
  - [x] 54 首 gold paths 激活 598 个 feature names；与作者 fresh/archived 集合交集 598、差集 0。
- [x] Harmony module tests and `pnpm verify:fast` pass.
- [x] Freeze feature and label contract before corpus training.

### Phase 4: Training and Evaluation

- [x] Task 7: 增加 CLI records/train/eval 流程和 L2 optimizer integration。
  - [x] 冻结 versioned records schema，并强制 train/tune/final 用途隔离。
  - [x] 实现确定性 L-BFGS 与 checkpoint/resume。
  - [x] 接入 corpus objective 并完成 synthetic training。
  - [x] 接入 records import、paper metrics 与 train/eval CLI commands。
  - [x] 接入 author BaCh XML records export，并完成 event/gold parity。
  - Acceptance: train/tune/final role 被强校验；训练可恢复且确定性；不提交外部语料；fresh/archive 报告分离。
  - Verification: Harmony CLI focused tests and synthetic end-to-end training.
  - Dependencies: Tasks 4-6
  - Files: `tools/harmony-cli/src/paper-semi-crf-*.ts`、相邻测试、CLI docs。
  - Scope: Medium
- [ ] Task 8: 运行 BaCh reference fold 1、TypeScript parity 与完整报告。
  - [x] same-author-weight TypeScript parity：event 81.17%、segment F1 73.39%，均在作者归档 ±2pp 内。
  - [ ] fresh author / fresh TypeScript fold 1 training parity。
    - [x] factorized objective 与 generic objective/gradient tiny parity。
    - [ ] 预编译 sparse segment vectors，消除每次 objective 的重复 feature extraction。
  - [ ] OS peak RSS、逐曲 runtime P95 与剩余 3-event/3-segment 差异说明。
  - Acceptance: 报告 event accuracy、segment P/R/F、峰值内存和 P95 runtime；差异超过规格门槛时给出可复现原因。
  - Verification: frozen report hashes and commands; `pnpm verify`.
  - Dependencies: Task 7
  - Files: evaluation docs and non-dataset report metadata.
  - Scope: Medium

### Phase 5: Product Decision

- [ ] Task 9: 在批准的 current-corpus train/tune groups 上比较。
  - Acceptance: 不读取 final holdout；CRF primary/boundaries 不被 rule prior、postprocess 或 confidence 改写。
  - Verification: preregistered metric gates and baseline diff.
  - Dependencies: Task 8
  - Files: Harmony CLI evaluation reports/config.
  - Scope: Medium
- [ ] Task 10: 根据准确率与 runtime 证据形成 production adoption 决策。
  - Acceptance: 若采用则先获批并更新 Current ADR/architecture/Feature Contract；若不采用则保留研究边界和原因。
  - Verification: documentation cross-check and full required gates.
  - Dependencies: Task 9
  - Files: relevant ADR/current docs only after decision.
  - Scope: Small

## Risks and Mitigations

| Risk                                                         | Impact | Mitigation                                                                                            |
| ------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------- |
| 作者预处理不在 Java 仓库内，event accent 可能难以完全 parity | High   | 先将 accent 作为显式、可测试的投影 contract；用作者 XML fixture 校准，不凭印象改 bin                  |
| 完整 label × segment lattice 造成时间/内存爆炸               | High   | correctness-first tiny exhaustive tests；单独测量性能，不提前引入 Top-8 或 beam                       |
| 优化器依赖选择改变训练语义                                   | Medium | 已评估 npm/C++ 候选；采用仓内确定性 L-BFGS，并以 quadratic 与 synthetic CRF 测试冻结 line search 语义 |
| 跨小节 note duration 的书面位置处理错误                      | High   | 使用 measure cumulative ticks 和 canonical written moments；覆盖跨小节、非连续 measure index 测试     |
| 复现指标与作者归档输出口径混淆                               | High   | fresh 与 archived 报告使用不同字段和命令，禁止混名                                                    |

## Open Questions

- optimizer dependency 已获准评估；现有 npm 候选维护弱或依赖 native binding，因此 Task 7 采用仓内小型确定性
  L-BFGS，不新增 optimizer dependency。
- Task 9 开始前确认第一轮 production comparison 的语料范围。
- Task 10 只有在复现证据完整后才讨论替换 production analyzer。
