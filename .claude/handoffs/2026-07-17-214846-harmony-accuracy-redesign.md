# Handoff: Harmony accuracy redesign after browser-safe ranker wrap-up

## Session Metadata

- Created: 2026-07-17 21:48:46
- Project: /Users/hikerpig/mydemos/tab-viewer
- Branch: feat-sep
- Session duration: Multi-session implementation and evaluation, finalized 2026-07-17

### Recent Commits (for context)

- 9c25836 fix: preserve rule-based harmony decoding
- 67512b8 feat: apply learned harmony candidate ranking
- 3257293 feat: add reproducible harmony ranker model
- 779438a docs: authorize bundled harmony ranker
- 23675f7 docs: complete release evidence audit

## Handoff Chain

- **Continues from**: None (fresh start)
- **Supersedes**: None

> This is the first handoff for this task.

## Current State Summary

Harmony Analysis Studio 的首轮准确率优化已经主动收尾。仓库现在包含可复现训练的静态频次模型，以及完全在 Browser/Desktop 可运行的 TypeScript ranker；它只改善 Top-8 alternatives，主序列、resolved confidence 与 boundary 继续走规则候选，避免已解析结果回退。最终 UCI Top-8 为 87.68%，CMU Top-8 为 64.87%，仍未达到 95% 发布门槛，相关 P6/T24/T28 复选框有意保持未完成。性能、单测、双端构建和 E2E 均通过。用户决定后续重新设计准确率方案，本 handoff 保存当前最佳安全基线。

## Codebase Understanding

## Architecture Overview

`packages/web-core` 持有纯领域分析逻辑，不得依赖 React、Browser、Electron、Python 或 Torch。规则候选先用于有界序列解码；bundled ranker 从版本化 JSON 资产读取移调归一化频次原型，只重排/补充最终 alternatives。UCI 与 CMU evaluator 共用按 group 切分的 train/tune/eval 协议，训练代码会拒绝 eval group，避免泄漏。评估分别区分 candidate oracle、完整序列 resolved 指标、boundary 和 confidence calibration。

## Critical Files

| File                                                    | Purpose                                    | Relevance                                                  |
| ------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| `packages/web-core/src/harmony/analyzeRules.ts`         | 候选生成、序列解码和最终 alternatives 装配 | 安全边界：规则候选解码，bundled ranker 仅用于 alternatives |
| `packages/web-core/src/harmony/learnedRanker.ts`        | 纯 TypeScript 推断与候选融合               | 浏览器兼容的学习排序实现                                   |
| `packages/web-core/src/harmony/bundledHarmonyRanker.ts` | 校验并加载静态模型资产                     | 模型损坏时明确失败，不静默换算法                           |
| `scripts/train-harmony-ranker.ts`                       | train/tune 数据训练与模型生成              | 后续模型实验必须保持 eval 隔离                             |
| `scripts/harmony-uci-eval.ts`                           | UCI Bach 独立评估                          | 权威古典指标与 precision/coverage curve                    |
| `scripts/harmony-cmu-eval.ts`                           | CMU CMA 独立评估                           | 权威流行/键盘指标与分布偏移证据                            |
| `docs/adr/0053-use-bundled-learned-harmony-ranker.md`   | 当前架构决策                               | 授权本地 bundled ranker，但不授权 Torch runtime            |
| `tasks/todo.md`                                         | 分阶段任务与证据                           | T24/T28 保持未完成并记录停止点                             |

## Key Patterns Discovered

- 模型资产通过 Zod schema、corpus SHA-256 和训练摘要固定，推断必须离线、确定且可复现。
- Top-8 oracle 必须在 gold window 独立生成候选；resolved/boundary/confidence 必须来自完整序列，不能混算。
- 学习分与规则分的尺度不同，不应直接累加到序列路径；本轮实测会诱发 resolved 回退。
- `exactOptionalPropertyTypes` 已开启；跨持久化/进程边界继续使用已有 Zod schema。
- 项目 shell 命令按仓库约定加 `rtk` 前缀。

## Work Completed

## Tasks Finished

- [x] T26：固化无 eval 泄漏的学习特征、训练协议和版本化模型资产。
- [x] T27：接入浏览器可运行的 bundled ranker，并保持 Top-8/schema/cancel/Revision 语义。
- [x] 增加 Top-1 与 precision/coverage curve 诊断，重跑 UCI/CMU 独立 eval。
- [x] 将主序列恢复为规则解码，只保留学习 alternatives，锁住 resolved/boundary 基线。
- [x] 完成 20-sample benchmark、`pnpm verify` 和 Browser/Desktop E2E。

## Files Modified

| File                                                          | Changes                                                  | Rationale                    |
| ------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------- |
| `packages/web-core/src/harmony/analyzeRules.ts`               | 拆分规则解码候选与学习 alternatives                      | 防止学习排序损害主序列正确率 |
| `scripts/harmony-uci-eval.ts`                                 | 输出 Top-1 与 precision/coverage curve                   | 量化排名质量和拒识上限       |
| `scripts/harmony-cmu-eval.ts`                                 | 输出 Top-1 与 duration-weighted precision/coverage curve | 保持 CMU 指标按真实时长加权  |
| `tasks/plan.md`, `tasks/todo.md`, `tasks/release-evidence.md` | 记录最终指标、验证与延期决定                             | 不把未达门槛误记为完成       |

