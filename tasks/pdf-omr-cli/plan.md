# Implementation Plan: PDF OMR CLI 与 Benchmark

## 状态

- Status: completed_pending_human_review
- Date: 2026-07-28
- Approved scope:
  `docs/superpowers/specs/2026-07-28-pdf-omr-cli-benchmark-spec.md`
- Roadmap:
  `docs/superpowers/plans/2026-07-28-pdf-omr-cli-benchmark.md`
- Execution checklist: `tasks/pdf-omr-cli/todo.md`

本计划只拆分 CLI、engine adapter、统一 Draft、MusicXML/和声投影与 benchmark。不得修改
`apps/*`、`packages/web-viewer`、Bridge、Repository、Library 或 UI。

## 实现约定

- 新工具位于 `tools/pdf-omr-cli`，参考 `tools/harmony-cli` 的 package、CLI、Zod 和 Vitest 模式。
- OMR 实验 schema 暂留在工具目录，不从 `@zupulse/web-core` 导出。
- CLI 复用 `@zupulse/web-core` 当前 `HarmonyAnalysisInput`、生产 analyzer 与 MusicXML adapter。
- 所有外部 process 由一个 cancellable runner 管理；adapter 不自行实现第二套 process lifecycle。
- 测试先于行为实现；每个任务完成后运行本任务最小验证。
- 新依赖进入 `package.json` 前必须完成 Task 04 的 backend/licence spike。
- 外部模型、语料、运行结果和大文件默认不提交；仓库只保存 manifest、hash、少量许可明确 fixtures
  和聚合报告。
- 每个任务目标不超过 5 个文件；发现超出时先更新本计划并继续拆分。

## 目标命令

```bash
pnpm pdf-omr -- --help
pnpm pdf-omr -- inspect <input.pdf> --output <run-dir>
pnpm pdf-omr -- recognize <input.pdf> --engine <engine-id> --output <run-dir>
pnpm pdf-omr -- validate <draft.json> --output <diagnostics.json>
pnpm pdf-omr -- analyze <draft.json> --output <harmony.json>
pnpm pdf-omr -- export-musicxml <draft.json> --output <score.mxl>
pnpm benchmark:pdf-omr -- --manifest <manifest.json> --engine <engine-id> --output <result-dir>
```

## 依赖图

```mermaid
flowchart TD
  T01["T01 Package scaffold"] --> T02["T02 CLI result and error contract"]
  T02 --> T03["T03 Artifact writer"]
  T02 --> T04["T04 PDF backend spike"]
  T02 --> T05["T05 Process runner"]
  T04 --> T06["T06 Inspect vertical slice"]
  T05 --> T07["T07 Audiveris adapter"]
  T07 --> T08["T08 Audiveris normalizer"]
  T03 --> T09["T09 Recognize vertical slice"]
  T06 --> T09
  T08 --> T09
  T09 --> T10["T10 Draft validator"]
  T10 --> T11["T11 Harmony projection"]
  T11 --> T12["T12 Analyze command"]
  T10 --> T13["T13 MusicXML generator"]
  T13 --> T14["T14 MusicXML round trip"]
  T14 --> T15["T15 Export command"]
  T02 --> T16["T16 Corpus protocol"]
  T10 --> T17["T17 Symbolic metrics"]
  T12 --> T18["T18 Harmony impact metrics"]
  T14 --> T19["T19 MusicXML and runtime metrics"]
  T16 --> T20["T20 Benchmark orchestration"]
  T17 --> T20
  T18 --> T20
  T19 --> T20
  T20 --> T21["T21 Neural engine selection"]
  T21 --> T22["T22 Neural adapter"]
  T22 --> T23["T23 Development benchmark"]
  T23 --> T24["T24 Freeze holdout protocol"]
  T24 --> T25["T25 Holdout run and decision"]
```

## Phase 0：CLI foundation

### Task 01：建立 `pdf-omr-cli` workspace package

**Progress:** Completed on 2026-07-28. 实际按 workspace/config 与 help command 两个 TDD 小步完成；
root `tsconfig.json` 和 `pnpm-lock.yaml` 作为 workspace integration 同步更新。

**Goal:** 建立可以 typecheck、test 和显示 help 的最小工具包，不加载 PDF 或模型。

**Acceptance criteria:**

- [ ] package 名为 `@zupulse/pdf-omr-cli`，包含 `cli`、`test`、`typecheck` scripts。
- [ ] `pnpm pdf-omr -- --help` 返回 exit code 0，stdout/stderr 不加载 engine。
- [ ] 根 package 只增加 `pdf-omr` 与 `benchmark:pdf-omr` 入口，不改变现有命令。

**Verification:**

```bash
pnpm --filter @zupulse/pdf-omr-cli typecheck
pnpm --filter @zupulse/pdf-omr-cli test
pnpm pdf-omr -- --help
```

**Dependencies:** None

**Files:**

- `tools/pdf-omr-cli/package.json`
- `tools/pdf-omr-cli/tsconfig.json`
- `tools/pdf-omr-cli/tsconfig.test.json`
- `tools/pdf-omr-cli/src/cli.ts`
- `package.json`

