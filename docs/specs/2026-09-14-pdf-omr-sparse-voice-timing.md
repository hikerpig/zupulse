---
status: draft
date: 2026-09-14
owner: Engineering
scope: Shared PDF OMR Draft validation, exact export, and reference eligibility
---

# PDF OMR 空白声部时间：保留事件，不补参考休止符

## 目标与待确认范围

使 Draft 能表示小节内有空白时段的非空声部，并准确导出其显式事件。目的在于修正表示能力与准入约束的不一致，为后续独立作品验证提供可信前提，不把参考准入提升计为识别收益。

本规格尚未获批，不定义当前行为。它修改共享 validator 和 exporter，影响 CLI benchmark、Harmony 投影以及 Browser/Desktop 使用的同一 pipeline；不是仅影响 LEGATO，也不是 K280/K331 特例。
请确认是否接受这一共享契约变更。若暂不接受，应另选符合现有准入条件的完整作品，而不是跳过现有门禁。

明确假设：不新增事件类型、数据库字段或 Bridge API；不改变 LEGATO 当前 `fillVoiceGapsWithRests` 默认后处理；不修改真实源文件或音符/休止符事实。
语义修订适用于所有共享 Draft 消费者，但不启动其他引擎的识别、训练或优化实验。

## 已核实的事实

`tasks/legato-candidate-ceiling/silence-contract-audit.ts` 的六例审计复现了四类空白时间表达被阻断、两个显式休止符控制通过的现状。
共享 normalizer 把 `forward` 用作游标移动；LEGATO 在此之后另行补齐声部空隙。补齐会新增普通休止符，并不是无损地恢复原始源表达。

当前 exporter 已为声部内部空隙生成 `forward`，但切换声部时统一 `backup` 整小节时长。若前一声部提前结束而没有尾部游标补齐，后续声部会面临错误定位风险。
因此仅修改校验级别不满足目标。`projectDraftHarmony` 按事件 onset、duration 计算精确 tick，本身不依赖为每段空白创建休止符，但仍须通过真实投影测试验证。

运行时代码高于本规格及历史审计。已冻结实验不能在原路径改写；修订后需要新的验证产物目录。

## Proposed contract

### Event semantics and validation

- An event MUST retain its explicit type, pitch, onset, duration, voice and tie facts. Temporal gaps MUST NOT create rest events during normalization, validation or export.
- A nonempty voice MAY contain leading, internal or trailing gaps within its measure duration. The containing measure MUST retain its declared duration and meter.
- A representable gap MUST produce a nonblocking `VOICE_TIME_GAP` warning. Readiness MUST NOT imply note completeness or source correctness.
- Negative onsets, nonpositive durations, unsafe rational arithmetic, event ends beyond measure duration, overlaps and unequal-duration chord members MUST remain blocking.
- An explicitly present empty voice MUST remain blocked rather than becoming an accepted empty stream. This change MUST NOT invent voices or notes for empty measures.
- Out-of-measure timing MUST use a blocking `EVENT_OUTSIDE_MEASURE` diagnostic; an empty voice MUST use `EMPTY_VOICE`. Existing blocking diagnostics already stored in a Draft MUST NOT be silently discarded.
- Tie validation MUST retain exact endpoint continuity. A gap between tie endpoints MUST NOT become acceptable merely because an untied voice gap is representable.

### Export and projection

- Export MUST preserve the note and explicit-rest multisets, including staff, voice, onset, duration, pitch and supported tie/tuplet facts.
- Each emitted voice stream MUST advance to the measure end before a full-measure backup is emitted for the next stream. Trailing advancement MUST use `forward`, never a fabricated rest.
- Leading/internal advances MUST continue to use `forward`; complete existing voice streams MUST NOT receive zero-length advances.
- Multi-staff export MUST correctly reset the shared MusicXML cursor when the preceding voice ends early.
- Harmony projection MUST preserve exact note offsets and durations without generating notes or rests for gaps.
- Missing notes and extra rests MUST remain visible in symbolic metrics. Benchmark MUST NOT add a work-specific readiness bypass.

### Unchanged behavior

- LEGATO gap filling and its `IMPLICIT_REST_FILL` warnings MUST remain unchanged in this change. Removing or distinguishing that policy requires separate approval and evaluation.
- Model configuration, source PDFs/MXLs, already accepted candidate Drafts, canonical metric definitions and default candidate-selection behavior MUST remain unchanged.
- Existing schema version and the note/rest event union MUST remain unchanged. New dependencies, persisted fields and transport changes are out of scope.

## 实现边界与现有技术栈

采用现有 TypeScript、Zod、Vitest 及精确有理数运算，不添加库。遵循 named exports、双引号、kebab-case 文件名，测试置于相邻 `__tests__`。
使用 `addRational`、`compareRational`，不把时间转换成浮点数后比较。

```ts
const end = addRational(event.onset, event.duration);
if (compareRational(end, measure.duration) > 0) {
  // Gaps are representable; events extending beyond the bar are not.
  add(diagnostics, "EVENT_OUTSIDE_MEASURE", message);
}
```

该片段仅示意风格；最终接口以运行时代码为准。复杂约束写简短原因注释；可选字段不存在时省略，不生成 `undefined` payload。

