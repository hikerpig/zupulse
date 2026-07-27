# Harmony Analysis Performance Optimization Plan

> **Status:** in progress
>
> **Implementation rule:** Execute one task at a time. Preserve the exact production Semi-CRF result and rerun
> the checkpoint before continuing. Do not start the WASM branch unless Task 7 reaches its decision gate.

**Goal:** 在不改变 paper-compatible Semi-CRF 的 exact decoder、feature semantics、primary chord、
boundary、alternatives 或 confidence 语义的前提下，把 `K331-3_reviewed.mxl` 的生产 Harmony
Analysis 推理从约 28 秒降到 5 秒以内，同时消除 Renderer 主线程长时间阻塞并让取消真正停止计算。

**Architecture:** 保留 `@zupulse/web-core` 中唯一的 TypeScript 生产分析入口，先把当前以
string/object/Map 为中心的 segment feature pipeline 编译为紧凑的 numeric scorer，再用 range
prefix evidence、共享 figuration evidence 和低分配数据结构减少近百万次重复工作。分析任务通过
Worker boundary 在 Browser 与 Desktop Renderer 后台运行；Worker 只改变执行位置，不改变领域结果。
完成 TypeScript 优化并重新 profile 后，只有仍无法达到预算且剩余热点适合连续数值内核时，才进入
Rust/WASM spike 与 ADR 决策。

**Primary language and stack:** TypeScript、Vitest、Vite Worker、Node CPU profiler；条件分支才使用
Rust/WASM。

## 1. Baseline and diagnosis

2026-07-27 在当前开发机对生产入口执行：

```bash
/usr/bin/time -l pnpm -s harmony:cli inspect \
  test-fixtures/musicxml/K331-3_reviewed.mxl \
  --view result
```

记录结果：

| Metric                   |                            Baseline |
| ------------------------ | ----------------------------------: |
| Wall time                |                           `27.87 s` |
| Maximum RSS              | `516,849,664 bytes`（约 `493 MiB`） |
| Pitched notes            |                             `1,607` |
| Basic events             |                               `793` |
| Segment-label potentials |                           `971,540` |
| Output segments          |                               `121` |

同一生产入口的 Node CPU profile：

| Self-sample group            |       Time |   Share |
| ---------------------------- | ---------: | ------: |
| `paper-semi-crf-features.ts` | `25.314 s` | `92.1%` |
| `paper-semi-crf-decode.ts`   |  `0.241 s` |  `0.9%` |
| Garbage collector            |  `0.857 s` |  `3.1%` |
| Other                        |  `1.076 s` |  `3.9%` |

最显著的单函数热点是 `scoreNamedFeatures`、`notesWithoutFiguration`、
`extractPaperSemiCrfSegmentFeatures`、`notesInSegment`、`weightedBassBin` 和 `isHarmonic`。因此，
只把 decoder 搬到 WASM 的理论收益不到 1%，不能作为第一步。

## Implementation progress

### 2026-07-27: Tasks 1–2 complete

- Task 1 delivered the explicit `pnpm benchmark:harmony` performance gate, versioned JSON report, K331 golden
  checksum and CLI/unit coverage. The harness runs with exposed GC between untimed samples so repeated lattice
  allocations do not invalidate later measurements.
- Task 2 replaced production feature-name construction and string weight lookup with compiled numeric tables.
  The named provider remains the strict reference oracle.
- K331 cold analysis improved from `27,567.80 ms` to `19,662.81 ms` (`28.7%` faster in the recorded single-run
  comparison). Maximum RSS changed from approximately `456.9 MB` to `391.8 MB`.
- The canonical K331 result remains
  `9b0d56e25913116c1a44b460432280a681dc6dcfc2ed9812ab3c3178bb927ff0`.
- The former `scoreNamedFeatures` hotspot disappeared. Current hotspots are `notesWithoutFiguration`,
  `collectPaperSemiCrfSegmentFeatures`, `weightedBassBin`, `notesInSegment` and `isHarmonic`, supporting the
  planned Task 3/4 range-evidence work.