**Scope:** M

### Task 02：冻结 CLI result、error 与 artifact schemas

**Progress:** Completed on 2026-07-28. 23 个 Phase 0 tests 中覆盖 strict schemas、exit-code mapping 与
敏感 cause 不进入 canonical error JSON。

**Goal:** 用 strict Zod schema 定义 command envelope、exit code、run manifest、engine environment、
artifact hashes 与 `OmrScoreDraft v1`。

**Acceptance criteria:**

- [ ] invalid hash、unknown field、invalid rational、invalid status 和越界 confidence 被拒绝。
- [ ] optional fields 缺失时省略，不传 `undefined`。
- [ ] `INVALID_CLI_ARGUMENT` 到 `INTERRUPTED` 的 exit-code mapping 有单元测试。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/schemas.test.ts
pnpm --filter @zupulse/pdf-omr-cli typecheck
```

**Dependencies:** Task 01

**Files:**

- `tools/pdf-omr-cli/src/schemas.ts`
- `tools/pdf-omr-cli/src/errors.ts`
- `tools/pdf-omr-cli/src/__tests__/schemas.test.ts`
- `tools/pdf-omr-cli/src/__tests__/errors.test.ts`

**Scope:** M

### Task 03：实现 canonical artifact writer

**Progress:** Completed on 2026-07-28. canonical JSON、SHA-256、路径逃逸、重复 artifact、已有目录和
hash verification 均有测试。

**Goal:** 原子创建 run directory、写 canonical JSON、计算 SHA-256，并区分 partial 与 completed run。

**Acceptance criteria:**

- [ ] 已存在输出目录默认拒绝，任何文件不被覆盖。
- [ ] complete run 的 artifact hash 可从磁盘重新验证。
- [ ] failure/cancel 不生成伪造的 complete metrics 或 `completedAt`。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/artifact-writer.test.ts
```

**Dependencies:** Task 02

**Files:**

- `tools/pdf-omr-cli/src/canonical-json.ts`
- `tools/pdf-omr-cli/src/artifact-writer.ts`
- `tools/pdf-omr-cli/src/__tests__/canonical-json.test.ts`
- `tools/pdf-omr-cli/src/__tests__/artifact-writer.test.ts`

**Scope:** M

### Checkpoint A：Foundation

```bash
pnpm --filter @zupulse/pdf-omr-cli typecheck
pnpm --filter @zupulse/pdf-omr-cli test
pnpm pdf-omr -- --help
pnpm format:check
git diff --check
```

通过条件：

- [ ] CLI package、schemas 和 artifact writer 均可独立运行。
- [ ] 没有新增 PDF/OMR runtime dependency。
- [ ] 人工批准进入 PDF 与 engine spike。

## Phase 1：PDF inspect 与第一条 engine vertical slice

### Task 04：选择 PDF inspect/render backend

**Progress:** Completed on 2026-07-28. 选择 `pdfjs-dist@6.1.200`；以 Poppler 作为开发期独立对照，
因许可证风险排除 PyMuPDF/MuPDF。spike 覆盖 vector、raster、mixed、protected 与 malformed 输入，
并记录渲染结果、hash、体积和运行环境。

**Goal:** 用一次性 spike 比较 Node PDF backend 与外部 process 方案，记录功能、许可证、安装体积、
vector metadata、raster render 和 cancellation 结果。

**Acceptance criteria:**

- [ ] 至少比较 PDF.js 路线与一个可行替代方案。
- [ ] 使用 vector、raster、mixed、encrypted、malformed 五类 smoke inputs。
- [ ] 在 `tools/pdf-omr-cli/docs/pdf-backend-decision.md` 给出唯一选择和未选理由。

**Verification:**

```bash
pnpm exec prettier --check tools/pdf-omr-cli/docs/pdf-backend-decision.md
git diff --check
```

**Dependencies:** Task 02

**Files:**

- `tools/pdf-omr-cli/spikes/pdf-backend.mts`
- `tools/pdf-omr-cli/docs/pdf-backend-decision.md`
- `tools/pdf-omr-cli/spikes/fixtures/manifest.json`

**Scope:** M

### Task 05：实现 cancellable external process runner

**Progress:** Completed on 2026-07-28. 共用 runner 已覆盖成功、缺失 executable、非零退出、timeout、
bounded output、AbortSignal 与忽略 SIGTERM 后的强制终止；canonical error 不包含 raw stderr。

**Goal:** 提供所有 OMR adapter 共用的 spawn、timeout、bounded capture、AbortSignal 和 process-tree
termination。

**Acceptance criteria:**