| 位置                                                                  | 预期职责                                              |
| --------------------------------------------------------------------- | ----------------------------------------------------- |
| `tools/pdf-omr-cli/src/validate-draft.ts`                             | 区分可表示空白与越界/重叠等错误，保留 tie 与精度门禁  |
| `tools/pdf-omr-cli/src/generate-musicxml.ts`                          | 声部尾部以 forward 对齐游标，避免影响后续声部         |
| `tools/pdf-omr-cli/src/__tests__/validate-draft.test.ts`              | 新边界测试；拆分原来将 overlap 与短声部混在一起的断言 |
| `tools/pdf-omr-cli/src/__tests__/generate-musicxml.test.ts`           | 前段、内部、尾部空白及多声部/多谱表导出               |
| `tools/pdf-omr-cli/src/__tests__/project-harmony.test.ts`             | 精确 tick 投影，不补事件                              |
| `tools/pdf-omr-cli/src/__tests__/musicxml-structural-compare.test.ts` | 新导出与原 Draft 事件结构一致                         |
| `tasks/` 中的新验证脚本及新 development 输出目录                      | 新协议下重新归一化参考、记录真实计数，保留旧冻结证据  |
| Desktop/Remote PDF OMR Feature Contracts、CLI README                  | 验证后更新准入语义和剩余限制，不把本规格提前写成现状  |

实现顺序和任务拆分在规格获批后制定；不得先改 validator 再靠随后修 exporter 恢复安全性。

## 验收策略

先编写能够在当前实现上失败的行为测试，再联合实现校验和游标改动。现有 overlap/tie 测试不能删除；语义有意变化的旧断言需改为分别检验 gap warning 与真正的 blocking 错误。

Acceptance criteria:

1. All six hand-authored audit inputs MUST retain their original note/rest events. The four sparse cases MUST export without padding rests; the two rest controls MUST remain unchanged.
2. Tests MUST include leading, internal and trailing gaps; a short voice followed by another voice; a short staff followed by another staff; and multiple gaps in one stream.
3. Tests MUST reject negative/zero timing, unsafe denominators, past-measure ends, overlapping notes, unequal-duration chords, empty voices and discontinuous ties.
4. Each accepted sparse case MUST pass normal CLI export, parse, view/playback capability checks, structural round-trip and exact Harmony projection. Passing an adapter capability check MUST NOT be reported as a manual UI or audio test.
5. Current score-4 and score-9 rhythm-tail candidate note/rest and adjusted strict counts MUST remain unchanged; both MUST still export and pass round-trip. Artifact bytes MUST NOT be overwritten.
6. Original K280 and K331 MXL MUST be re-normalized under a new frozen protocol. Their note/rest events MUST equal the previous canonical reference events. Remaining blocking diagnostics MUST be reported, not ignored; admission MUST NOT be assumed in advance.
7. If either real reference remains blocked, its failure MUST NOT be represented as recognition regression or fixed by editing reference events. No new model inference is part of this implementation.
8. Product verification MUST include shared CLI checks and host regression checks proportional to the changed readiness behavior. Current Feature Contracts MUST be updated only after verification.

对照基线取自 `legato-rhythm-tail-v1-20260914`：score-4 主音符 745/35/38、休止符 104/5/10、strict joint 839/50/58、有效小节 165/184；score-9 主音符 180/2/6、休止符 14/2/2、strict joint 164/34/38、有效小节 28/40。
这些数字用于表示层不回归检查，不是独立作品泛化证明。

## 验证命令

在仓库根目录执行，以下为实现阶段需要使用的现有命令，不代表本轮已运行全部检查。

```sh
rtk proxy pnpm exec vitest run tools/pdf-omr-cli/src/__tests__/validate-draft.test.ts tools/pdf-omr-cli/src/__tests__/generate-musicxml.test.ts tools/pdf-omr-cli/src/__tests__/project-harmony.test.ts tools/pdf-omr-cli/src/__tests__/musicxml-structural-compare.test.ts tools/pdf-omr-cli/src/__tests__/draft-gap-fill.test.ts
rtk proxy pnpm --filter ./tools/pdf-omr-cli test
rtk proxy pnpm --filter ./tools/pdf-omr-cli typecheck
rtk proxy pnpm verify:fast
rtk proxy pnpm verify
rtk proxy pnpm verify:e2e
rtk proxy pnpm format:check
rtk proxy pnpm check:docs
rtk proxy git diff --check
```

新参考/候选验证脚本及其命令在获批后的执行计划中冻结，不重跑或修改旧脚本来覆盖已保存结果。Host 检查缺少环境时须说明具体未覆盖项，不能以 CLI 测试替代全部 UI 验证。

## 权限与停止边界

- Always: preserve user work, original sources, exact event facts and frozen artifacts; test the complete validation/export path; report evidence and remaining gaps.
- Ask first: approve this shared contract before implementation; separately approve changing LEGATO gap-fill defaults, adding dependencies or schemas, modifying transport, or promoting recognition defaults.
- Never: bypass readiness for named works, pad reference rests to improve admission, rewrite failed experiment evidence, or claim representation readiness as recognition gain.

本轮仅完成规格与影响面核对。已运行上列第一条 focused Vitest 命令：5 个文件、22 项全部通过，证明当前基线可复现，不证明目标行为已实现。
使用规格驱动开发技能保留人工审核门槛；中文技术写作规范用于区分当前事实、拟议契约和未执行的验收。等待规格确认后再进入计划、任务拆分及实现。