- Verification completed: all 112 `packages/web-core/src/harmony` tests, all 60 Harmony CLI tests, web-core and
  Harmony CLI typechecks, Prettier and `git diff --check`.

### 2026-07-27: Tasks 3–4 and Checkpoint A

- Task 3 added label-independent range evidence and bounded its cache to the decoder's current `endEvent`;
  at most 20 ranges remain live while all 62 labels reuse them.
- Task 4 added numeric figuration evidence plus `(event, chordMask, boundaryContext)` retained-note caching.
  Singleton bass evidence is shared across every containing range; event-local retained notes use a compact
  bitmask for ordinary polyphony.
- Five isolated, one-warm-up K331 samples were:
  `10,361.32 / 9,434.84 / 9,355.62 / 10,692.32 / 10,153.46 ms`. Median was `10,153.46 ms`; maximum RSS was
  `491,470,848 bytes`.
- All five samples produced 121 segments and canonical checksum
  `9b0d56e25913116c1a44b460432280a681dc6dcfc2ed9812ab3c3178bb927ff0`.
- Compared with the original `27.87 s` baseline, Checkpoint A is approximately `2.75×` faster, but it does not
  meet the `5,000 ms` required gate.
- The latest CPU profile attributes approximately `0.05 s` self time to the factorized decoder. Task 5 is
  therefore skipped: compacting decoder state cannot provide meaningful end-to-end speedup under its measured-need
  gate.
- The root benchmark uses isolated sample processes because repeated high-RSS V8 runs were terminated in the Codex
  execution environment even after explicit GC. Each reported sample has an independent RSS lifecycle and performs
  its own configured warm-up.

### 2026-07-27: Task 6 implementation

- Added a strict, versioned Worker request/response protocol containing only validated Harmony domain input,
  analysis parameters, segments and stable error codes.
- Browser and Desktop now run Studio analysis through the same module Worker. `AbortSignal` cancellation,
  replacement analysis and session disposal terminate the underlying Worker; the existing intent check remains
  the final stale-result guard.
- The client rejects malformed Worker output without exposing payloads or raw exceptions. Non-browser test/SSR
  execution retains a direct reference runner; production Browser/Desktop bundles always select the Worker path.
- Worker client and session tests pass (`11/11`), all web-viewer tests pass (`63/63`), and web-viewer typecheck
  passes.
- Browser and Desktop Rspack builds pass and emit dedicated `zupulse-harmony-analysis.*.js` Worker chunks. Manual
  K331 responsiveness/cancellation verification remains part of Checkpoint B.

### 2026-07-27: Checkpoint B in progress

- Fresh isolated K331 samples were
  `8,965.93 / 9,041.33 / 9,085.39 / 9,902.86 / 9,267.74 ms`; median was `9,085.39 ms`, maximum RSS was
  `487,718,912 bytes`, and every run retained 121 segments plus the canonical checksum.
- `pnpm verify:fast` passes: 140 test files and 618 tests, including all web-core, web-viewer and Harmony CLI
  suites. Browser/Desktop production builds and formatting checks pass.
- A Browser K331 run loaded the dedicated Worker and completed without replacing or blocking rendering of the
  Studio document. The browser automation transport serializes an awaited click handler, so it cannot provide
  trustworthy sub-50-ms interaction timing or an analysis-in-flight cancel click; those items remain open rather
  than being inferred from unit tests.
- The fresh CPU profile assigns `44.4%` to `paper-semi-crf-features.ts`, `33.7%` to
  `paper-semi-crf-figuration-evidence.ts`, `3.0%` to range evidence, and `1.4%` to the decoder. Although the first
  two files dominate, their current boundary still traverses `ReadonlySet`, note objects, callbacks and every
  event in every range. Task 7 therefore does not yet have the required clean typed-array kernel boundary.
- Before deciding on WASM, the remaining intended TypeScript prefix-evidence optimization will remove this
  repeated range scan. A new profile will then either close the 5-second gap or provide the clean kernel evidence
  required by the WASM gate.

## 2. Non-negotiable constraints

- Production 必须继续在完整 62-label inventory 和最长 20 events span 上运行 exact
  factorized semi-Markov Viterbi。