- [ ] success、missing executable、non-zero exit、timeout、overflow 和 cancel 可区分。
- [ ] AbortSignal 实际终止 owned process tree，P95 cancel latency 可测量。
- [ ] canonical result 不包含本机绝对路径或 raw stderr。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/engine-runner.test.ts
```

**Dependencies:** Task 02

**Files:**

- `tools/pdf-omr-cli/src/engine-runner.ts`
- `tools/pdf-omr-cli/src/resource-metrics.ts`
- `tools/pdf-omr-cli/src/__tests__/engine-runner.test.ts`
- `tools/pdf-omr-cli/src/__tests__/fixtures/fake-engine.mjs`

**Scope:** M

### Task 06：交付 `inspect` vertical slice

**Progress:** Completed on 2026-07-28. `inspect` 延迟加载 PDF.js，写入 canonical `input.json`，记录
basename、SHA-256、page dimensions 和 vector/raster operator signals；malformed/encrypted 输入映射为
稳定 `INVALID_INPUT` reason。

**Goal:** 让 CLI 对单个 PDF 输出 hash、page count、encryption、renderability 与 page-level
vector/raster signals。

**Acceptance criteria:**

- [ ] 五类 smoke inputs 返回稳定 result 或稳定 error code。
- [ ] 相同 PDF 重复 inspect 产生相同 canonical payload。
- [ ] report 只记录逻辑文件名和 content hash，不记录绝对路径。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/inspect-pdf.test.ts
pnpm pdf-omr -- inspect <smoke.pdf> --output <temp-dir>
```

**Dependencies:** Tasks 03, 04

**Files:**

- `tools/pdf-omr-cli/src/inspect-pdf.ts`
- `tools/pdf-omr-cli/src/commands/inspect.ts`
- `tools/pdf-omr-cli/src/command.ts`
- `tools/pdf-omr-cli/src/__tests__/inspect-pdf.test.ts`

**Scope:** M

### Task 07：实现 Audiveris process adapter

**Progress:** Completed on 2026-07-28. adapter 通过共用 runner 执行 environment inspection 与 batch
recognition，记录版本、command template 和许可证 metadata，并读取 raw MXL/OMR artifacts。fake
executable 测试覆盖成功、缺失 executable 和 cancel；本任务不要求本机安装 Audiveris。

**Goal:** 完成 environment inspection 与 Audiveris batch invocation，保存原始 MXL/OMR artifact 和
可复现参数，不做 Draft normalization。

**Acceptance criteria:**

- [ ] `inspectEnvironment()` 记录 executable version、command template 与许可证 metadata。
- [ ] recognize 通过共用 runner 处理 timeout/cancel/crash。
- [ ] 缺失 Audiveris 时返回 `ENGINE_UNAVAILABLE`，测试不要求开发机安装。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/audiveris-adapter.test.ts
```

**Dependencies:** Tasks 05, 06

**Files:**

- `tools/pdf-omr-cli/src/engines/types.ts`
- `tools/pdf-omr-cli/src/engines/audiveris.ts`
- `tools/pdf-omr-cli/src/__tests__/audiveris-adapter.test.ts`
- `tools/pdf-omr-cli/src/__tests__/fixtures/fake-audiveris.mjs`

**Scope:** M

### Task 08：实现 Audiveris MusicXML normalizer

**Progress:** Completed on 2026-07-28. normalizer 通过 current `web-core` MXL preflight 解包 score root，
再解析 part/staff/measure/voice/note/rest/tie/tuplet/repeat。缺失 divisions、time、timing 或 pitch 产生
blocking diagnostic；没有 geometry 时不伪造 `SourceAnchor`。plain MusicXML 与真实 MXL container
均有测试。

**Goal:** 把 Audiveris 生成的 MusicXML/MXL 转成 `OmrScoreDraft`，不把 parser 默认值冒充识别事实。

**Acceptance criteria:**

- [ ] part/staff/measure/voice/note/rest/tie/tuplet/repeat 的支持范围有 fixture。
- [ ] missing/ambiguous facts 生成 diagnostic，不静默填充。
- [ ] 每个 normalized note 至少可追溯到 measure/staff/voice；无 geometry 时省略 `SourceAnchor`。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/audiveris-normalizer.test.ts
```

**Dependencies:** Tasks 02, 07

**Files:**

- `tools/pdf-omr-cli/src/normalizers/audiveris.ts`
- `tools/pdf-omr-cli/src/normalizers/musicxml-source.ts`
- `tools/pdf-omr-cli/src/__tests__/audiveris-normalizer.test.ts`
- `tools/pdf-omr-cli/src/__tests__/fixtures/audiveris-output.mxl`

**Scope:** M

### Task 09：交付 `recognize --engine audiveris`

**Progress:** Completed on 2026-07-28. `recognize` 已串联 inspect、engine registry、Audiveris、
normalizer 和 artifact writer，成功 run 写入 input、environment、raw MXL/OMR、Draft、diagnostics 与
manifest hashes。重复 run 的 Draft hash 稳定，engine crash 不提交 succeeded manifest。使用 fake
Audiveris 完成 CLI smoke；Checkpoint B 的三份真实 Audiveris Draft 人工抽查仍待准备实际 engine 与
corpus。

**Goal:** 串联 inspect、artifact writer、Audiveris adapter 和 normalizer，形成第一条 PDF → Draft
端到端命令。

**Acceptance criteria:**

