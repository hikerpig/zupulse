---
status: implemented
---

# PDF OMR 跨引擎比较与布局实验

## Objective

为隔离的 `pdf-omr-cli` 增加 development-only、report-only 的跨引擎比较能力，先确定不同 engine 是否提供
互补识别证据，再决定是否值得实现候选选择或 reviewed repair。首个真实问题是 LEGATO 在当前 development
fixture 中稳定遗漏一个完整小节，而 Rokot 在同一输入上保留全部小节。

成功不等于把 development F1 调到 100%。成功意味着：不读取 ground truth、不修改任一 engine Draft，也能
确定性定位 measure insertion/deletion/content disagreement，并保留足够 provenance 供后续评测与人工复核。

第二阶段优化 LEGATO system-page continuation：上一 system 若产生显式、可解析的 ABC `L`、`M`、`K`
header，则把这些字段作为下一 system 的生成前缀，让模型在缺少重复拍号的视觉输入上延续谱面上下文。该行为只由
`legato-system-pages-context-v1` preprocess 启用，不根据 ground truth 或其他 engine 输出生成 context。

第三阶段在唯一、非歧义的小节 alignment 上生成 secondary-to-primary 的 report-only repair candidate。候选只表达
`insert`、`replace` 或 `delete`，其中 `insert`/`replace` 携带去除 engine event ID、confidence 与 source anchor
后的规范化小节事实及其 canonical hash。候选始终要求人工复核，不能自动应用；alignment ambiguity 时完全不生成
候选。

第四阶段用真实扫描 OLiMPiC system 验证候选泛化。对于 LEGATO `2 parts × 1 staff` 与 Rokot
`1 part × 2 staves` 的显式结构差异，只允许调用方选择 `ordered-staves` comparison view；默认 strict 模式继续
fail closed。候选评分必须同时检查 Pitch、Onset、Duration、Joint 与 valid measure rate，任何正负指标并存的结果
都分类为 `mixed`，不得 promotion。

## Commands

```bash
pnpm pdf-omr -- compare-engines \
  --primary <benchmark-run-dir> \
  --secondary <benchmark-run-dir> \
  --output <comparison-run-dir>

pnpm pdf-omr -- evaluate-repair-candidates \
  --comparison <comparison-run-dir> \
  --primary <benchmark-run-dir> \
  --output <evaluation-run-dir>

pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/engine-comparison.test.ts
pnpm --filter @zupulse/pdf-omr-cli typecheck
pnpm format:check
git diff --check
```

后续 system-crop ablation 必须使用新的 development 输出目录与明确的 preprocessing identity，不得改写当前
full-page benchmark report 或读取 holdout。

## Project structure

```text
tools/pdf-omr-cli/src/benchmark/engine-comparison.ts       pure comparison and schemas
tools/pdf-omr-cli/src/commands/compare-engines.ts          run artifact orchestration
tools/pdf-omr-cli/src/commands/evaluate-repair-candidates.ts  development-only simulated scoring
tools/pdf-omr-cli/src/benchmark/legato-system-pages.ts     development materialization
tools/pdf-omr-cli/src/benchmark/repair-candidate-evaluation.ts  in-memory candidate application
tools/pdf-omr-cli/src/raster-pdf.ts                        deterministic derived PDFs
tools/pdf-omr-cli/src/engines/legato-page-context.ts       validated ABC continuation prefix
tools/pdf-omr-cli/src/__tests__/engine-comparison.test.ts  deterministic alignment tests
tools/pdf-omr-cli/src/command.ts                           CLI routing
tools/pdf-omr-cli/docs/evaluation.md                       durable research contract
```

## Code style

```ts
const proposal = {
  kind: "measure-missing-in-primary" as const,
  primaryMeasureIndex: null,
  secondaryMeasureIndex,
  autoApplicable: false as const,
};
```

- Named exports、Oxfmt double quotes、`__tests__/*.test.ts`。
- Persisted reports MUST use strict Zod schemas and canonical JSON。
- Optional fields MUST be omitted instead of assigned `undefined`。
- Alignment MUST use normalized musical facts, never event IDs、absolute paths、raw exceptions or ground truth。

## Testing strategy

- Unit: identical sequences、middle insertion/deletion、content disagreement、ambiguous topology、deterministic output。
- Integration: two synthetic benchmark run directories produce a canonical comparison artifact without modifying inputs。
- Regression: existing benchmark、recognize、cancellation and frozen protocol behavior remain unchanged。
- Real development evidence: compare current LEGATO and Rokot runs and verify the known missing measure is reported。
- Context continuation: valid `L/M/K` is inherited; `M:none`、missing/duplicate/malformed fields fail closed to no prefix。

## Boundaries

- Always: immutable input runs, report-only proposals, engine/version/report hash provenance, fail-closed topology checks。
- Always: repair candidate targets primary Draft, uses only secondary Draft musical facts, and remains review-required。
- Always: context comes only from the immediately preceding LEGATO page and is recorded in decoder provenance。
- Ask first: App/Desktop/Bridge integration, dependency additions, automatic Draft selection or writeback。
- Never: use ground truth during runtime comparison, compare raw confidence across engines, read holdout for tuning, mutate
  engine artifacts, or claim product readiness from synthetic fixtures。

## Success criteria

1. `compare-engines` rejects runs from different corpus manifests or modes。
2. Equal Drafts report agreement without proposals。
3. A single missing middle measure is aligned as one `measure-missing-in-primary` proposal rather than many shifted note errors。
4. Content disagreements remain non-automatic and retain both measure fingerprints。
5. The current LEGATO/Rokot development runs produce three missing-measure proposals and no input mutation。
6. A development-only materializer emits deterministic system-page PDFs, a new manifest and provenance without reading
   holdout assets。
7. Focused tests、package typecheck、formatter and `git diff --check` pass after the final edit。
8. `legato-system-pages-context-v1` uses a validated previous-page ABC prefix, while `none` and
   `legato-system-pages-v1` preserve the current independent-page behavior。
9. The same three-item development corpus is rerun in a new output directory and reported without overwriting the baseline。
10. Unique alignments emit deterministic `insert`/`replace`/`delete` repair candidates; ambiguous alignments emit none。
11. Development-only candidate evaluation reports before/after metrics without writing a simulated Draft。
12. Ordered-staff topology is explicit, deterministic, and never inferred by the default comparison mode。
13. Evaluation reports `improved`、`regressed`、`mixed` or `unchanged` and a non-regression decision。

## Non-goals

- 本轮不自动选择 engine、不拼接 MusicXML、不写回 `OmrScoreDraft`；repair candidate 只存在于 comparison report。
- 本轮不按小节总时值缩放、补写或删除模型输出的 note durations。
- 本轮不实现第三 engine 投票、confidence calibration、LLM repair 或 App 集成。
- 不实现任意 profiled manifest 的 system-page 物化；当前 materializer 只接受非 profiled manifest，并只读取
  development full-page assets。

## Open questions

无。用户已批准先做 system-crop 与 report-only 跨引擎比较；本切片先交付后者的确定性基础。