- 优化前后，相同输入、scope、model、`topK` 与 `decisionThreshold` 的 serialized
  `HarmonySegment[]` 必须完全一致；不得用 epsilon、重新排序或近似 tie-break 掩盖差异。
- `BUNDLED_PAPER_SEMI_CRF_ALGORITHM_VERSION` 不变，因为本计划不改变模型或算法语义。
- 不允许 label pruning、beam search、short-score fallback、分段近似或静默降级。
- Semi-CRF path 继续独占 primary chord 与 boundary；alternatives/confidence 只能在冻结 range
  上工作。
- Browser 与 Desktop 必须使用相同 analyzer、model 和 Worker protocol，不得形成宿主特有算法。
- Worker 消息只包含结构化领域输入、分析参数、结果与稳定错误码；不得传 alphaTab runtime、
  repository、绝对路径、DOM object 或 raw exception。
- 每个优化必须先有等价性测试，再单独落地并重新 benchmark。不能把多项性能改动合并成一次无法归因
  的提交。
- 不新增依赖，除非已有平台 API 与当前依赖无法提供所需能力，并先记录证据。

## 3. Performance contract

### Required gate

在同一开发机、同一 Node major version、连接电源且无其他重负载的条件下：

- 先完成一次不计入结果的 warm-up。
- 对已经完成 MusicXML projection 的同一 `HarmonyAnalysisInput` 连续运行 5 次生产
  `analyzeHarmony`。
- `K331-3_reviewed.mxl` analysis-only median 必须 `<= 5,000 ms`。
- 5 次输出 checksum 必须一致，并与 baseline golden checksum 一致。
- 峰值 RSS 不得高于 `493 MiB` baseline；目标是 `<= 256 MiB`，但该目标不允许以牺牲 exactness
  达成。
- Browser 与 Desktop 的 Renderer 单次长任务不得连续阻塞主线程超过 `50 ms`；分析期间 UI 必须
  可以响应取消、导航和重绘。

Benchmark report 必须记录 commit、平台、CPU、Node version、warm-up、5 次原始时长、median、RSS、
event count、potential count、segment count 与 result checksum。不得只记录最优样本。

### Correctness gate

- 当前 Harmony unit tests 与 CLI tests 全部通过。
- K331 production result 的完整 canonical JSON checksum 不变。
- 小型 tie-break fixtures 的 segments 与 path score 不变。
- `decisionThreshold` 改变时仍只能改变 resolved/unresolved，不能改变 path、range 或 primary。
- Worker 与直接调用必须返回完全相同的结果或相同稳定错误码。

## 4. Dependency graph

```text
Task 1 benchmark + exactness oracle
  └─ Task 2 numeric weight tables
       └─ Task 3 range prefix evidence
            └─ Task 4 figuration evidence + allocation reduction
                 └─ Task 5 conditional decoder storage optimization

Task 1 serializable job contract
  └─ Task 6 Worker execution + true cancellation

Tasks 2–6
  └─ Task 7 full checkpoint + WASM decision gate
       ├─ target met → Task 8 documentation closeout
       └─ target missed → Task 7B Rust/WASM spike + ADR decision
```

Tasks 2–4 must remain sequential because they modify the same feature semantics and performance evidence.
Task 6 may begin after Task 1 once the job contract is frozen, but its integration must be rebased on the final
analyzer API before the full checkpoint.

---

### Task 1: Reproducible benchmark and exactness oracle

**Description:** 建立不进入普通快速测试的 K331 benchmark、canonical result checksum 和机器可读
report。补充小型 fixture 的 scorer/path 等价性测试，使后续每个性能改动都能证明结果没有变化。

**Files likely touched:**

- Create: `scripts/benchmark-harmony-analysis.mjs`
- Modify: `scripts/README.md`
- Modify: `package.json`
- Modify: `packages/web-core/src/harmony/__tests__/analyzePaperSemiCrf.test.ts`
- Modify: `packages/web-core/src/harmony/__tests__/paper-semi-crf-decode.test.ts`

**Acceptance criteria:**