- [ ] success run 包含 manifest、raw artifact、draft 和 diagnostics hashes。
- [ ] cancel/crash/malformed output 不提交 succeeded run。
- [ ] 同一 smoke PDF 重复运行产生相同 Draft hash。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/recognize-command.test.ts
pnpm pdf-omr -- recognize <smoke.pdf> --engine audiveris --output <temp-dir>
```

**Dependencies:** Tasks 03, 06, 08

**Files:**

- `tools/pdf-omr-cli/src/commands/recognize.ts`
- `tools/pdf-omr-cli/src/engine-registry.ts`
- `tools/pdf-omr-cli/src/command.ts`
- `tools/pdf-omr-cli/src/__tests__/recognize-command.test.ts`
- `tools/pdf-omr-cli/README.md`

**Scope:** M

### Checkpoint B：First engine

```bash
pnpm --filter @zupulse/pdf-omr-cli test
pnpm --filter @zupulse/pdf-omr-cli typecheck
pnpm pdf-omr -- recognize <smoke.pdf> --engine audiveris --output <temp-dir>
pnpm format:check
git diff --check
```

通过条件：

- [ ] PDF → Draft 单命令可运行。
- [ ] cancel/crash/invalid output 经过测试。
- [ ] 三份 smoke Draft 经人工抽查。
- [ ] 未开始 App、Repository 或共享产品 API 工作。

## Phase 2：Validation、Harmony 与 MusicXML

### Task 10：实现 exact rational time 与 Draft validator

**Progress:** Completed on 2026-07-28. exact rational arithmetic 使用 safe integer/BigInt cross-product，
拒绝 zero denominator、overflow 与过大的 ticks LCM。validator 覆盖 meter/duration、voice overlap/gap、
chord duration、ties、staff alignment、source bounds，并分别计算 Harmony 与 MusicXML readiness。

**Goal:** 校验 measure duration、voice overlap、rests、ties、staff alignment 和 source bounds，并独立
计算 Harmony/MusicXML readiness。

**Acceptance criteria:**

- [ ] rational normalization、comparison、addition 与 safe LCM 有边界测试。
- [ ] Harmony-ready 不自动等于 MusicXML-ready。
- [ ] 不可精确转换的位置返回 blocking diagnostic，不做浮点近似。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/rational.test.ts
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/validate-draft.test.ts
```

**Dependencies:** Task 09

**Files:**

- `tools/pdf-omr-cli/src/rational.ts`
- `tools/pdf-omr-cli/src/validate-draft.ts`
- `tools/pdf-omr-cli/src/__tests__/rational.test.ts`
- `tools/pdf-omr-cli/src/__tests__/validate-draft.test.ts`

**Scope:** M

### Task 11：实现 Draft → `HarmonyAnalysisInput`

**Progress:** Completed on 2026-07-28. projection 以 AlphaTab 的 960 TPQ 为基线，只在 exact LCM
可安全表达时扩大 ticks，保留 measure、track、staff、voice、spelling、sounding pitch 与 tie。
与 current MusicXML projection 的核心 written-time/pitch facts 有对照测试，OMR confidence/diagnostics
不会变成 Harmony certainty。

**Goal:** 精确投影 measures、tracks、staves、voice、spelling、sounding pitch、tie 和 written time。

**Acceptance criteria:**

- [ ] ground-truth MusicXML 经当前 projection 与 Draft projection 得到相同核心 input。
- [ ] OMR diagnostics 不写入 Harmony confidence 或 segment status。
- [ ] unsafe ticks projection 明确失败。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/project-harmony.test.ts
```

**Dependencies:** Task 10

**Files:**

- `tools/pdf-omr-cli/src/project-harmony.ts`
- `tools/pdf-omr-cli/src/__tests__/project-harmony.test.ts`
- `tools/pdf-omr-cli/src/__tests__/fixtures/harmony-draft.json`

**Scope:** M

### Task 12：交付 `analyze` command

**Progress:** Completed on 2026-07-28. `analyze` 读取 strict Draft，先执行 Harmony readiness，再调用
production `analyzeHarmony`。artifact 分开记录 OMR engine provenance 与 bundled Harmony algorithm
version，并区分 invalid threshold、blocked Draft 和 analyzer failure。

**Goal:** 使用当前生产 `analyzeHarmony` 输出 versioned harmony artifact，同时保留 OMR readiness 和
diagnostics。

**Acceptance criteria:**

- [ ] 只接受 Harmony-ready Draft。
- [ ] OMR engine/model 与 Harmony algorithm version 独立记录。
- [ ] analyzer failure、Draft blocked 和 invalid threshold 使用不同 error code/context。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/analyze-command.test.ts
pnpm --filter @zupulse/harmony-cli test
pnpm pdf-omr -- analyze <draft.json> --output <harmony.json>
```

**Dependencies:** Task 11

**Files:**

- `tools/pdf-omr-cli/src/commands/analyze.ts`
- `tools/pdf-omr-cli/src/harmony-artifact.ts`
- `tools/pdf-omr-cli/src/command.ts`
- `tools/pdf-omr-cli/src/__tests__/analyze-command.test.ts`

**Scope:** M

### Task 13：实现首轮 MusicXML generator