## Decisions Made

| Decision                    | Options Considered                                     | Rationale                                                                            |
| --------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 学习模型只用于 alternatives | 学习排序驱动解码；规则解码 + 学习 alternatives；纯规则 | 学习排序提升 Top-8，但驱动解码会回退 resolved；混合方案保存最高安全收益              |
| 不引入 BACHI/Torch          | Python/Torch；ONNX 转换；静态 JSON + TypeScript        | Torch 无法在浏览器直接运行；约 119 MiB 的外部 checkpoint 也不符合当前体积/运行时边界 |
| 不勾选 T24/T28/P6           | 降低门槛；继续调参；明确延期                           | 最终指标真实未达标，用户决定后续重新设计                                             |
| 保留当前 confidence 行为    | 用学习分重校准；规则 confidence                        | threshold curve 表明现有分数达不到 95% precision/70% coverage，继续微调收益不足      |

## Pending Work

## Immediate Next Steps

1. 先写新的准确率方案/ADR：明确目标标签语义、可接受模型格式、下载体积、内存、CPU/WebGPU 与首屏延迟预算。
2. 扩充并分层 corpus（style、source-harmony、爵士、多声部 MusicXML），建立跨风格独立 holdout，再决定模型结构。
3. 用当前规则解码 + 学习 alternatives 作为固定 baseline；新方案先离线超过 UCI 87.68% / CMU 64.87% Top-8 且不损害 resolved，再考虑产品接入。

## Blockers/Open Questions

- [ ] 产品问题：95% Top-8 与 95% resolved precision/70% coverage 是否仍是同一发布门槛，或需按风格/来源分层。
- [ ] 架构问题：是否允许 ONNX Runtime Web/WebGPU、模型懒加载及多大静态资产；未决前不要引入新 runtime。
- [ ] 数据问题：当前 CMU tune Top-8 96.18% 而 eval 仅 64.87%，需解决明显的泛化/分布偏移。

## Deferred Items

- T24/T28/P6 准确率门槛：用户决定停止本轮调参并重新设计。
- P4 独立人工演练与最终人工评审：自动化已覆盖主要状态，但计划中的人工 gate 仍未执行。
- BACHI/Torch 集成：仅在 `/tmp` 做可行性调查，未加入仓库；浏览器不可直接运行且资产过大。

## Context for Resuming Agent

## Important Context

不要从“让 bundled ranker 参与序列解码”继续调参。该方向已经造成 resolved precision/性能回退；提交 `9c25836` 明确恢复规则解码。当前权威 eval：UCI Top-8 87.68%、Top-1 67.54%、resolved precision 55.90%、coverage 100%、boundary F1 73.94%、ECE 1.08%；CMU Top-8 64.87%、Top-1 31.36%、resolved precision 22.26%、coverage 100%、boundary F1 98.06%、ECE 7.84%。20 轮 5,000-note analysis P95 为 750.53 ms。门槛未达是已知且有意保留的状态，不是待修的测试故障。后续应从数据、目标与浏览器部署约束重新设计，而不是继续围绕当前离散频次 ranker 微调。

## Assumptions Made

- Browser 与 Desktop 必须共享同一纯 TypeScript 领域推断，且离线工作。
- 当前发布阈值不因本轮未达标而降低；复选框保持真实状态。
- alternatives 的改善对用户仍有价值，即使 primary resolved 指标没有提高。

## Potential Gotchas

- 工作树中的 `test-fixtures/musicxml/generated/simple.mxl` 是用户已有的未提交改动，本轮从未暂存或修改；继续保护它。
- `HARMONY_REPORT_SPLIT` 的 report-only eval 不含 train calibration，不能用其 ECE 代替默认完整 eval。
- CMU 指标按 duration 加权，UCI 指标按事件；不要直接混用聚合方式。
- 外部 BACHI checkpoint 和 clone 均只在 `/tmp`，不属于项目依赖或交付物。
- E2E 需要监听 `127.0.0.1:5173`；受限沙箱可能报 `EPERM`，在允许启动本地测试服务器的环境运行即可。

## Environment State

## Tools/Services Used

- pnpm workspace；根门禁：`pnpm verify:fast`、`pnpm verify`、`pnpm verify:e2e`。
- 评估：`pnpm harmony:eval:uci /tmp/bach-choral-harmony.zip` 与 `pnpm harmony:eval:cmu /tmp/cma-dataset.zip`。
- 性能：`pnpm harmony:benchmark`，默认 20 samples / 5,000 notes。

## Active Processes

- 无。benchmark、build 和 Playwright WebServer 都已退出。

## Environment Variables

- `HARMONY_REPORT_SPLIT`：可选，只报告指定 split；不适合作为默认校准证据。
- `HARMONY_ORACLE_ONLY`：可选，只运行候选 oracle 诊断。

## Related Resources

- `tasks/plan.md`
- `tasks/todo.md`
- `tasks/release-evidence.md`
- `docs/adr/0053-use-bundled-learned-harmony-ranker.md`
- `packages/web-core/src/harmony/analyzeRules.ts`
- Official BACHI research reference: https://github.com/AndyWeasley2004/BACHI_Chord_Recognition

---

**Security Reminder**: Before finalizing, run `validate_handoff.py` to check for accidental secret exposure.