- [ ] `pnpm benchmark:harmony` 输出第 3 节定义的 JSON report，并区分 parse/projection 与
      analysis-only 时间。
- [ ] Benchmark 验证 5 次 canonical result checksum 一致，且 baseline fixture checksum 受版本控制。
- [ ] 小型 tests 锁定 segment score、transition score、path score、tie-break 和最终 segments。

**Verification:**

```bash
pnpm vitest run \
  packages/web-core/src/harmony/__tests__/analyzePaperSemiCrf.test.ts \
  packages/web-core/src/harmony/__tests__/paper-semi-crf-decode.test.ts
pnpm benchmark:harmony
```

**Dependencies:** None  
**Estimated scope:** Medium

### Task 2: Compile string features into numeric weight tables

**Description:** 保留现有 named feature provider 作为训练、检查和等价性 reference，但让 production
factorized scorer 在初始化时把 dictionary 编译成固定 numeric tables。Segment hot path 不再创建
feature strings 或逐项执行 `Map<string, number>` lookup；transition 在初始化时编译成 `62 × 62`
numeric matrix。

**Files likely touched:**

- Modify: `packages/web-core/src/harmony/paper-semi-crf-features.ts`
- Create: `packages/web-core/src/harmony/paper-semi-crf-compiled-weights.ts`
- Create: `packages/web-core/src/harmony/__tests__/paper-semi-crf-compiled-weights.test.ts`
- Modify: `packages/web-core/src/harmony/__tests__/paper-semi-crf-features.test.ts`

**Acceptance criteria:**

- [ ] 对所有 bundled labels、feature bins 和 transition pairs，numeric scorer 与 named reference
      score 使用严格相等断言。
- [ ] Production segment hot path 不构造 feature name strings，不执行 feature-name Map lookup。
- [ ] K331 checksum 不变，并单独记录 Task 2 前后 median 与 profile。

**Verification:**

```bash
pnpm vitest run packages/web-core/src/harmony/__tests__/paper-semi-crf-compiled-weights.test.ts \
  packages/web-core/src/harmony/__tests__/paper-semi-crf-features.test.ts
pnpm benchmark:harmony
```

**Dependencies:** Task 1  
**Estimated scope:** Medium

### Task 3: Precompute range evidence with prefix summaries

**Description:** 为每个 event 预计算 pitch-class count、duration、accent、onset、bass 与 coverage
evidence，并用 prefix arrays 在常数或固定 12-pitch-class 成本内取得 `[startEvent, endEvent)` 汇总。
同一 range 的 label-independent evidence 只构建一次，不再为 62 个 labels 重复
`slice/flatMap/filter/reduce`。

**Files likely touched:**

- Create: `packages/web-core/src/harmony/paper-semi-crf-range-evidence.ts`
- Create: `packages/web-core/src/harmony/__tests__/paper-semi-crf-range-evidence.test.ts`
- Modify: `packages/web-core/src/harmony/paper-semi-crf-features.ts`
- Modify: `packages/web-core/src/harmony/__tests__/paper-semi-crf-features.test.ts`

**Acceptance criteria:**

- [ ] 对单 event、held notes、跨 event sustain、不同 metric accent 和最长 20-event range，prefix
      evidence 与 reference scanner 严格一致。
- [ ] Label-independent range evidence 的构建次数与合法 ranges 数量同阶，而不是 ranges × labels。
- [ ] K331 checksum 不变；profile 显示 `notesInSegment`、coverage 与 bass 重复扫描显著下降。

**Verification:**

```bash
pnpm vitest run packages/web-core/src/harmony/__tests__/paper-semi-crf-range-evidence.test.ts \
  packages/web-core/src/harmony/__tests__/paper-semi-crf-features.test.ts
pnpm benchmark:harmony
```

**Dependencies:** Task 2  
**Estimated scope:** Medium

### Task 4: Share figuration evidence and remove hot-path allocation

**Description:** 将 `notesWithoutFiguration` 的上下文判断拆成可复用 evidence，按
`(startEvent, endEvent, chordPitchClassMask)` 共享；用 12-bit mask、numeric arrays 和索引边界替代
临时 `Set`、`Map`、string key、events slice 和 note arrays。必须保留 passing/neighbor、
boundary context、spelling、held-note 与 reference multiplicity 语义。