**Progress:** Completed on 2026-07-28. generator 只接受 MusicXML-ready Draft，按 measure 计算 exact
`divisions`，支持 part/staff/measure/voice、notes/rests、chords、ties、tuplet ratios 与 repeats，并生成
deterministic plain MusicXML 或 MXL。缺失 required facts 和超出 divisions bound 时明确失败。

**Goal:** 从 MusicXML-ready Draft 生成 deterministic MusicXML，支持规格确定的最小 notation subset。

**Acceptance criteria:**

- [ ] part/staff/measure/voice/note/rest/tie/tuplet/repeat 有 positive fixtures。
- [ ] unresolved required facts 阻止生成，不写猜测默认值。
- [ ] 相同 Draft 生成相同 canonical bytes。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/generate-musicxml.test.ts
```

**Dependencies:** Task 10

**Files:**

- `tools/pdf-omr-cli/src/generate-musicxml.ts`
- `tools/pdf-omr-cli/src/musicxml-subset.ts`
- `tools/pdf-omr-cli/src/__tests__/generate-musicxml.test.ts`
- `tools/pdf-omr-cli/src/__tests__/fixtures/musicxml-ready-draft.json`

**Scope:** M

### Task 14：实现 Draft/MusicXML structural comparator

**Progress:** Completed on 2026-07-28. comparator 先通过 current `createMusicXmlAdapter` 独立记录
parse/view/playback，再回读为 Draft 比较 part/staff/measure/voice、pitch、onset、duration、tie、
tuplet 与 repeat。simultaneous event 顺序不影响结果，语义 drift 输出带 path 的 difference code。

**Goal:** 用当前 `createMusicXmlAdapter` 回读生成 bytes，并分别判断 parse、view、playback 和 structural
agreement。

**Acceptance criteria:**

- [ ] pitch、onset、duration、voice、staff、tie drift 可定位。
- [ ] parse success 不会自动记为 structural success。
- [ ] comparison 对输入顺序不敏感，但不隐藏语义差异。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/compare-drafts.test.ts
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/round-trip-musicxml.test.ts
```

**Dependencies:** Task 13

**Files:**

- `tools/pdf-omr-cli/src/compare-drafts.ts`
- `tools/pdf-omr-cli/src/round-trip-musicxml.ts`
- `tools/pdf-omr-cli/src/__tests__/compare-drafts.test.ts`
- `tools/pdf-omr-cli/src/__tests__/round-trip-musicxml.test.ts`

**Scope:** M

### Task 15：交付 `validate` 与 `export-musicxml`

**Progress:** Completed on 2026-07-28. `validate` 总是先写 canonical diagnostics/readiness artifact，
blocked Draft 随后返回 exit code 7；`export-musicxml` 生成 MXL 后必须通过 current adapter 与
structural comparator，mismatch 保存 report 并返回 exit code 8，且不会覆盖已有文件。Checkpoint C
的 `pnpm verify:fast` 已通过。

**Goal:** 暴露稳定 CLI commands，写 diagnostics、MXL 和 round-trip report。

**Acceptance criteria:**

- [ ] blocked Draft 的 validate 命令保存 diagnostics 并返回 exit code 7。
- [ ] structural mismatch 保存 round-trip report 并返回 exit code 8。
- [ ] success export 产生 MXL hash 和 current-adapter capability results。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/validate-command.test.ts
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/export-musicxml-command.test.ts
pnpm pdf-omr -- export-musicxml <draft.json> --output <score.mxl>
```

**Dependencies:** Tasks 10, 14

**Files:**

- `tools/pdf-omr-cli/src/commands/validate.ts`
- `tools/pdf-omr-cli/src/commands/export-musicxml.ts`
- `tools/pdf-omr-cli/src/command.ts`
- `tools/pdf-omr-cli/src/__tests__/validate-command.test.ts`
- `tools/pdf-omr-cli/src/__tests__/export-musicxml-command.test.ts`

**Scope:** M

### Checkpoint C：Useful CLI

```bash
pnpm --filter @zupulse/pdf-omr-cli test
pnpm --filter @zupulse/pdf-omr-cli typecheck
pnpm --filter @zupulse/harmony-cli test
pnpm format:check
git diff --check
pnpm verify:fast
```

通过条件：

- [ ] PDF → Draft → Harmony 可运行。
- [ ] Draft → MXL → current adapter round-trip 可运行。
- [ ] 两种 readiness 与两种 confidence 没有混用。
- [ ] 人工批准进入 corpus/benchmark 建设。

## Phase 3：Corpus 与 metrics

### Task 16：定义 corpus protocol 与 manifest verifier

**Progress:** Completed on 2026-07-28. strict manifest 固定 item/work/variant、split、category、input/ground
truth hashes 与 license metadata；work variants 跨 split 会机械失败。development view 只暴露 development
items 和 holdout count，holdout details 必须提供 frozen protocol SHA。

**Goal:** 定义 item、work ID、development/holdout、category、ground truth、hash 和 license schema，
机械阻止 work-level leakage。

**Acceptance criteria:**

- [ ] 同一 work 的 render/crop/scan 变体不能跨 split。
- [ ] missing hash、ground truth 或 license metadata 使验证失败。
- [ ] holdout item-level results 默认不可由 development command 输出。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/corpus.test.ts
```

**Dependencies:** Task 02

**Files:**

- `tools/pdf-omr-cli/src/benchmark/corpus.ts`
- `tools/pdf-omr-cli/src/benchmark/protocol.ts`
- `tools/pdf-omr-cli/src/__tests__/corpus.test.ts`
- `tools/pdf-omr-cli/corpus/manifest.example.json`

**Scope:** M

### Task 17：实现 symbolic alignment 与 metrics

**Progress:** Completed on 2026-07-28. multiset exact alignment 正确处理 chord、rests 和 duplicate
candidates；metrics 分开计算 pitch/onset/duration/joint、rest、staff、voice、tie、tuplet、repeat 与
valid-measure counts。aggregate 只累加 TP/FP/FN 后重算比例，不平均 item percentages。

**Goal:** 在 measure-local exact rational timeline 上匹配 notes，计算 pitch/onset/duration/joint F1、
valid measure 与 voice/staff/tie/tuplet/repeat 指标。

**Acceptance criteria:**

- [ ] matching policy 对 chord notes、rests、ties 和 duplicate candidates 有明确测试。
- [ ] metrics 在空集合、部分匹配和完全匹配下定义明确。
- [ ] item metrics 可无损聚合为 corpus/category metrics。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/symbolic-alignment.test.ts
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/symbolic-metrics.test.ts
```

**Dependencies:** Tasks 10, 16

**Files:**

- `tools/pdf-omr-cli/src/benchmark/symbolic-alignment.ts`
- `tools/pdf-omr-cli/src/benchmark/symbolic-metrics.ts`
- `tools/pdf-omr-cli/src/__tests__/symbolic-alignment.test.ts`
- `tools/pdf-omr-cli/src/__tests__/symbolic-metrics.test.ts`

**Scope:** M

### Task 18：实现 Harmony impact metrics

**Progress:** Completed on 2026-07-28. gold Draft 与 OMR Draft 使用同一 production analyzer 和 algorithm
version。interval overlap/boundary 直接复用 `@zupulse/harmony-cli` 既有 semantics；OMR blocked、
Harmony unresolved、unsupported gold 和 high-confidence wrong chord 分开统计。

**Goal:** 比较 OMR Draft 与 ground-truth MusicXML 进入同一生产 analyzer 后的 resolved precision、
coverage、boundary F1 与 false confident chord rate。

**Acceptance criteria:**

- [ ] OMR error + high-confidence resolved chord 被计入 false confident。
- [ ] OMR blocked、Harmony unresolved 和 unsupported gold 分开统计。
- [ ] metrics 复用现有 interval/boundary semantics，不能创造第二套含义。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/harmony-impact-metrics.test.ts
pnpm --filter @zupulse/harmony-cli test
```

**Dependencies:** Tasks 12, 16

**Files:**

- `tools/pdf-omr-cli/src/benchmark/harmony-impact-metrics.ts`
- `tools/pdf-omr-cli/src/benchmark/harmony-ground-truth.ts`
- `tools/pdf-omr-cli/src/__tests__/harmony-impact-metrics.test.ts`
- `tools/pdf-omr-cli/src/__tests__/fixtures/harmony-impact-cases.json`

**Scope:** M

### Task 19：实现 MusicXML、runtime 与 reproducibility metrics

**Progress:** Completed on 2026-07-28. capability rates 与 structural agreement 独立聚合，wall time/RSS
记录 p50/p95/max；GPU/cancel 数据不可用时省略。reproducibility 以 baseline 重复 run 计算 agreement，
mismatch 保留双方 run IDs 与 Draft hashes。

**Goal:** 计算 generation/parse/view/playback/structural rates、wall time、RSS、GPU memory when available、
cancel latency 和 repeated Draft hash agreement。

**Acceptance criteria:**

- [ ] capability rates 与 structural agreement 分开。
- [ ] unavailable GPU metric 省略，不写 `0`。
- [ ] repeated-run mismatch 保留两个 run IDs 和 hashes。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/runtime-metrics.test.ts
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/reproducibility-metrics.test.ts
```

**Dependencies:** Tasks 14, 16

**Files:**

- `tools/pdf-omr-cli/src/benchmark/runtime-metrics.ts`
- `tools/pdf-omr-cli/src/benchmark/reproducibility-metrics.ts`
- `tools/pdf-omr-cli/src/__tests__/runtime-metrics.test.ts`
- `tools/pdf-omr-cli/src/__tests__/reproducibility-metrics.test.ts`

**Scope:** M

### Task 20：交付 benchmark orchestrator 与 report

**Progress:** Completed on 2026-07-28. 按计划拆为 runner 与 report 两个 workstreams。orchestrator
验证 corpus bytes、隔离 item failure、保存 engine/Draft/item artifacts，并按 category/overall 聚合。
frozen holdout 使用规格中的八项 gate，先写完整 report 再返回 exit code 9；development 不评估 gate。
内置 synthetic smoke corpus 已通过实际 CLI benchmark，且 aggregate 可从 item artifacts 重建。

**Goal:** 对 manifest × engine × preprocess 运行 item jobs，保存 item artifacts，生成 overall/category
aggregates 并评估 gate。

**Acceptance criteria:**

- [ ] 单项 crash 不丢失其他 item 结果。
- [ ] gate failure 仍保存完整 report，并返回 exit code 9。
- [ ] aggregate 可从 item artifacts 重算得到相同 hash。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/benchmark-command.test.ts
pnpm benchmark:pdf-omr -- --manifest <smoke-manifest> --engine audiveris --output <temp-dir>
```