**Files likely touched:**

- Create: `packages/web-core/src/harmony/paper-semi-crf-figuration-evidence.ts`
- Create: `packages/web-core/src/harmony/__tests__/paper-semi-crf-figuration-evidence.test.ts`
- Modify: `packages/web-core/src/harmony/paper-semi-crf-features.ts`
- Modify: `packages/web-core/src/harmony/__tests__/paper-semi-crf-features.test.ts`

**Acceptance criteria:**

- [ ] Reference 与 optimized figuration evidence 在现有 fixtures 和针对 passing/neighbor/boundary 的
      exhaustive small cases 上严格一致。
- [ ] Production hot path 不创建 range string cache key，不对 events 执行 `slice` 或 `flatMap`。
- [ ] K331 checksum 不变；CPU profile 中 feature file share、GC 与 RSS 均不高于 Task 3。

**Verification:**

```bash
pnpm vitest run packages/web-core/src/harmony/__tests__/paper-semi-crf-figuration-evidence.test.ts \
  packages/web-core/src/harmony/__tests__/paper-semi-crf-features.test.ts
pnpm benchmark:harmony
```

**Dependencies:** Task 3  
**Estimated scope:** Medium

### Checkpoint A: Feature pipeline

- [ ] Tasks 1–4 的 targeted tests 全部通过。
- [ ] `pnpm vitest run packages/web-core/src/harmony` 通过。
- [ ] K331 checksum 与 baseline 完全一致。
- [ ] 保存新的 CPU profile 与 benchmark report，并按 self time 重新排序热点。
- [ ] 如果 analysis-only median 已 `<= 5,000 ms`，Task 5 只在 decoder 或 memory 仍构成明确问题时执行。
- [ ] 如果结果不一致，停止性能工作并回到发生差异的首个 task，不叠加下一项优化。

### Task 5: Conditionally compact decoder state

**Description:** 只有 Checkpoint A 显示 decoder/state allocation 已成为显著热点，或 RSS 仍无法接受
时才执行。用 typed numeric arrays 保存 score、segment count、backpointer 和 label，预编译
transition matrix；保持当前 deterministic comparison 与完整 path tie-break。

**Files likely touched:**

- Modify: `packages/web-core/src/harmony/paper-semi-crf-decode.ts`
- Modify: `packages/web-core/src/harmony/__tests__/paper-semi-crf-decode.test.ts`
- Create: `packages/web-core/src/harmony/__tests__/paper-semi-crf-decode-equivalence.test.ts`

**Acceptance criteria:**

- [ ] Reference 与 compact decoder 对 exhaustive small lattices、随机固定种子 lattices 和 bundled
      scorer 输出完全相同的 score 与 segments。
- [ ] 不改变 label/span 搜索空间、transition semantics 或 tie-break。
- [ ] 只有 benchmark 显示 wall time 或 RSS 有可测收益时保留该实现；否则回退该 task。

**Verification:**

```bash
pnpm vitest run packages/web-core/src/harmony/__tests__/paper-semi-crf-decode.test.ts \
  packages/web-core/src/harmony/__tests__/paper-semi-crf-decode-equivalence.test.ts
pnpm benchmark:harmony
```

**Dependencies:** Checkpoint A and measured need  
**Estimated scope:** Small

### Task 6: Run analysis in a Worker with real cancellation

**Description:** 定义 serializable Harmony Analysis Job protocol，把 projection 后的
`HarmonyAnalysisInput` 和参数交给 Vite module Worker。Browser 与 Desktop Renderer 共用相同
worker client。新 job、取消、session dispose 或导航离开时终止旧 Worker，使 CPU 工作真正停止；
stale-result intent check 继续作为提交前的最后防线。

**Files likely touched:**

- Create: `packages/web-viewer/src/harmony-analysis-worker.ts`
- Create: `packages/web-viewer/src/harmony-analysis-worker-client.ts`
- Create: `packages/web-viewer/src/__tests__/harmony-analysis-worker-client.test.ts`
- Modify: `packages/web-viewer/src/app/ViewerApplication.ts`
- Modify: `packages/web-viewer/src/app/__tests__/ViewerApplication.test.ts`