**Dependencies:** Tasks 16, 17, 18, 19

**Files:** 若超过 5 个文件，拆为 runner 与 report 两个任务。

- `tools/pdf-omr-cli/src/benchmark/run-benchmark.ts`
- `tools/pdf-omr-cli/src/benchmark/report.ts`
- `tools/pdf-omr-cli/src/commands/benchmark.ts`
- `tools/pdf-omr-cli/src/__tests__/benchmark-command.test.ts`
- `tools/pdf-omr-cli/README.md`

**Scope:** 2 × M after split

### Checkpoint D：Benchmark framework

```bash
pnpm --filter @zupulse/pdf-omr-cli test
pnpm --filter @zupulse/pdf-omr-cli typecheck
pnpm benchmark:pdf-omr -- --manifest <smoke-manifest> --engine audiveris --output <temp-dir>
pnpm format:check
git diff --check
```

通过条件：

- [ ] smoke corpus 可以产生 item、category 和 overall metrics。
- [ ] 结果可从 artifacts 重算。
- [ ] development/holdout policy 自动执行。

## Phase 4：第二引擎与冻结评测

### Task 21：选择 neural engine 和锁定环境

**Progress:** Completed on 2026-07-28. 三个候选均记录 code、weights、license 与 runtime
availability；Transcoda 59M 是唯一公开、非 gated、可锁 hash 且在评测机 MPS 实际运行的候选。
真实 smoke 成功完成推理，但重复 token 导致 native syntax 无效，因此选型只批准进入统一
development benchmark，不构成质量或 App 分发批准。

**Goal:** 依据可运行性、权重、许可证、输出能力和 smoke quality，从 LEGATO 1、LEGATO 2、Transcoda
中选择一个首轮 neural candidate。

**Acceptance criteria:**

- [ ] 三个候选都记录 code/weights/license/runtime availability。
- [ ] 被选候选可在评测机处理至少一份 smoke PDF。
- [ ] decision doc 给出唯一选择、model hash 和 environment bootstrap。

**Verification:**

```bash
pnpm exec prettier --check tools/pdf-omr-cli/docs/neural-engine-decision.md
git diff --check
```

**Dependencies:** Checkpoint D

**Files:**

- `tools/pdf-omr-cli/spikes/neural-engines.mts`
- `tools/pdf-omr-cli/docs/neural-engine-decision.md`
- `tools/pdf-omr-cli/engines/<engine>-environment.json`

**Scope:** M

### Task 22：实现 neural adapter 与 normalizer

**Progress:** Completed on 2026-07-28. engine contract 已改为 engine-neutral normalization bytes、
native artifacts、diagnostics 与 adapter-owned normalize；Audiveris 随同迁移。Transcoda adapter
锁定 repository/checkpoint，使用共用 runner 串联 PDF rasterize、MPS inference 与隔离 kern
converter。normalizer 只允许补齐无歧义 terminator；spine mismatch、multi-page 和 invalid
conversion 均为稳定失败。完整 package 26 test files / 91 tests 通过，真实 CLI 也验证了
`inconsistent-spine-count` 会返回 exit code 6。

**Goal:** 让所选 engine 通过共用 runner 输出相同 `OmrScoreDraft`，使用同一 validator 和 metrics。

**Acceptance criteria:**