如 Vite library build 不能从 package 内正确产出 Worker chunk，停止并先记录 bundling 证据，再决定由
Browser/Desktop composition root 注入 `HarmonyAnalysisRunner`；不得复制 worker 实现。

**Acceptance criteria:**

- [ ] Worker 与直接调用对相同输入返回完全相同的 segments。
- [ ] Browser 与 Desktop build 都包含可加载的 Worker chunk，不依赖 Node/Electron API。
- [ ] 取消、替代 job 和 dispose 会终止实际计算；被终止或 stale job 不保存 Document。
- [ ] 分析期间 Renderer 可响应事件，单次主线程同步工作不超过 `50 ms`。
- [ ] Worker error 映射为稳定产品错误，raw exception 不进入 DOM 或持久化数据。

**Verification:**

```bash
pnpm vitest run packages/web-viewer/src/__tests__/harmony-analysis-worker-client.test.ts \
  packages/web-viewer/src/app/__tests__/ViewerApplication.test.ts
pnpm --filter @zupulse/web-demo build
pnpm --filter @zupulse/desktop-shell build
```

随后在 Browser 与 Desktop 分别手动验证 K331：开始分析、交互、取消、重新分析、离开 Studio。

**Dependencies:** Task 1; integrate after the final analyzer API from Tasks 2–5  
**Estimated scope:** Medium

### Checkpoint B: Product behavior and full performance gate

- [ ] `pnpm vitest run packages/web-core/src/harmony` 通过。
- [ ] `pnpm vitest run packages/web-viewer/src` 通过。
- [ ] `pnpm --filter @zupulse/harmony-cli test` 通过。
- [ ] `pnpm benchmark:harmony` 满足第 3 节 required gate。
- [ ] Browser/Desktop Worker cancellation 和 responsiveness 人工验证通过。
- [ ] `pnpm verify:fast`、`pnpm format:check` 与 `git diff --check` 通过。

### Task 7: WASM decision gate

**Description:** 根据 Checkpoint B 的 fresh profile 做明确决策，不因已有投入或语言偏好进入 WASM。

#### Decision: Do not use WASM

满足以下任一条件时关闭 WASM 分支：

- TypeScript analysis-only median 已 `<= 5,000 ms`；或
- 剩余主要时间在 MusicXML/alphaTab projection、Worker startup、alternatives 等非连续 numeric
  kernel；或
- profile 无法支持 WASM 达成足够的端到端收益。

记录“不使用 WASM”的测量依据后直接进入 Task 8。

#### Decision: Start Task 7B WASM spike

只有同时满足以下条件才进入 spike：

- TypeScript exact implementation 仍超过 `5,000 ms`；
- 同一个边界清晰、可用 typed arrays 表达的 feature/decoder kernel 占剩余 CPU 至少 `40%`；
- Amdahl estimate 表明该 kernel 即使计入 serialization 与 instantiation 仍可能使端到端达到目标；
- Browser 与 Desktop 的 CSP、bundling、cache 和离线加载均可行。

**Acceptance criteria:**

- [ ] Decision note 包含 fresh benchmark、profile、Amdahl estimate、bundle/runtime constraints。
- [ ] 未满足全部 spike 条件时，不创建 Rust crate 或 WASM production path。

**Dependencies:** Checkpoint B  
**Estimated scope:** Small

### Task 7B: Conditional Rust/WASM spike

**Description:** 只移植 Task 7 识别的 numeric kernel，Worker 仍是唯一调用边界。TypeScript
implementation 保持 reference oracle；spike 不直接进入 production，不增加 silent fallback。

**Spike deliverables:**

- 一个不接入 production route 的最小 Rust/WASM kernel。
- Browser 与 Desktop Worker 中的 cold/warm benchmark。
- 全 fixture exact-equivalence report。
- WASM bytes、初始化时间、serialization cost、median、p95 与 RSS 对比。
- 一份 ADR proposal：adopt、reject 或 defer，并说明维护、调试、供应链和发布影响。