- [ ] environment、model hash、decoder parameters 进入 run manifest。
- [ ] engine-native syntax 和 repair diagnostics 只存在于 adapter/normalizer。
- [ ] 三份 smoke PDF 可以生成 schema-valid Draft 或稳定失败。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/<engine>-adapter.test.ts
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/<engine>-normalizer.test.ts
```

**Dependencies:** Tasks 05, 10, 21

**Files:** 必须拆为 adapter 与 normalizer 两个 M tasks，各自不超过 5 个文件。

**Scope:** 2 × M

### Task 23：运行 development benchmark

**Progress:** Completed on 2026-07-28. 建立 work-level 隔离的 CC0 evaluation corpus，并用同一
manifest 实际运行 Audiveris 5.10.2 与锁定 Transcoda。Audiveris 3/3 process 成功且 Draft hash
可复现，但 joint F1/valid-measure 均为 0；Transcoda 3/3 在 native spine validation 稳定失败。
参数决策、被拒绝 variant 与 canonical aggregate reports 已记录。

**Goal:** 在 development split 比较 Audiveris、neural engine 与 preprocessing variants，定位主要失败
类别，但不读取 holdout item details。

**Acceptance criteria:**

- [ ] 所有组合使用同一 manifest、metrics 和 report schema。
- [ ] 每个主要 error category 有数量、比例和代表 artifact。
- [ ] 只允许预先声明的参数调整，所有调整进入 protocol history。

**Verification:**

```bash
pnpm benchmark:pdf-omr -- --manifest <manifest> --engine audiveris --output <dev-audiveris>
pnpm benchmark:pdf-omr -- --manifest <manifest> --engine <neural> --output <dev-neural>
```

**Dependencies:** Tasks 20, 22

**Files:**

- `tools/pdf-omr-cli/corpus/protocol.json`
- `tools/pdf-omr-cli/docs/evaluation.md`
- development aggregate reports；原始大 artifacts 不提交

**Scope:** S，运行时间另计。

### Task 24：冻结 holdout protocol

**Progress:** Completed on 2026-07-28. protocol 锁定 manifest SHA、benchmark commit、Audiveris
version、Transcoda code/model/parameters、preprocess 和八项 gate。holdout runner 读取 manifest
同目录 protocol，并机械拒绝 protocol hash、manifest hash、engine 或 preprocess mismatch。

**Goal:** 固定 corpus hashes、engine versions、model hashes、preprocess variants、parameters、gate 和
benchmark commit，不再按 holdout 结果调参。

**Acceptance criteria:**

- [ ] protocol manifest 对所有可变输入做 hash。
- [ ] holdout runner 拒绝未列入 protocol 的参数。
- [ ] development decisions 和 rejected variants 有记录。

**Verification:**

```bash
pnpm vitest run --root . tools/pdf-omr-cli/src/__tests__/benchmark-protocol.test.ts
pnpm exec prettier --check tools/pdf-omr-cli/docs/evaluation.md
```

**Dependencies:** Task 23

**Files:**

- `tools/pdf-omr-cli/corpus/protocol.json`
- `tools/pdf-omr-cli/src/benchmark/verify-protocol.ts`
- `tools/pdf-omr-cli/src/__tests__/benchmark-protocol.test.ts`
- `tools/pdf-omr-cli/docs/evaluation.md`

**Scope:** M

### Task 25：运行 holdout 并形成唯一决策

**Progress:** Completed on 2026-07-28. Audiveris 与 Transcoda 均用 frozen protocol 完成两个
holdout variants；两者先保存完整 canonical report，再因 gate failure 返回 exit code 9。actual
item artifacts 重算得到相同 report hashes。两份 report 的唯一 machine decision 均为 `STOP`：
当前路线不得进入 App discovery。人工签字仍保留为 Checkpoint E 的最后一步。

**Goal:** 运行冻结组合，生成可复现报告，并严格输出 `CONTINUE_TO_APP_DISCOVERY`、`INVESTIGATE` 或
`STOP`。

**Acceptance criteria:**

- [ ] canonical metrics 可以从记录的 item artifacts 重算。
- [ ] overall 与 category metrics、失败类别、资源和许可证状态完整。
- [ ] 报告不设计 App；若继续，只允许启动新的 App discovery/spec。

**Verification:**

```bash
pnpm benchmark:pdf-omr -- --manifest <manifest> --engine audiveris --output <holdout-audiveris>
pnpm benchmark:pdf-omr -- --manifest <manifest> --engine <neural> --output <holdout-neural>
pnpm --filter @zupulse/pdf-omr-cli test
pnpm --filter @zupulse/pdf-omr-cli typecheck
pnpm format:check
git diff --check
pnpm verify:fast
```

**Dependencies:** Task 24

**Files:**

- `docs/evaluation/pdf-omr.md`
- `tools/pdf-omr-cli/docs/evaluation.md`
- frozen aggregate reports；原始大 artifacts 不提交

**Scope:** M，运行与人工审阅时间另计。

### Checkpoint E：CLI phase complete

- [x] 两个 engine 在冻结 holdout 上完成评测。
- [x] 所有结果可追溯到 input、environment、model、parameters 和 artifacts。
- [ ] 唯一决策经过人工评审。
- [x] 没有修改 `apps/*`。
- [ ] 将耐久约束移入 CLI README/evaluation 后，删除本任务目录和完成的一次性 roadmap。

## 推荐阶段性提交

1. Tasks 01–03: `test: define pdf omr cli contracts`
2. Tasks 04–06: `feat: inspect pdf inputs for omr`
3. Tasks 07–09: `feat: add audiveris pdf omr slice`
4. Tasks 10–12: `feat: validate omr drafts and analyze harmony`
5. Tasks 13–15: `feat: export and round-trip omr musicxml`
6. Tasks 16–20: `feat: add reproducible pdf omr benchmark`
7. Tasks 21–22: `feat: compare a neural pdf omr engine`
8. Tasks 23–25: `docs: record pdf omr benchmark decision`

每个提交只包含对应任务与必要文档。提交前确认：

```bash
git status --short
pnpm format:check
git diff --check
```

## 计划验证

开始实现前检查：

- [x] 每个任务有验收条件。
- [x] 每个任务有验证命令。
- [x] 依赖顺序已明确。
- [x] 大任务已标记必须拆分。
- [x] 每 2–5 个任务有 checkpoint。
- [x] 用户已授权执行完整计划并允许阶段性 commit。