**Adoption gate:**

- [ ] 所有 correctness gates 完全一致。
- [ ] K331 端到端 analysis-only median 达到 `<= 5,000 ms`。
- [ ] 相比优化后的 TypeScript，端到端 median 至少再改善 `30%`；否则收益不足以承担双语言维护。
- [ ] Browser 与 Desktop 离线 build、加载、CSP 与错误处理验证通过。
- [ ] ADR accepted 后才能替换 production kernel；未 accepted 时删除 spike 产物。

**Dependencies:** Task 7 explicitly selects spike  
**Estimated scope:** Separate project; do not combine with Tasks 1–6

### Task 8: Documentation closeout

**Description:** 只在 observable behavior 和性能完成验证后更新 current sources of truth，并删除这份
一次性实施计划。未完成阶段继续留在计划中，不得把目标写成当前事实。

**Files likely touched:**

- Modify: `docs/features/contracts/harmony-analysis.md`
- Modify: `docs/architecture/harmony-analysis-system.md`
- Modify: `packages/web-core/docs/harmony.md`
- Modify: `docs/evaluation/semi-crf.md`
- Delete when complete: `docs/superpowers/plans/2026-07-27-harmony-analysis-performance-optimization.md`
- Conditional: create/update relevant ADR only if WASM is adopted or another durable boundary changes

**Acceptance criteria:**

- [ ] 文档记录实际 benchmark 环境、5 次样本、median、RSS、checksum 和 Worker cancellation 行为。
- [ ] Feature Contract 的已知性能 gap 按实测结果更新，不复制内部 benchmark implementation。
- [ ] Architecture 说明 Worker execution boundary；只有 accepted ADR 才把 WASM 写成 current。
- [ ] Durable constraints 已迁移后删除本计划，不留下已完成的一次性 task record。

**Verification:**

```bash
pnpm verify:fast
pnpm format:check
git diff --check
```

**Dependencies:** Checkpoint B; Task 7 or 7B decision complete  
**Estimated scope:** Small

## 5. Risks and mitigations

| Risk                                                    | Impact                    | Mitigation                                                                                 |
| ------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| Numeric scorer 改变 feature multiplicity 或浮点加法顺序 | High：可能改变 exact path | Named reference 保留为 oracle；逐 range/label strict equality；一次只改一层                |
| Prefix evidence 错误处理 held notes 或跨小节时间        | High：静默改变 feature    | 覆盖 first-event duration、sustain、measure boundary 和 maximum span fixtures              |
| Figuration cache key 不完整                             | High：不同上下文错误共享  | Key 明确包含 range 与 chord pitch-class mask；boundary context 从 immutable events 派生    |
| 大型 cache 用时间换内存，RSS 继续上升                   | Medium                    | 只保留有界 span 所需 numeric storage；benchmark RSS；禁止 string/object cache              |
| Worker bundling 在 package build 中产生宿主差异         | Medium                    | 先做 build proof；必要时由 composition root 注入 runner，但共享 protocol 与 implementation |
| Cancel 只隐藏结果、不停止 CPU                           | High：用户仍感到卡顿      | 以 worker termination/Abort evidence 为验收，不只断言 intent 变更                          |
| Benchmark 噪声导致错误结论                              | Medium                    | 同机、warm-up、5 次原始值、median、commit 与环境元数据                                     |
| 过早引入 WASM 增加双语言维护却无端到端收益              | High                      | Task 7 的 hotspot、Amdahl、30% incremental gain 与 ADR 四重门禁                            |

## 6. Explicit non-goals

- 不调整训练数据、model weights、label inventory、maximum span 或 confidence threshold。
- 不借性能项目改善 chord coverage 或 accuracy。
- 不把 analysis 放到在线服务、Electron Main、Python runtime 或平台特有 native module。
- 不改变 Harmony Analysis Document、Correction、Effective Projection、Repository CAS 或导出 schema。
- 不用 progressive/partial results 改写 Revision 原子提交语义。
- 不把“Worker 后台运行”报告成“推理已经更快”。
